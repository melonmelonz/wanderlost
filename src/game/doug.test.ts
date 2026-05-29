// src/game/doug.test.ts
import { describe, it, expect } from 'bun:test';
import { Player } from './doug';

describe('Player slide', () => {
  it('starts at a tile, not sliding', () => {
    const p = new Player(0, 0, 'doug');
    expect(p.sliding).toBe(false);
    expect(p.tx).toBe(0); expect(p.ty).toBe(0);
  });

  it('begins a slide and arrives after the cardinal duration', () => {
    const p = new Player(0, 0, 'doug');
    p.startSlide(1, 0, 'east');
    expect(p.sliding).toBe(true);
    expect(p.facing).toBe('east');
    p.update(140);
    expect(p.sliding).toBe(false);
    expect(p.tx).toBe(1); expect(p.ty).toBe(0);
  });

  it('diagonal takes longer than cardinal', () => {
    const p = new Player(0, 0, 'doug');
    p.startSlide(1, 1, 'south-east');
    p.update(140);
    expect(p.sliding).toBe(true);
    p.update(60);
    expect(p.sliding).toBe(false);
    expect(p.tx).toBe(1); expect(p.ty).toBe(1);
  });

  it('ignores a new slide while already sliding', () => {
    const p = new Player(0, 0, 'doug');
    p.startSlide(1, 0, 'east');
    p.startSlide(0, 1, 'south');
    expect(p.facing).toBe('east');
    p.update(140);
    expect(p.tx).toBe(1); expect(p.ty).toBe(0);
  });
});
