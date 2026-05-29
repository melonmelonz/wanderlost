// src/game/spawn.test.ts
import { describe, it, expect } from 'bun:test';
import { World } from './world';
import { WORLD_MAP } from './map-data';
import { resolveStart } from './spawn';
import type { SaveData } from './save';

const base: Omit<SaveData, 'tx' | 'ty'> = {
  character: 'doug', specimens: {}, journal: [], clockMs: 0, muted: false, revealed: [], opened: [],
};

describe('resolveStart', () => {
  it('uses the authored spawn when there is no save', () => {
    const w = new World(7);
    expect(resolveStart(w, null)).toEqual(w.spawn);
  });

  it('honors a saved position that is in-bounds and walkable', () => {
    const w = new World(7);
    const { tx, ty } = w.spawn; // spawn is known-walkable
    expect(resolveStart(w, { ...base, tx, ty })).toEqual({ tx, ty });
  });

  it('falls back to spawn when the saved tile is out of bounds (stale old-world save)', () => {
    const w = new World(7);
    expect(resolveStart(w, { ...base, tx: 9999, ty: -42 })).toEqual(w.spawn);
  });

  it('falls back to spawn when the saved tile is blocked', () => {
    const w = new World(7);
    expect(w.isBlocked(0, 0)).toBe(true); // border belt
    expect(resolveStart(w, { ...base, tx: 0, ty: 0 })).toEqual(w.spawn);
  });
});
