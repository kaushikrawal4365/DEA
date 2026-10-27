import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PurgePlugin, PurgeTarget } from '../types.js';
import { calculateDirectorySize, formatBytes } from '../size-calculator.js';
import { evaluateDormancy } from '../dormancy.js';

export const nodePlugin: PurgePlugin = {
  name: 'node',
  targetDirNames: ['node_modules', '.next', '.nuxt', '.turbo', '.svelte-kit', '.parcel-cache'],

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

    // Re-installability guarantee: must have package.json
    const packageJsonPath = path.join(projectDir, 'package.json');
    let canRegenerate = false;
    try {
      const pkgStat = await fs.stat(packageJsonPath);
      canRegenerate = pkgStat.isFile();
    } catch {
      canRegenerate = false;
    }

    // Calculate size and dormancy
    const sizeBytes = await calculateDirectorySize(targetPath);
    if (sizeBytes === 0) {
      return null;
    }

    const dormancy = await evaluateDormancy(projectDir);
    const projectName = path.basename(projectDir);

    return {
      id: `node:${targetPath}`,
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
      canRegenerate,
      manifestFile: canRegenerate ? 'package.json' : undefined,
      pluginName: 'node'
    };
  }
};
