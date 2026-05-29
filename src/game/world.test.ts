// src/game/world.test.ts
import { describe, it, expect } from 'bun:test';
import { World, TILE } from './world';
import { GroundType, WORLD_MAP } from './map-data';

describe('world loader', () => {
  it('TILE is 32', () => { expect(TILE).toBe(32); });

  it('exposes the authored map dimensions', () => {
    const w = new World(7);
    expect(w.width).toBe(128);
    expect(w.height).toBe(128);
  });

  it('groundAt reads the authored ground layer', () => {
    const w = new World(7);
    const { spawn } = WORLD_MAP;
    expect(w.groundAt(spawn.tx, spawn.ty)).not.toBe(GroundType.Cliff);
  });

  it('out-of-bounds is treated as blocked cliff', () => {
    const w = new World(7);
    expect(w.isBlocked(-1, 5)).toBe(true);
    expect(w.isBlocked(999, 5)).toBe(true);
    expect(w.groundAt(-1, 5)).toBe(GroundType.Cliff);
  });

  it('the border belt is blocked, the spawn is not', () => {
    const w = new World(7);
    expect(w.isBlocked(0, 0)).toBe(true);
    expect(w.isBlocked(WORLD_MAP.spawn.tx, WORLD_MAP.spawn.ty)).toBe(false);
  });

  it('isGrass is true on grass ground only', () => {
    const w = new World(7);
    // find a grass tile in the authored map
    let gx = -1, gy = -1;
    for (let ty = 0; ty < w.height && gx < 0; ty++) for (let tx = 0; tx < w.width; tx++) {
      if (w.groundAt(tx, ty) === GroundType.Grass) { gx = tx; gy = ty; break; }
    }
    expect(gx).toBeGreaterThan(-1);
    expect(w.isGrass(gx, gy)).toBe(true);
    expect(w.isGrass(0, 0)).toBe(false);
  });

  it('drawables() returns scene-expanded + standalone props', () => {
    const w = new World(7);
    const ds = w.drawables();
    expect(ds.length).toBeGreaterThan(WORLD_MAP.props.length);
    expect(ds.some(p => p.kind === 'campfire')).toBe(true);
  });

  it('tileKey round-trips', () => { expect(World.tileKey(3, -7)).toBe('3,-7'); });
});
