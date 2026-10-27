import { describe, it, expect } from 'vitest';
import { normalizePath, relativeDisplay, isSubpath } from '../../src/core/path.js';

describe('Path utilities', () => {
  it('normalizes backslashes to forward slashes', () => {
    expect(normalizePath('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  it('computes clean relative display paths', () => {
    expect(relativeDisplay('/root/dir', '/root/dir/file.txt')).toBe('file.txt');
    expect(relativeDisplay('/root/dir', '/root/dir')).toBe('.');
  });

  it('checks if a path is a subpath safely', () => {
    expect(isSubpath('/project', '/project/src/index.ts')).toBe(true);
    expect(isSubpath('/project', '/other/file.ts')).toBe(false);
  });
});
