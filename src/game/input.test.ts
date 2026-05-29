// src/game/input.test.ts
import { describe, it, expect } from 'bun:test';
import { vecToDir } from './input';

describe('vecToDir', () => {
  it('maps cardinals', () => {
    expect(vecToDir(0, 1)).toBe('south');
    expect(vecToDir(0, -1)).toBe('north');
    expect(vecToDir(1, 0)).toBe('east');
    expect(vecToDir(-1, 0)).toBe('west');
  });
  it('maps diagonals', () => {
    expect(vecToDir(1, 1)).toBe('south-east');
    expect(vecToDir(-1, -1)).toBe('north-west');
    expect(vecToDir(1, -1)).toBe('north-east');
    expect(vecToDir(-1, 1)).toBe('south-west');
  });
  it('returns null for no movement', () => {
    expect(vecToDir(0, 0)).toBe(null);
  });
});
