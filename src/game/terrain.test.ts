// src/game/terrain.test.ts
import { describe, it, expect } from 'bun:test';
import { MapBuilder, GroundType } from './map-data';
import { World } from './world';
import { cornerUpper, GROUND_TILESETS, UPPER_TERRAINS } from './terrain';

describe('terrain autotiling', () => {
  it('lists the ground tileset slugs', () => {
    expect(GROUND_TILESETS).toContain('soil');
    expect(GROUND_TILESETS).toContain('grass');
  });

  it('cornerUpper is 1 when most surrounding tiles are the terrain', () => {
    const b = new MapBuilder(6, 6, GroundType.Soil);
    b.fillRect(2, 2, 2, 2, GroundType.Grass);
    const w = new World(1, b.build());
    // grid corner (3,3) is shared by tiles (2,2)(3,2)(2,3)(3,3) — all grass
    expect(cornerUpper(w, GroundType.Grass, 3, 3)).toBe(1);
    // grid corner (0,0) touches no grass
    expect(cornerUpper(w, GroundType.Grass, 0, 0)).toBe(0);
  });

  it('UPPER_TERRAINS maps a ground type to its tileset slug', () => {
    expect(UPPER_TERRAINS.find(u => u.ground === GroundType.Grass)?.slug).toBe('grass');
  });
});
