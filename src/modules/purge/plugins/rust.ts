import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PurgePlugin, PurgeTarget } from '../types.js';
import { calculateDirectorySize, formatBytes } from '../size-calculator.js';
import { evaluateDormancy } from '../dormancy.js';

export const rustPlugin: PurgePlugin = {
  name: 'rust',
  targetDirNames: ['target'],

  async detect(projectDir: string, targetName: string): Promise<PurgeTarget | null> {
    if (targetName !== 'target') {
      return null;
    }

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

    // Re-installability guarantee: must have Cargo.toml
    const cargoTomlPath = path.join(projectDir, 'Cargo.toml');
    let canRegenerate = false;
    try {
      const cargoStat = await fs.stat(cargoTomlPath);
      canRegenerate = cargoStat.isFile();
    } catch {
      canRegenerate = false;
    }

    // If no Cargo.toml, target/ could be an arbitrary user folder!
    if (!canRegenerate) {
      return null;
    }

    // Calculate size and dormancy
    const sizeBytes = await calculateDirectorySize(targetPath);
    if (sizeBytes === 0) {
      return null;
    }

    const dormancy = await evaluateDormancy(projectDir);
    const projectName = path.basename(projectDir);

    return {
      id: `rust:${targetPath}`,
      name: targetName,
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
      canRegenerate: true,
      manifestFile: 'Cargo.toml',
      pluginName: 'rust'
    };
  }
};
