// src/game/net.test.ts
import { describe, it, expect } from 'bun:test';
import { tileKey } from './net';

describe('tileKey', () => {
  it('is stable and sign-aware', () => {
    expect(tileKey(3, -7)).toBe('3,-7');
    expect(tileKey(-7, 3)).toBe('-7,3');
  });
  it('round-trips distinct tiles to distinct keys', () => {
    const keys = new Set([tileKey(0, 0), tileKey(0, 1), tileKey(1, 0), tileKey(-1, 0)]);
    expect(keys.size).toBe(4);
  });
});
