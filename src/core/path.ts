import * as path from 'node:path';

/**
 * Cross-platform path normalization and verification primitives.
 */

export function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/');
}

export function toNativePath(p: string): string {
  return path.resolve(p);
}

export function relativeDisplay(from: string, to: string): string {
  const rel = path.relative(from, to);
  return rel.length === 0 ? '.' : normalizePath(rel);
}

export function isSubpath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
