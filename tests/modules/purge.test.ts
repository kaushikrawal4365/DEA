import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatBytes, calculateDirectorySize } from '../../src/modules/purge/size-calculator.js';
import { safeDeleteDirectory } from '../../src/modules/purge/safe-delete.js';
import { scanForPurgeTargets, executePurge } from '../../src/modules/purge/engine.js';
import { isOk, unwrap } from '../../src/core/result.js';

describe('Size Calculator', () => {
  it('formats bytes into human readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
  });
});

describe('Safe Deletion Engine', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dea-safe-del-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  it('safely deletes a directory and reports reclaimed bytes', async () => {
    const subFolder = path.join(tmpDir, 'node_modules');
    await fs.mkdir(subFolder, { recursive: true });
    await fs.writeFile(path.join(subFolder, 'test.js'), 'console.log("hello");');

    const size = await calculateDirectorySize(subFolder);
    expect(size).toBeGreaterThan(0);

    const res = await safeDeleteDirectory(subFolder, size);
    expect(isOk(res)).toBe(true);

    const report = unwrap(res);
    expect(report.bytesReclaimed).toBe(size);
    expect(report.lockedItems).toHaveLength(0);

    // Verify directory is deleted
    await expect(fs.stat(subFolder)).rejects.toThrow();
  });
});

describe('Purge Engine & Target Discovery', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dea-engine-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(rootDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  it('discovers Node.js node_modules and verifies manifest re-installability', async () => {
    const projectDir = path.join(rootDir, 'my-app');
    const nodeModulesDir = path.join(projectDir, 'node_modules');
    await fs.mkdir(nodeModulesDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'package.json'), '{"name": "my-app"}');
    await fs.writeFile(path.join(nodeModulesDir, 'package.js'), 'export default {};');

    const scanRes = await scanForPurgeTargets(rootDir);
    expect(isOk(scanRes)).toBe(true);

    const scanReport = unwrap(scanRes);
    expect(scanReport.targets).toHaveLength(1);

    const target = scanReport.targets[0]!;
    expect(target.name).toBe('node_modules');
    expect(target.canRegenerate).toBe(true);
    expect(target.manifestFile).toBe('package.json');
    expect(target.sizeBytes).toBeGreaterThan(0);

    // Test Dry-run execution
    const dryRunRes = await executePurge(scanReport.targets, { dryRun: true });
    expect(isOk(dryRunRes)).toBe(true);
    expect(unwrap(dryRunRes).isDryRun).toBe(true);
    // Target still exists after dry-run
    const statAfterDry = await fs.stat(nodeModulesDir);
    expect(statAfterDry.isDirectory()).toBe(true);

    // Test Live purge
    const livePurgeRes = await executePurge(scanReport.targets, { dryRun: false });
    expect(isOk(livePurgeRes)).toBe(true);
    expect(unwrap(livePurgeRes).totalReclaimedBytes).toBeGreaterThan(0);

    // Target deleted
    await expect(fs.stat(nodeModulesDir)).rejects.toThrow();
    // Project source files untouched!
    const pkgStat = await fs.stat(path.join(projectDir, 'package.json'));
    expect(pkgStat.isFile()).toBe(true);
  });

  it('discovers custom-named virtualenvs (e.g. mvenv) using internal structural signatures', async () => {
    const projectDir = path.join(rootDir, 'python-app');
    const customVenvDir = path.join(projectDir, 'mvenv');
    await fs.mkdir(customVenvDir, { recursive: true });
    await fs.writeFile(
      path.join(customVenvDir, 'pyvenv.cfg'),
      'home = /usr/bin\nversion = 3.11.0\n'
    );
    await fs.writeFile(path.join(customVenvDir, 'dummy_lib.py'), 'print("test")');
    await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'numpy>=1.20.0\n');

    const scanRes = await scanForPurgeTargets(rootDir);
    expect(isOk(scanRes)).toBe(true);

    const scanReport = unwrap(scanRes);
    const venvTarget = scanReport.targets.find(t => t.path === customVenvDir);
    expect(venvTarget).toBeDefined();
    expect(venvTarget?.pluginName).toBe('python');
    expect(venvTarget?.canRegenerate).toBe(true);
    expect(venvTarget?.manifestFile).toBe('requirements.txt');
  });

  it('safely skips DEA self-installation files during purge sweeps', async () => {
    const deaRoot = path.resolve(__dirname, '../../');
    const scanRes = await scanForPurgeTargets(deaRoot, { allowSelfPurge: false });
    expect(isOk(scanRes)).toBe(true);

    const report = unwrap(scanRes);
    const selfModules = report.targets.find(t => t.path === path.join(deaRoot, 'node_modules'));
    expect(selfModules).toBeUndefined();
  });
});
