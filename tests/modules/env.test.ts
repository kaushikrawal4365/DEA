import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { describe, it, expect } from 'vitest';
import { parseEnvContent } from '../../src/modules/env/env-file-parser.js';
import { tsJsScanner } from '../../src/modules/env/scanners/ts-js.js';
import { pythonScanner } from '../../src/modules/env/scanners/python.js';
import { scanContentForSecrets, redactSecret } from '../../src/modules/env/secret-scanner.js';
import { checkEnvironment, scanSecrets } from '../../src/modules/env/engine.js';
import { isOk, unwrap } from '../../src/core/result.js';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/env');

// Construct dummy keys dynamically so GitHub Push Protection doesn't trip on test files
const DUMMY_STRIPE = ['sk', 'live', '1234567890abcdef12345678'].join('_');
const DUMMY_AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

describe('Env File Parser', () => {
  it('parses environment variables with comments and quotes', () => {
    const raw = `
      # Header comment
      PORT=3000 # inline comment
      DATABASE_URL="postgres://user:pass@host/db"
      export API_SECRET='single-quoted'
      EMPTY_VAL=
    `;
    const res = parseEnvContent(raw, '.env');
    expect(isOk(res)).toBe(true);

    const parsed = unwrap(res);
    expect(parsed.variables.get('PORT')?.value).toBe('3000');
    expect(parsed.variables.get('DATABASE_URL')?.value).toBe('postgres://user:pass@host/db');
    expect(parsed.variables.get('API_SECRET')?.value).toBe('single-quoted');
    expect(parsed.variables.get('EMPTY_VAL')?.value).toBe('');
    expect(parsed.variables.get('EMPTY_VAL')?.hasValue).toBe(false);
  });
});

describe('Language Scanners', () => {
  it('discovers TypeScript environment variable accesses and respects fallbacks', () => {
    const code = `
      const a = process.env.REQUIRED_VAR;
      const b = process.env.OPTIONAL_VAR || 'default';
      const c = import.meta.env.VITE_CUSTOM;
      // const d = process.env.IGNORED_IN_COMMENT;
    `;
    const vars = tsJsScanner.scan('test.ts', code);
    expect(vars).toHaveLength(3);

    const req = vars.find(v => v.name === 'REQUIRED_VAR');
    expect(req?.hasFallback).toBe(false);

    const opt = vars.find(v => v.name === 'OPTIONAL_VAR');
    expect(opt?.hasFallback).toBe(true);

    const vite = vars.find(v => v.name === 'VITE_CUSTOM');
    expect(vite?.hasFallback).toBe(false);
  });

  it('discovers Python environment variable accesses', () => {
    const code = `
      x = os.environ['DB_HOST']
      y = os.getenv('TIMEOUT', '10')
      # z = os.environ['COMMENTED']
    `;
    const vars = pythonScanner.scan('test.py', code);
    expect(vars).toHaveLength(2);

    expect(vars[0]?.name).toBe('DB_HOST');
    expect(vars[0]?.hasFallback).toBe(false);

    expect(vars[1]?.name).toBe('TIMEOUT');
    expect(vars[1]?.hasFallback).toBe(true);
  });
});

describe('Secret Scanner', () => {
  it('redacts secrets properly', () => {
    expect(redactSecret(DUMMY_STRIPE)).toBe('sk_l...5678');
    expect(redactSecret('short')).toBe('***');
  });

  it('detects live Stripe and AWS keys', () => {
    const code = `
      const stripe = '${DUMMY_STRIPE}';
      const aws = '${DUMMY_AWS}';
    `;
    const findings = scanContentForSecrets('auth.ts', code);
    expect(findings).toHaveLength(2);
    expect(findings.some(f => f.ruleId === 'stripe-secret-key')).toBe(true);
    expect(findings.some(f => f.ruleId === 'aws-access-key')).toBe(true);
  });
});

describe('End-to-End Environment Check', () => {
  it('accurately identifies missing, unused, and example drift', async () => {
    const res = await checkEnvironment(FIXTURES_DIR);
    expect(isOk(res)).toBe(true);

    const report = unwrap(res);
    expect(report.isClean).toBe(false);

    // Missing from .env
    const missingNames = report.missingFromEnv.map(m => m.name);
    expect(missingNames).toContain('VITE_API_KEY');
    expect(missingNames).toContain('AWS_REGION');

    // Unused in .env
    expect(report.unusedInEnv).toContain('UNUSED_VARIABLE');

    // Missing from .env.example
    expect(report.missingFromExample).toContain('VITE_API_KEY');
    expect(report.missingFromExample).toContain('AWS_REGION');
  });

  it('detects secrets in a temporary test directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dea-secret-test-'));
    try {
      const filePath = path.join(tmpDir, 'auth_service.ts');
      await fs.writeFile(
        filePath,
        `export const key = '${DUMMY_STRIPE}';\nexport const aws = '${DUMMY_AWS}';`
      );

      const res = await scanSecrets(tmpDir);
      expect(isOk(res)).toBe(true);

      const report = unwrap(res);
      expect(report.isClean).toBe(false);
      expect(report.findings).toHaveLength(2);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
