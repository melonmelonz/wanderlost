// src/game/rng.test.ts
import { describe, it, expect } from 'bun:test';
import { xmur3, mulberry32, chunkRng, randInt, pick } from './rng';

describe('rng', () => {
  it('mulberry32 is deterministic for same seed', () => {
    const a = mulberry32(12345), b = mulberry32(12345);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('produces floats in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('xmur3 yields a stable hash for the same string', () => {
    expect(xmur3('hello')()).toBe(xmur3('hello')());
    expect(xmur3('hello')()).not.toBe(xmur3('world')());
  });

  it('chunkRng is stable per (seed,cx,cy)', () => {
    const a = chunkRng(999, 3, -5), b = chunkRng(999, 3, -5);
    expect(a()).toBe(b());
    const c = chunkRng(999, 3, -4)();
    expect(chunkRng(999, 3, -5)()).not.toBe(c);
  });

  it('randInt stays within [min,max]', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('pick returns an element of the array', () => {
    const r = mulberry32(1);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(r, arr));
  });
});
