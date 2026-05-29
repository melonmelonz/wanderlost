// src/game/world.test.ts
import { describe, it, expect } from 'bun:test';
import { World, TILE, CHUNK } from './world';

describe('world', () => {
  it('generates the same chunk twice identically', () => {
    const w = new World(4242);
    const a = w.getChunk(2, -3), b = w.getChunk(2, -3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('two worlds with the same seed agree', () => {
    const a = new World(7).getChunk(1, 1);
    const b = new World(7).getChunk(1, 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('chunk has CHUNK*CHUNK tiles with a biome each', () => {
    const w = new World(1);
    const c = w.getChunk(0, 0);
    expect(c.tiles.length).toBe(CHUNK * CHUNK);
    for (const t of c.tiles) expect(['soil', 'red-barren']).toContain(t.biome);
  });

  it('grass coverage is within expected band', () => {
    const w = new World(99);
    let grass = 0, total = 0;
    for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 4; cy++) {
      const c = w.getChunk(cx, cy);
      for (const t of c.tiles) { total++; if (t.grass) grass++; }
    }
    const frac = grass / total;
    expect(frac).toBeGreaterThan(0.05);
    expect(frac).toBeLessThan(0.30);
  });

  it('tileAt resolves negative coordinates without crashing', () => {
    const w = new World(3);
    const t = w.tileAt(-1, -1);
    expect(['soil', 'red-barren']).toContain(t.biome);
  });

  it('tileKey round-trips', () => {
    expect(World.tileKey(3, -7)).toBe('3,-7');
  });

  it('TILE is 32', () => { expect(TILE).toBe(32); });
});
