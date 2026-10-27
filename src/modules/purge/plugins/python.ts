import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PurgePlugin, PurgeTarget } from '../types.js';
import { calculateDirectorySize, formatBytes } from '../size-calculator.js';
import { evaluateDormancy } from '../dormancy.js';

export const pythonPlugin: PurgePlugin = {
  name: 'python',
  targetDirNames: ['.venv', 'venv', 'env', '__pycache__'],

  async detect(projectDir: string, targetName: string): Promise<PurgeTarget | null> {
    const targetPath = path.join(projectDir, targetName);

    // Verify target exists and is a directory
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const isPycache = targetName === '__pycache__';
    const isVirtualEnv = await verifyVirtualEnvSignature(targetPath);

    // Must be either a verified virtual environment OR __pycache__
    if (!isPycache && !isVirtualEnv) {
      return null;
    }

    // Re-installability guarantee: check for python manifest
    const manifestFile = isPycache ? 'bytecode' : await findPythonManifest(projectDir);
    const canRegenerate = manifestFile !== undefined;

    // Calculate size and dormancy
    const sizeBytes = await calculateDirectorySize(targetPath);
    if (sizeBytes === 0) {
      return null;
    }

    const dormancy = await evaluateDormancy(projectDir);
    const projectName = path.basename(projectDir);

    return {
      id: `python:${targetPath}`,
      name: isVirtualEnv ? `${targetName} (venv)` : targetName,
      path: targetPath,
      projectPath: projectDir,
      projectName,
      sizeBytes,
      formattedSize: formatBytes(sizeBytes),
      latestActivityMs: dormancy.latestActivityMs,
      dormancyDays: dormancy.dormancyDays,
      isDormant: dormancy.isDormant,
      isGitRepo: dormancy.isGitRepo,
      gitClean: dormancy.gitClean,
      hasUnpushedCommits: dormancy.hasUnpushedCommits,
      canRegenerate,
      manifestFile,
      pluginName: 'python'
    };
  }
};

async function verifyVirtualEnvSignature(dirPath: string): Promise<boolean> {
  // Check 1: pyvenv.cfg
  try {
    const cfg = await fs.stat(path.join(dirPath, 'pyvenv.cfg'));
    if (cfg.isFile()) return true;
  } catch {
    // Continue
  }

  // Check 2: Scripts (Windows) or bin (POSIX)
  try {
    const binStat = await fs.stat(
      path.join(dirPath, process.platform === 'win32' ? 'Scripts' : 'bin')
    );
    if (binStat.isDirectory()) return true;
  } catch {
    // Continue
  }

  return false;
}

async function findPythonManifest(projectDir: string): Promise<string | undefined> {
  const manifests = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py'];
  for (const m of manifests) {
    try {
      const stat = await fs.stat(path.join(projectDir, m));
      if (stat.isFile()) return m;
    } catch {
      // Continue
    }
  }
  return undefined;
}
