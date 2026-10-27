import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import type { LockedItem } from './types.js';

export interface SafeDeleteResult {
  readonly bytesReclaimed: number;
  readonly lockedItems: readonly LockedItem[];
}

/**
 * Safely removes a directory with Windows long path support (\\?\),
 * retry logic, and EBUSY/EPERM error boundary resilience.
 */
export async function safeDeleteDirectory(
  targetPath: string,
  totalEstimatedBytes: number = 0
): Promise<Result<SafeDeleteResult, Error>> {
  const lockedItems: LockedItem[] = [];
  const normalizedPath = toLongPath(path.resolve(targetPath));

  // Verify path exists
  try {
    const stat = await fs.stat(normalizedPath);
    if (!stat.isDirectory()) {
      return err(new Error(`Target is not a directory: ${targetPath}`));
    }
  } catch (e: unknown) {
    return err(new Error(`Target path does not exist: ${targetPath} (${String(e)})`));
  }

  // Attempt fast recursive removal first (with 3 retries)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fs.rm(normalizedPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 150
      });
      return ok({
        bytesReclaimed: totalEstimatedBytes,
        lockedItems: []
      });
    } catch {
      if (attempt === 3) {
        // Fall back to item-by-item removal to salvage partial cleanup
        const fallbackRes = await deleteItemByItem(normalizedPath);
        return ok(fallbackRes);
      }
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }

  return ok({
    bytesReclaimed: 0,
    lockedItems
  });
}

async function deleteItemByItem(current: string): Promise<SafeDeleteResult> {
  let bytesReclaimed = 0;
  const lockedItems: LockedItem[] = [];

  async function walkAndRemove(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e: unknown) {
      lockedItems.push({ path: dir, reason: String(e) });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkAndRemove(fullPath);
        try {
          await fs.rmdir(fullPath);
        } catch (e: unknown) {
          lockedItems.push({ path: fullPath, reason: String(e) });
        }
      } else {
        try {
          const stat = await fs.stat(fullPath);
          await fs.unlink(fullPath);
          bytesReclaimed += stat.size;
        } catch (e: unknown) {
          lockedItems.push({ path: fullPath, reason: String(e) });
        }
      }
    }
  }

  await walkAndRemove(current);

  // Attempt to remove root dir
  try {
    await fs.rmdir(current);
  } catch {
    // Root couldn't be deleted if locked items remained
  }

  return { bytesReclaimed, lockedItems };
}

function toLongPath(p: string): string {
  if (process.platform === 'win32' && !p.startsWith('\\\\?\\') && path.isAbsolute(p)) {
    return `\\\\?\\${p}`;
  }
  return p;
}
