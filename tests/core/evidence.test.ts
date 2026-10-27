import { describe, it, expect } from 'vitest';
import { observe, derive, infer, unknown } from '../../src/core/evidence.js';

describe('Evidence system', () => {
  it('creates observations', () => {
    const obs = observe('file exists', { size: 1024 }, 'fs.stat');
    expect(obs.kind).toBe('observation');
    expect(obs.description).toBe('file exists');
    expect(obs.data).toEqual({ size: 1024 });
    expect(obs.source).toBe('fs.stat');
  });

  it('creates derivations', () => {
    const d = derive('parsed 5 env variables', ['A', 'B']);
    expect(d.kind).toBe('derivation');
    expect(d.data).toEqual(['A', 'B']);
  });

  it('clamps inference confidence between 0 and 1', () => {
    const inf = infer('likely port conflict', 1.5, { port: 3000 });
    expect(inf.kind).toBe('inference');
    expect(inf.confidence).toBe(1.0);
  });

  it('creates unknowns', () => {
    const u = unknown('unrecognized stacktrace format');
    expect(u.kind).toBe('unknown');
  });
});
