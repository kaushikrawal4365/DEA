import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const num = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${num} ${sizes[i]}`;
}

/**
 * Fast streaming directory size calculation using fs.opendir.
 * Traverses entries without loading entire arrays into memory.
 */
export async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalBytes = 0;

  async function walk(current: string) {
    let dir;
    try {
      dir = await fs.opendir(current);
    } catch {
      return;
    }

    try {
      for await (const dirent of dir) {
        const fullPath = path.join(current, dirent.name);

        if (dirent.isDirectory()) {
          // Avoid following circular symlinks
          if (!dirent.isSymbolicLink()) {
            await walk(fullPath);
          }
        } else if (dirent.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            totalBytes += stat.size;
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Ignored
    }
  }

  await walk(dirPath);
  return totalBytes;
}
