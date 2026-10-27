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
  const normParent = process.platform === 'win32' ? parent.toLowerCase() : parent;
  const normChild = process.platform === 'win32' ? child.toLowerCase() : child;
  const rel = path.relative(normParent, normChild);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function isSameOrSubpath(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  if (process.platform === 'win32') {
    if (p.toLowerCase() === c.toLowerCase()) return true;
    return isSubpath(p, c);
  }
  if (p === c) return true;
  return isSubpath(p, c);
}
