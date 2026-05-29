// src/game/map-data.test.ts
import { describe, it, expect } from 'bun:test';
import { MapBuilder, GroundType } from './map-data';

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
