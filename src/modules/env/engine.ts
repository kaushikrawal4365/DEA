import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import { parseEnvContent } from './env-file-parser.js';
import { defaultScanners, getScannerForFile } from './scanners/index.js';
import { defaultSecretRules, scanContentForSecrets } from './secret-scanner.js';
import type {
  DiscoveredEnvVar,
  EnvCheckReport,
  EnvScanner,
  ParsedEnvFile,
  SecretFinding,
  SecretRule,
  SecretScanReport
} from './types.js';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  '__pycache__',
  '.idea',
  '.vscode'
]);

export interface EnvEngineOptions {
  readonly scanners?: readonly EnvScanner[];
  readonly secretRules?: readonly SecretRule[];
  readonly ignoreDirs?: ReadonlySet<string>;
}

export async function checkEnvironment(
  targetDir: string,
  options: EnvEngineOptions = {}
): Promise<Result<EnvCheckReport, Error>> {
  try {
    const scanners = options.scanners ?? defaultScanners;
    const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;

    // 1. Discover all candidate files
    const allFiles = await walkDirectory(targetDir, ignoreDirs);

    // 2. Discover and parse .env and .env.example files
    const envFiles: ParsedEnvFile[] = [];
    let exampleFile: ParsedEnvFile | undefined;

    for (const file of allFiles) {
      const baseName = path.basename(file);
      if (baseName === '.env.example' || baseName === '.env.template') {
        const content = await fs.readFile(file, 'utf-8');
        const parsed = parseEnvContent(content, file);
        if (parsed._tag === 'Ok') {
          exampleFile = parsed.value;
        }
      } else if (baseName === '.env' || baseName.startsWith('.env.')) {
        const content = await fs.readFile(file, 'utf-8');
        const parsed = parseEnvContent(content, file);
        if (parsed._tag === 'Ok') {
          envFiles.push(parsed.value);
        }
      }
    }

    // 3. Scan code files for env accesses
    const usedVariables: DiscoveredEnvVar[] = [];

    for (const file of allFiles) {
      const scanner = getScannerForFile(file, scanners);
      if (scanner) {
        const content = await fs.readFile(file, 'utf-8');
        const discovered = scanner.scan(file, content);
        usedVariables.push(...discovered);
      }
    }

    // 4. Combine all defined variables across all .env files found
    const definedInEnv = new Set<string>();
    for (const envFile of envFiles) {
      for (const key of envFile.variables.keys()) {
        definedInEnv.add(key);
      }
    }

    const definedInExample = new Set<string>();
    if (exampleFile) {
      for (const key of exampleFile.variables.keys()) {
        definedInExample.add(key);
      }
    }

    // 5. Group used variables by name
    const usagesByName = new Map<string, DiscoveredEnvVar[]>();
    for (const usage of usedVariables) {
      const list = usagesByName.get(usage.name) ?? [];
      list.push(usage);
      usagesByName.set(usage.name, list);
    }

    // 6. Calculate missing from .env
    const missingFromEnv: Array<{
      name: string;
      usages: DiscoveredEnvVar[];
      hasFallback: boolean;
    }> = [];

    if (envFiles.length > 0) {
      for (const [name, usages] of usagesByName.entries()) {
        if (!definedInEnv.has(name)) {
          const allHaveFallback = usages.every(u => u.hasFallback);
          missingFromEnv.push({
            name,
            usages,
            hasFallback: allHaveFallback
          });
        }
      }
    }

    // 7. Calculate missing from .env.example
    const missingFromExample: string[] = [];
    if (exampleFile) {
      for (const name of usagesByName.keys()) {
        if (!definedInExample.has(name)) {
          missingFromExample.push(name);
        }
      }
    }

    // 8. Calculate unused variables in .env
    const unusedInEnv: string[] = [];
    for (const definedKey of definedInEnv) {
      if (!usagesByName.has(definedKey)) {
        unusedInEnv.push(definedKey);
      }
    }

    const isClean = missingFromEnv.filter(m => !m.hasFallback).length === 0;

    return ok({
      targetDir,
      usedVariables,
      missingFromEnv,
      missingFromExample,
      unusedInEnv,
      envFilesFound: envFiles.map(f => f.filePath),
      isClean
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

export async function scanSecrets(
  targetDir: string,
  options: EnvEngineOptions = {}
): Promise<Result<SecretScanReport, Error>> {
  try {
    const rules = options.secretRules ?? defaultSecretRules;
    const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;

    const allFiles = await walkDirectory(targetDir, ignoreDirs);
    const findings: SecretFinding[] = [];
    let filesScanned = 0;

    for (const file of allFiles) {
      // Skip binary, lock, and minified files
      if (isIgnoredFile(file)) {
        continue;
      }

      filesScanned++;
      const content = await fs.readFile(file, 'utf-8');
      const fileFindings = scanContentForSecrets(file, content, rules);
      findings.push(...fileFindings);
    }

    return ok({
      targetDir,
      filesScanned,
      findings,
      isClean: findings.length === 0
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

async function walkDirectory(dir: string, ignoreDirs: ReadonlySet<string>): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

function isIgnoredFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.lock') ||
    lower.endsWith('-lock.json') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.ttf') ||
    lower.endsWith('.eot') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.tar') ||
    lower.endsWith('.gz') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.map') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css')
  );
}
