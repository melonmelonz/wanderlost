// src/game/map-data.test.ts
import { describe, it, expect } from 'bun:test';
import { MapBuilder, GroundType, WORLD_MAP, SCENE_DEFS, expandScene } from './map-data';

describe('MapBuilder', () => {
  it('fills the whole grid with the base ground type', () => {
    const m = new MapBuilder(8, 8, GroundType.Soil).build();
    expect(m.width).toBe(8);
    expect(m.height).toBe(8);
    expect(m.ground.length).toBe(64);
    expect([...m.ground].every(g => g === GroundType.Soil)).toBe(true);
    expect([...m.collision].every(c => c === 0)).toBe(true);
  });

  it('fillRect paints a clamped rectangle', () => {
    const b = new MapBuilder(8, 8, GroundType.Soil);
    b.fillRect(2, 2, 3, 3, GroundType.Grass);
    const m = b.build();
    expect(m.ground[2 * 8 + 2]).toBe(GroundType.Grass);
    expect(m.ground[4 * 8 + 4]).toBe(GroundType.Grass);
    expect(m.ground[1 * 8 + 1]).toBe(GroundType.Soil);
  });

  it('border paints and blocks a belt of given thickness', () => {
    const m = new MapBuilder(6, 6, GroundType.Soil).border(1, GroundType.Cliff).build();
    expect(m.ground[0]).toBe(GroundType.Cliff);
    expect(m.collision[0]).toBe(1);
    expect(m.collision[3 * 6 + 3]).toBe(0); // interior walkable
  });

  it('blockRect marks collision without changing ground', () => {
    const b = new MapBuilder(6, 6, GroundType.Soil);
    b.blockRect(2, 2, 2, 2);
    const m = b.build();
    expect(m.collision[2 * 6 + 2]).toBe(1);
    expect(m.ground[2 * 6 + 2]).toBe(GroundType.Soil);
  });

  it('prop and scene records are collected; blocked prop sets collision', () => {
    const b = new MapBuilder(6, 6, GroundType.Soil);
    b.prop('boulder', 1, 1, 0, true);
    b.prop('flower', 2, 2, 1, false);
    b.scene('rest-stop', 3, 3);
    b.spawnAt(4, 4);
    const m = b.build();
    expect(m.props.length).toBe(2);
    expect(m.collision[1 * 6 + 1]).toBe(1);
    expect(m.collision[2 * 6 + 2]).toBe(0);
    expect(m.scenes).toEqual([{ kind: 'rest-stop', tx: 3, ty: 3 }]);
    expect(m.spawn).toEqual({ tx: 4, ty: 4 });
  });
});

describe('authored world map', () => {
  it('is 128x128', () => {
    expect(WORLD_MAP.width).toBe(128);
    expect(WORLD_MAP.height).toBe(128);
  });

  it('each spoke from spawn is walkable for several tiles in every direction', () => {
    const { tx, ty } = WORLD_MAP.spawn;
    const walk = (x: number, y: number) => WORLD_MAP.collision[y * WORLD_MAP.width + x] === 0;
    for (let d = 1; d <= 6; d++) {
      expect(walk(tx + d, ty)).toBe(true); // east
      expect(walk(tx - d, ty)).toBe(true); // west
      expect(walk(tx, ty + d)).toBe(true); // south
      expect(walk(tx, ty - d)).toBe(true); // north
    }
  });

  it('spawn is in bounds and walkable', () => {
    const { tx, ty } = WORLD_MAP.spawn;
    expect(tx).toBeGreaterThan(0);
    expect(ty).toBeGreaterThan(0);
    expect(WORLD_MAP.collision[ty * WORLD_MAP.width + tx]).toBe(0);
  });

  it('is enclosed by a blocked border belt', () => {
    const { width, height, collision } = WORLD_MAP;
    for (let x = 0; x < width; x++) {
      expect(collision[x]).toBe(1);                       // top row
      expect(collision[(height - 1) * width + x]).toBe(1); // bottom row
    }
    for (let y = 0; y < height; y++) {
      expect(collision[y * width]).toBe(1);               // left col
      expect(collision[y * width + width - 1]).toBe(1);   // right col
    }
  });

  it('every scene kind has a definition', () => {
    for (const s of WORLD_MAP.scenes) expect(SCENE_DEFS[s.kind]).toBeDefined();
  });

  it('expandScene returns props offset from the anchor', () => {
    const props = expandScene({ kind: 'rest-stop', tx: 10, ty: 10 });
    expect(props.length).toBeGreaterThan(0);
    expect(props.some(p => p.kind === 'campfire')).toBe(true);
    for (const p of props) { expect(p.tx).toBeGreaterThanOrEqual(8); expect(p.ty).toBeGreaterThanOrEqual(8); }
  });

  it('campfires only come from rest-stop scenes (none placed as bare props)', () => {
    expect(WORLD_MAP.props.some(p => p.kind === 'campfire')).toBe(false);
    expect(WORLD_MAP.scenes.some(s => s.kind === 'rest-stop')).toBe(true);
  });
});
