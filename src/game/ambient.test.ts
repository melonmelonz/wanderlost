// src/game/ambient.test.ts
import { describe, it, expect } from 'bun:test';
import { GRASS_SWAY, frameAt, framePath, frameSources } from './ambient';

describe('ambient frame animation', () => {
  it('lists one source per frame', () => {
    expect(frameSources(GRASS_SWAY)).toEqual([
      '/assets/grass/sway/0.png', '/assets/grass/sway/1.png', '/assets/grass/sway/2.png',
      '/assets/grass/sway/3.png', '/assets/grass/sway/4.png',
    ]);
  });

  it('advances frames over time and wraps within the loop', () => {
    expect(frameAt(GRASS_SWAY, 0)).toBe(0);
    expect(frameAt(GRASS_SWAY, 1000 / GRASS_SWAY.fps)).toBe(1); // one frame later, at the loop's fps
    expect(frameAt(GRASS_SWAY, 0)).toBeLessThan(GRASS_SWAY.count);
    expect(frameAt(GRASS_SWAY, 10_000)).toBeLessThan(GRASS_SWAY.count); // always in range
  });

  it('offsets desync instances without leaving the loop range', () => {
    const a = frameAt(GRASS_SWAY, 0, 0);
    const b = frameAt(GRASS_SWAY, 0, 2);
    expect(b).toBe((a + 2) % GRASS_SWAY.count);
    expect(framePath(GRASS_SWAY, b)).toBe(`/assets/grass/sway/${b}.png`);
  });
});
