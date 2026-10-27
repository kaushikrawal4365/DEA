import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen
} from '../../src/core/result.js';

describe('Result algebra', () => {
  it('creates Ok results', () => {
    const res = ok(42);
    expect(isOk(res)).toBe(true);
    expect(isErr(res)).toBe(false);
    expect(unwrap(res)).toBe(42);
  });

  it('creates Err results', () => {
    const res = err(new Error('failure'));
    expect(isOk(res)).toBe(false);
    expect(isErr(res)).toBe(true);
    expect(unwrapOr(res, 100)).toBe(100);
  });

  it('maps Ok values', () => {
    const res = ok(10);
    const mapped = map(res, n => n * 2);
    expect(unwrap(mapped)).toBe(20);
  });

  it('does not map Err values', () => {
    const res = err('err');
    const mapped = map(res, (n: number) => n * 2);
    expect(isErr(mapped)).toBe(true);
  });

  it('maps Err values via mapErr', () => {
    const res = err('foo');
    const mapped = mapErr(res, s => s.toUpperCase());
    if (isErr(mapped)) {
      expect(mapped.error).toBe('FOO');
    }
  });

  it('chains with andThen', () => {
    const fn = (n: number) => (n > 0 ? ok(n * 10) : err('must be positive'));
    expect(unwrap(andThen(ok(5), fn))).toBe(50);
    expect(isErr(andThen(ok(-5), fn))).toBe(true);
  });
});
