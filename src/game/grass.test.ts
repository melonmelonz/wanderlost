// src/game/grass.test.ts
import { describe, it, expect } from 'bun:test';
import { rollReveal, GrassState } from './grass';

describe('rollReveal', () => {
  it('is deterministic per (seed,tx,ty)', () => {
    expect(rollReveal(5, 10, 20)).toEqual(rollReveal(5, 10, 20));
  });
  it('returns a collectible number, "note", or null', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const r = rollReveal(1, i, 0);
      seen.add(r === null ? 'null' : typeof r === 'number' ? 'num' : r);
    }
    expect(seen.has('null')).toBe(true);
    expect(seen.has('num')).toBe(true);
  });
  it('collectible types stay within 1..7', () => {
    for (let i = 0; i < 5000; i++) {
      const r = rollReveal(2, i, i);
      if (typeof r === 'number') { expect(r).toBeGreaterThanOrEqual(1); expect(r).toBeLessThanOrEqual(7); }
    }
  });
});

describe('GrassState', () => {
  it('tracks revealed tiles', () => {
    const g = new GrassState();
    expect(g.isRevealed(1, 2)).toBe(false);
    g.set(1, 2, 'note');
    expect(g.isRevealed(1, 2)).toBe(true);
    expect(g.get(1, 2)).toBe('note');
  });
});
