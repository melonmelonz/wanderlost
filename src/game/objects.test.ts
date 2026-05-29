// src/game/objects.test.ts
import { describe, it, expect } from 'bun:test';
import { objectPath, allObjectSources } from './objects';

describe('object paths', () => {
  it('maps every prop kind to a /assets path', () => {
    expect(objectPath('chest', 0)).toBe('/assets/objects/mute/treasure-chest-1.png');
    expect(objectPath('tree', 0)).toBe('/assets/objects/mute/alien-tree-6.png');
    expect(objectPath('campfire', 0)).toBe('/assets/objects/campfire-flicker.gif');
    expect(objectPath('signpost', 0)).toBe('/assets/objects/props/signpost-0.png');
  });

  it('allObjectSources is non-empty and de-duplicated', () => {
    const s = allObjectSources();
    expect(s.length).toBeGreaterThan(10);
    expect(new Set(s).size).toBe(s.length);
  });
});
