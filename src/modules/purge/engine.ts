import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import { defaultPurgePlugins } from './plugins/index.js';
import { safeDeleteDirectory } from './safe-delete.js';
import { formatBytes } from './size-calculator.js';
import type {
  PurgeExecutionReport,
  PurgeFinalReport,
  PurgePlugin,
  PurgeScanReport,
  PurgeTarget
} from './types.js';

export interface PurgeScanOptions {
  readonly plugins?: readonly PurgePlugin[];
  readonly maxDepth?: number;
  readonly dormantOnly?: boolean;
  readonly dormantThresholdDays?: number;
}

export interface PurgeExecuteOptions {
  readonly dryRun?: boolean;
}

// Ignore internal version-control and library directories from recursive purge sweeps
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.svn',
  '.hg',
  'site-packages',
  'System Volume Information',
  '$RECYCLE.BIN'
]);

export async function scanForPurgeTargets(
  rootDir: string,
  options: PurgeScanOptions = {}
): Promise<Result<PurgeScanReport, Error>> {
  try {
    const plugins = options.plugins ?? defaultPurgePlugins;
    const maxDepth = options.maxDepth ?? 5;
    const dormantOnly = options.dormantOnly ?? false;

    // Collect all candidate target names from active plugins
    const targetMap = new Map<string, PurgePlugin>();
    for (const plugin of plugins) {
      for (const name of plugin.targetDirNames) {
        targetMap.set(name, plugin);
      }
    }

    const targets: PurgeTarget[] = [];
    const resolvedRoot = path.resolve(rootDir);

    async function walk(currentDir: string, currentDepth: number) {
      if (currentDepth > maxDepth) {
        return;
      }

      let entries;
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return; // Ignore inaccessible directories
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }

        // Check 1: Direct name match (e.g. node_modules, target, .venv)
        let plugin = targetMap.get(entry.name);

        // Check 2: Custom-named virtualenv (has pyvenv.cfg inside)
        if (!plugin) {
          const hasPyvenvCfg = await checkHasPyvenvCfg(path.join(currentDir, entry.name));
          if (hasPyvenvCfg) {
            plugin = plugins.find(p => p.name === 'python');
          }
        }

        if (plugin) {
          // Found a potential purge target!
          const target = await plugin.detect(currentDir, entry.name);
          if (target) {
            if (!dormantOnly || target.isDormant) {
              targets.push(target);
            }
            // Do NOT recurse into the purge target folder
            continue;
          }
        }

        // Recurse into child directory
        await walk(path.join(currentDir, entry.name), currentDepth + 1);
      }
    }

    await walk(resolvedRoot, 0);

    const totalReclaimableBytes = targets.reduce((sum, t) => sum + t.sizeBytes, 0);
    const dormantCount = targets.filter(t => t.isDormant).length;

    return ok({
      targetDir: resolvedRoot,
      targets,
      totalReclaimableBytes,
      formattedTotalSize: formatBytes(totalReclaimableBytes),
      dormantCount
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

async function checkHasPyvenvCfg(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dirPath, 'pyvenv.cfg'));
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function executePurge(
  targets: readonly PurgeTarget[],
  options: PurgeExecuteOptions = {}
): Promise<Result<PurgeFinalReport, Error>> {
  const isDryRun = options.dryRun ?? false;
  const executed: PurgeExecutionReport[] = [];
  let totalReclaimedBytes = 0;

  for (const target of targets) {
    if (isDryRun) {
      executed.push({
        target,
        success: true,
        bytesReclaimed: target.sizeBytes,
        lockedItems: []
      });
      totalReclaimedBytes += target.sizeBytes;
      continue;
    }

    const delRes = await safeDeleteDirectory(target.path, target.sizeBytes);
    if (delRes._tag === 'Ok') {
      const reclaimed = delRes.value.bytesReclaimed;
      totalReclaimedBytes += reclaimed;
      executed.push({
        target,
        success: delRes.value.lockedItems.length === 0,
        bytesReclaimed: reclaimed,
        lockedItems: delRes.value.lockedItems
      });
    } else {
      executed.push({
        target,
        success: false,
        bytesReclaimed: 0,
        lockedItems: [],
        error: delRes.error.message
      });
    }
  }

  const scanReport: PurgeScanReport = {
    targetDir: targets[0]?.projectPath ?? '.',
    targets,
    totalReclaimableBytes: targets.reduce((sum, t) => sum + t.sizeBytes, 0),
    formattedTotalSize: formatBytes(targets.reduce((sum, t) => sum + t.sizeBytes, 0)),
    dormantCount: targets.filter(t => t.isDormant).length
  };

  return ok({
    scanReport,
    executed,
    totalReclaimedBytes,
    formattedReclaimedSize: formatBytes(totalReclaimedBytes),
    isDryRun
  });
}
