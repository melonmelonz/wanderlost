// src/game/collision.test.ts
import { describe, it, expect } from 'bun:test';
import { MapBuilder, GroundType } from './map-data';
import { World } from './world';
import { canStep } from './collision';

function world(setup: (b: MapBuilder) => void): World {
  const b = new MapBuilder(8, 8, GroundType.Soil);
  setup(b);
  return new World(1, b.build());
}

describe('canStep', () => {
  it('allows a step onto open ground', () => {
    const w = world(() => {});
    expect(canStep(w, 3, 3, 1, 0)).toBe(true);
  });

  it('blocks a step into a blocked tile', () => {
    const w = world(b => b.block(4, 3));
    expect(canStep(w, 3, 3, 1, 0)).toBe(false);
  });

  it('blocks stepping out of bounds', () => {
    const w = world(() => {});
    expect(canStep(w, 0, 0, -1, 0)).toBe(false);
  });

  it('blocks diagonal corner-cutting when both orthogonals are blocked', () => {
    const w = world(b => { b.block(4, 3); b.block(3, 4); });
    expect(canStep(w, 3, 3, 1, 1)).toBe(false);
  });

  it('allows diagonal when only one orthogonal is blocked', () => {
    const w = world(b => b.block(4, 3));
    expect(canStep(w, 3, 3, 1, 1)).toBe(true);
  });
});
