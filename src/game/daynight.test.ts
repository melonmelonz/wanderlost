// src/game/daynight.test.ts
import { describe, it, expect } from 'bun:test';
import { phaseAt, dayNumber, nightStrength, CYCLE_MS } from './daynight';

describe('day/night', () => {
  it('returns dawn at 0, day mid-morning, night late', () => {
    expect(phaseAt(0).name).toBe('dawn');
    expect(phaseAt(CYCLE_MS * 0.4).name).toBe('day');
    expect(phaseAt(CYCLE_MS * 0.9).name).toBe('night');
  });
  it('wraps past one cycle', () => {
    expect(phaseAt(CYCLE_MS + 1).name).toBe('dawn');
  });
  it('dayNumber increments per cycle', () => {
    expect(dayNumber(0)).toBe(0);
    expect(dayNumber(CYCLE_MS * 1.5)).toBe(1);
  });
  it('nightStrength peaks at night, troughs at midday', () => {
    expect(nightStrength(0)).toBeLessThan(0.1);
    expect(nightStrength(CYCLE_MS / 2)).toBeGreaterThan(0.9);
  });
});
