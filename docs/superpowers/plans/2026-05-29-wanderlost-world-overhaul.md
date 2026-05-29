# wanderlost World Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace wanderlost's infinite procedural chunk world with a finite, authored, Pokémon-style contained map that renders as continuous terrain with deliberately placed landmark scenes, and fix the V2 character cast.

**Architecture:** A single authored 64×64 tile map (`map-data.ts`) carries four layers — ground type, collision, props, scenes. `World` becomes a thin loader over that map (no streaming, no noise). Movement consults a collision layer (barrier belt + solid props) before each grid slide. Terrain renders via a regenerated, palette-matched, chained pixellab Wang tileset family; grass is a continuous ground type, not scattered squares. Objects/scenes are authored placements, not one-random-object-per-chunk. All assets are pulled at build time from a committed `scripts/asset-manifest.json`; missing assets fail the build instead of rendering grey blocks.

**Tech Stack:** Bun + Vite + Preact + TypeScript (strict), Canvas 2D, `bun test` + happy-dom, Cloudflare Pages + Worker/Durable Object, pixellab MCP (`create_topdown_tileset`, `animate_object`, `list_objects`/`get_object`).

---

## Baseline (verify before Task 1)

- [ ] **Confirm starting state**

Run: `cd /home/bazzite/dev/wanderlost && bun test && bunx tsc --noEmit`
Expected: all existing tests pass, tsc clean. (Note: `engine.ts` already has the `input.attach()` movement fix and `.gitignore` is modified — these are uncommitted; commit them first with message `fix: register keyboard listeners so movement works`.)

Run: `git add src/game/engine.ts .gitignore && git commit -m "fix: register keyboard listeners so movement works"`

---

## File Structure

**New files:**
- `src/game/map-data.ts` — GroundType/PropKind/SceneKind enums, WorldMap type, `MapBuilder`, the authored `WORLD_MAP`, and `SCENE_DEFS` (prop layout per scene kind).
- `src/game/map-data.test.ts` — builder + authored-map structural tests.
- `src/game/terrain.ts` — `cornerUpper()` corner-autotile helper + ground-type→tileset-slug mapping.
- `src/game/collision.ts` — `canStep()` pure movement gate.
- `src/game/collision.test.ts` — collision tests.
- `src/game/debug.ts` — `?debug`-gated logger.
- `scripts/asset-manifest.json` — committed pixellab IDs + source URLs for every pulled asset.

**Rewritten files:**
- `src/game/world.ts` — loader over `WORLD_MAP` (delete genChunk/noise/eviction).
- `src/game/world.test.ts` — tests for the loader.
- `src/game/objects.ts` — PropKind→path + footprint map (replaces ObjectKind map).
- `src/game/render.ts` — authored-map ground pass (layered Wang) + grass overlay + prop/scene drawables; all fallback fillRects removed.
- `scripts/fetch-assets.mjs` — reads `asset-manifest.json`; pulls tileset family, V2 objects + walk frames, props; verifies content-type.

**Modified files:**
- `src/game/engine.ts` — collision gate, `groundAt` grass check, spawn from map, debug logging, new tileset/object preloads, remove `evictOutside`.
- `src/CharacterSelect.tsx` — preview paths unchanged (verify only).

---

## Task 1: Map data types + MapBuilder

**Files:**
- Create: `src/game/map-data.ts`
- Test: `src/game/map-data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/map-data.test.ts`
Expected: FAIL — `Cannot find module './map-data'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/map-data.ts
// The world is a single authored finite map. Four parallel layers over a width*height grid:
//   ground     — GroundType per tile (drives autotiled terrain rendering)
//   collision  — 0 walkable / 1 blocked (barrier belt + solid props)
//   props      — individual authored objects (a footprint may also mark collision)
//   scenes     — anchored set-pieces, expanded to props at load time
export enum GroundType { Soil = 0, Grass = 1, RedBarren = 2, StonePath = 3, Water = 4, Cliff = 5, BoneBed = 6 }

export type PropKind =
  | 'chest' | 'campfire' | 'tree' | 'stump' | 'ruin' | 'antenna' | 'ship' | 'pod'
  | 'terminal' | 'jellyfish' | 'signpost' | 'bench' | 'bedroll' | 'mushroom'
  | 'flower' | 'boulder' | 'skeleton' | 'bones' | 'statue' | 'scrap' | 'gem';

export type SceneKind = 'rest-stop' | 'ruin-field' | 'crash-site' | 'grove' | 'bone-bed';

export interface PlacedProp { kind: PropKind; tx: number; ty: number; variant: number; blocked: boolean; }
export interface PlacedScene { kind: SceneKind; tx: number; ty: number; }

export interface WorldMap {
  width: number;
  height: number;
  ground: Uint8Array;
  collision: Uint8Array;
  props: PlacedProp[];
  scenes: PlacedScene[];
  spawn: { tx: number; ty: number };
}

export class MapBuilder {
  ground: Uint8Array;
  collision: Uint8Array;
  props: PlacedProp[] = [];
  scenes: PlacedScene[] = [];
  spawn = { tx: 0, ty: 0 };

  constructor(public width: number, public height: number, base: GroundType = GroundType.Soil) {
    this.ground = new Uint8Array(width * height).fill(base);
    this.collision = new Uint8Array(width * height);
  }

  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height; }
  private idx(tx: number, ty: number) { return ty * this.width + tx; }

  setGround(tx: number, ty: number, g: GroundType) { if (this.inBounds(tx, ty)) this.ground[this.idx(tx, ty)] = g; }
  block(tx: number, ty: number) { if (this.inBounds(tx, ty)) this.collision[this.idx(tx, ty)] = 1; }

  fillRect(x: number, y: number, w: number, h: number, g: GroundType) {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.setGround(tx, ty, g);
    return this;
  }

  blockRect(x: number, y: number, w: number, h: number) {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.block(tx, ty);
    return this;
  }

  border(thickness: number, g: GroundType) {
    for (let ty = 0; ty < this.height; ty++) for (let tx = 0; tx < this.width; tx++) {
      if (tx < thickness || ty < thickness || tx >= this.width - thickness || ty >= this.height - thickness) {
        this.setGround(tx, ty, g);
        this.block(tx, ty);
      }
    }
    return this;
  }

  // Organic filled disc, deterministic per (seed) jitter so blobs aren't perfect circles.
  blob(cx: number, cy: number, radius: number, g: GroundType, seed = 1) {
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0), s / 0xffffffff);
    for (let ty = cy - radius; ty <= cy + radius; ty++) {
      for (let tx = cx - radius; tx <= cx + radius; tx++) {
        const d = Math.hypot(tx - cx, ty - cy);
        if (d <= radius - 0.5 + (rnd() - 0.5)) this.setGround(tx, ty, g);
      }
    }
    return this;
  }

  prop(kind: PropKind, tx: number, ty: number, variant = 0, blocked = false) {
    this.props.push({ kind, tx, ty, variant, blocked });
    if (blocked) this.block(tx, ty);
    return this;
  }

  scene(kind: SceneKind, tx: number, ty: number) { this.scenes.push({ kind, tx, ty }); return this; }
  spawnAt(tx: number, ty: number) { this.spawn = { tx, ty }; return this; }

  build(): WorldMap {
    return {
      width: this.width, height: this.height,
      ground: this.ground, collision: this.collision,
      props: this.props, scenes: this.scenes, spawn: this.spawn,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/map-data.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/map-data.ts src/game/map-data.test.ts
git commit -m "feat: map data types and MapBuilder for authored world"
```

---

## Task 2: Scene definitions + authored WORLD_MAP

**Files:**
- Modify: `src/game/map-data.ts` (append `SCENE_DEFS`, `expandScene`, `WORLD_MAP`)
- Modify: `src/game/map-data.test.ts` (append structural tests)

- [ ] **Step 1: Write the failing test (append to map-data.test.ts)**

```ts
import { WORLD_MAP, SCENE_DEFS, expandScene } from './map-data';

describe('authored world map', () => {
  it('is 64x64', () => {
    expect(WORLD_MAP.width).toBe(64);
    expect(WORLD_MAP.height).toBe(64);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/map-data.test.ts`
Expected: FAIL — `expandScene`/`SCENE_DEFS`/`WORLD_MAP` not exported.

- [ ] **Step 3: Write the implementation (append to map-data.ts)**

```ts
// A scene is a reusable cluster of props at offsets from an anchor tile, plus optional
// ground stamps and blocked footprints. Campfires live ONLY inside rest-stops.
interface SceneProp { kind: PropKind; dx: number; dy: number; variant?: number; blocked?: boolean; }
interface SceneDef { ground?: { dx: number; dy: number; w: number; h: number; g: GroundType }[]; props: SceneProp[]; }

export const SCENE_DEFS: Record<SceneKind, SceneDef> = {
  'rest-stop': {
    ground: [{ dx: -2, dy: -2, w: 5, h: 5, g: GroundType.StonePath }],
    props: [
      { kind: 'campfire', dx: 0, dy: 0 },
      { kind: 'bedroll', dx: -1, dy: 1 },
      { kind: 'bench', dx: 1, dy: 1, blocked: true },
      { kind: 'signpost', dx: 2, dy: -1, blocked: true },
    ],
  },
  'ruin-field': {
    ground: [{ dx: -2, dy: -2, w: 6, h: 6, g: GroundType.RedBarren }],
    props: [
      { kind: 'ruin', dx: 0, dy: 0, variant: 0, blocked: true },
      { kind: 'ruin', dx: 2, dy: 1, variant: 1, blocked: true },
      { kind: 'statue', dx: -1, dy: 2, blocked: true },
      { kind: 'scrap', dx: 1, dy: -1, variant: 0 },
      { kind: 'scrap', dx: -2, dy: 0, variant: 1 },
    ],
  },
  'crash-site': {
    ground: [{ dx: -3, dy: -2, w: 7, h: 6, g: GroundType.Soil }],
    props: [
      { kind: 'ship', dx: 0, dy: 0, variant: 0, blocked: true },
      { kind: 'pod', dx: 2, dy: 1, variant: 0 },
      { kind: 'scrap', dx: -2, dy: 1, variant: 0 },
      { kind: 'scrap', dx: 1, dy: -1, variant: 1 },
      { kind: 'terminal', dx: -1, dy: 2, variant: 0 },
    ],
  },
  'grove': {
    ground: [{ dx: -3, dy: -3, w: 7, h: 7, g: GroundType.Grass }],
    props: [
      { kind: 'tree', dx: 0, dy: 0, variant: 0, blocked: true },
      { kind: 'tree', dx: 2, dy: 1, variant: 1, blocked: true },
      { kind: 'tree', dx: -2, dy: 2, variant: 2, blocked: true },
      { kind: 'stump', dx: 1, dy: -2, variant: 0 },
      { kind: 'mushroom', dx: -1, dy: -1, variant: 0 },
      { kind: 'flower', dx: 1, dy: 2, variant: 0 },
      { kind: 'flower', dx: -2, dy: -2, variant: 1 },
    ],
  },
  'bone-bed': {
    ground: [{ dx: -2, dy: -2, w: 5, h: 5, g: GroundType.BoneBed }],
    props: [
      { kind: 'skeleton', dx: 0, dy: 0, blocked: true },
      { kind: 'bones', dx: 1, dy: 1, variant: 0 },
      { kind: 'bones', dx: -1, dy: -1, variant: 1 },
      { kind: 'chest', dx: 2, dy: 0, variant: 0 },
    ],
  },
};

export function expandScene(s: PlacedScene): PlacedProp[] {
  const def = SCENE_DEFS[s.kind];
  return def.props.map(p => ({
    kind: p.kind, tx: s.tx + p.dx, ty: s.ty + p.dy, variant: p.variant ?? 0, blocked: !!p.blocked,
  }));
}

// ---- The authored region ------------------------------------------------------------------
// 64x64 soil basin, ringed by a 2-tile cliff belt with a water moat just inside it. Grass
// fields and a red-barren wasteland are painted as continuous regions; scenes are placed at
// deliberate, spread-out coordinates (a rest stop by spawn, destinations toward the corners).
function buildWorld(): WorldMap {
  const b = new MapBuilder(64, 64, GroundType.Soil);
  b.border(2, GroundType.Cliff);
  // water moat just inside the cliff (blocked)
  for (let i = 2; i < 62; i++) {
    for (const [x, y] of [[i, 2], [i, 61], [2, i], [61, i]] as const) { b.setGround(x, y, GroundType.Water); b.block(x, y); }
  }
  // continuous grass fields
  b.blob(18, 20, 7, GroundType.Grass, 11);
  b.blob(30, 16, 5, GroundType.Grass, 23);
  b.blob(14, 44, 6, GroundType.Grass, 31);
  // red-barren wasteland (eastern third)
  b.blob(48, 40, 9, GroundType.RedBarren, 47);
  b.blob(52, 22, 6, GroundType.RedBarren, 53);
  // stone path spine from spawn outward
  b.fillRect(31, 33, 2, 20, GroundType.StonePath);
  b.fillRect(20, 33, 13, 2, GroundType.StonePath);

  b.spawnAt(32, 34);

  // scenes (anchors chosen to sit on/near appropriate ground)
  b.scene('rest-stop', 32, 30);
  b.scene('grove', 18, 20);
  b.scene('grove', 14, 44);
  b.scene('crash-site', 48, 40);
  b.scene('ruin-field', 52, 22);
  b.scene('bone-bed', 24, 50);

  // scattered standalone walkable detail props (no campfires here)
  b.prop('flower', 28, 36, 0).prop('flower', 36, 38, 1).prop('mushroom', 22, 38, 0);
  b.prop('boulder', 40, 30, 0, true).prop('boulder', 44, 48, 1, true);
  b.prop('signpost', 30, 33, 0, true);
  b.prop('jellyfish', 50, 45, 0).prop('jellyfish', 46, 38, 1);
  b.prop('antenna', 55, 50, 0, true);

  // bake each scene's ground stamps + blocked footprints into the layers
  for (const s of b.scenes) {
    const def = SCENE_DEFS[s.kind];
    for (const g of def.ground ?? []) b.fillRect(s.tx + g.dx, s.ty + g.dy, g.w, g.h, g.g);
    for (const p of expandScene(s)) if (p.blocked) b.block(p.tx, p.ty);
  }
  return b.build();
}

export const WORLD_MAP: WorldMap = buildWorld();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/map-data.test.ts`
Expected: PASS (all tests). If "spawn walkable" fails, the stone-path spine overlaps a scene footprint — nudge `spawnAt` to a clear tile and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/game/map-data.ts src/game/map-data.test.ts
git commit -m "feat: authored 64x64 world map with scenes and barrier belt"
```

---

## Task 3: Rewrite World as a map loader

**Files:**
- Rewrite: `src/game/world.ts`
- Rewrite: `src/game/world.test.ts`

- [ ] **Step 1: Write the failing test (replace world.test.ts entirely)**

```ts
// src/game/world.test.ts
import { describe, it, expect } from 'bun:test';
import { World, TILE } from './world';
import { GroundType, WORLD_MAP } from './map-data';

describe('world loader', () => {
  it('TILE is 32', () => { expect(TILE).toBe(32); });

  it('exposes the authored map dimensions', () => {
    const w = new World(7);
    expect(w.width).toBe(64);
    expect(w.height).toBe(64);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/world.test.ts`
Expected: FAIL — old `World` has no `width`/`groundAt`/`isBlocked`/`isGrass`/`drawables`.

- [ ] **Step 3: Write the implementation (replace world.ts entirely)**

```ts
// src/game/world.ts
// Finite authored world. No streaming, no procedural generation. World is a thin reader over
// WORLD_MAP plus the seed used for shared reveal/open RNG (kept stable across clients).
import { GroundType, WORLD_MAP, expandScene, type WorldMap, type PlacedProp } from './map-data';

export const TILE = 32;
export { GroundType } from './map-data';
export type { PlacedProp } from './map-data';

export class World {
  readonly map: WorldMap;
  private _drawables: PlacedProp[];

  constructor(public readonly seed: number, map: WorldMap = WORLD_MAP) {
    this.map = map;
    this._drawables = [...map.props, ...map.scenes.flatMap(expandScene)];
  }

  static tileKey(tx: number, ty: number) { return `${tx},${ty}`; }

  get width() { return this.map.width; }
  get height() { return this.map.height; }

  private idx(tx: number, ty: number) { return ty * this.map.width + tx; }
  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height; }

  groundAt(tx: number, ty: number): GroundType {
    if (!this.inBounds(tx, ty)) return GroundType.Cliff;
    return this.map.ground[this.idx(tx, ty)] as GroundType;
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.map.collision[this.idx(tx, ty)] === 1;
  }

  isGrass(tx: number, ty: number): boolean { return this.groundAt(tx, ty) === GroundType.Grass; }

  // All renderable props (standalone + scene-expanded). Stable list, computed once.
  drawables(): readonly PlacedProp[] { return this._drawables; }

  get spawn() { return this.map.spawn; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/world.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/world.ts src/game/world.test.ts
git commit -m "feat: rewrite World as finite authored-map loader"
```

Note: `world.ts` no longer exports `CHUNK`, `Biome`, `ObjectKind`, `Tile`, `WorldObject`, `Chunk`, `cornerUpper`, `tileAt`, `getChunk`, `evictOutside`. Later tasks update every importer (`engine.ts`, `render.ts`, `objects.ts`). Expect `bunx tsc --noEmit` to report errors in those files until Tasks 5, 9, 12, 13 land — that is expected and resolved by the end of the plan.

---

## Task 4: Collision movement gate

**Files:**
- Create: `src/game/collision.ts`
- Test: `src/game/collision.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/collision.test.ts`
Expected: FAIL — `Cannot find module './collision'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/collision.ts
import type { World } from './world';

// Pokémon-style grid movement gate. Target must be walkable, and diagonals may not cut through
// a corner formed by two blocked orthogonal neighbors.
export function canStep(world: World, tx: number, ty: number, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  if (world.isBlocked(tx + dx, ty + dy)) return false;
  if (dx !== 0 && dy !== 0 && world.isBlocked(tx + dx, ty) && world.isBlocked(tx, ty + dy)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/collision.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/collision.ts src/game/collision.test.ts
git commit -m "feat: collision gate with diagonal corner-cut prevention"
```

---

## Task 5: Wire collision, grass check, and spawn into the engine

**Files:**
- Modify: `src/game/engine.ts`

- [ ] **Step 1: Update imports and player spawn**

In `engine.ts`, change the world/TILE import line and add collision + map imports:

```ts
import { World, TILE } from './world';
import { GroundType } from './map-data';
import { canStep } from './collision';
```

Remove `CHUNK` from any import. Change player construction to default to the map spawn:

```ts
const player = new Player(save?.tx ?? world.spawn.tx, save?.ty ?? world.spawn.ty, save?.character ?? 'doug');
```

- [ ] **Step 2: Gate movement with collision**

Replace the intent→slide block in `loop`:

```ts
    if (!player.sliding && !input.paused) {
      const { dx, dy } = input.intent();
      const dir = vecToDir(dx, dy);
      if (dir && canStep(world, player.tx, player.ty, dx, dy)) {
        player.startSlide(player.tx + dx, player.ty + dy, dir);
        startAudio();
      }
    }
```

- [ ] **Step 3: Replace the grass check and remove chunk eviction**

Replace `const tile = world.tileAt(player.tx, player.ty); if (tile.grass && ...)` with:

```ts
      if (world.isGrass(player.tx, player.ty) && !grass.isRevealed(player.tx, player.ty)) {
```

Delete the line `world.evictOutside(Math.floor(player.tx / CHUNK), Math.floor(player.ty / CHUNK), 3);`.

- [ ] **Step 4: Update tileset + object preloads**

Replace the two `loadWangTileset('soil')` / `loadWangTileset('red-barren')` calls with the new ground family (Task 11 defines `GROUND_TILESETS`):

```ts
import { GROUND_TILESETS } from './terrain';
// ...
for (const slug of GROUND_TILESETS) loadWangTileset(slug).catch(() => {});
```

`allObjectSources()` import stays (its contents change in Task 9). Remove the bone-overlay preload array entries (`/assets/tilesets/bone-overlay/tile_${i}.png`) — bone ground is now a Wang ground type, not an overlay.

- [ ] **Step 5: Fix findChest helper**

`findChest` used `world.getChunk(...).objects`. Replace the helper at the bottom of `engine.ts`:

```ts
function findChest(world: World, tx: number, ty: number) {
  return world.drawables().find(o => o.kind === 'chest' && o.tx === tx && o.ty === ty);
}
```

- [ ] **Step 6: Typecheck the engine slice**

Run: `bunx tsc --noEmit`
Expected: errors now only in `render.ts` and `objects.ts` (addressed in Tasks 9, 12, 13). `engine.ts` should be clean. If `engine.ts` still errors, fix the specific line before committing.

- [ ] **Step 7: Commit**

```bash
git add src/game/engine.ts
git commit -m "feat: collision-gated movement, map spawn, grass-ground check in engine"
```

---

## Task 6: Generate the matched Wang tileset family (pixellab)

This task uses pixellab MCP tools and is long-running/async. It produces tileset IDs recorded into `scripts/asset-manifest.json`. No app code changes.

**Files:**
- Create: `scripts/asset-manifest.json`

- [ ] **Step 1: Generate the chained ground family**

Call `mcp__pixellab__create_topdown_tileset` for each, at 32px, using a consistent dark-alien palette and the grass/tree-trunk look the user likes. Chain so terrains share the soil "lower" base (pass the soil tileset's id as `lower_base_tile_id` where the tool supports chaining):

1. `soil` — base bare ground (dark alien soil). Record its id; it is the lower base for the rest.
2. `grass` — alien grass upper over soil lower.
3. `red-barren` — red-orange rocky upper over soil lower.
4. `stone-path` — flagstone path upper over soil lower.
5. `bone-bed` — bone-littered ground upper over soil lower.
6. `water` — dark water (used in the moat; standalone or upper over soil).
7. `cliff` — void-cliff edge (barrier belt; standalone or upper over soil).

Poll each job to completion with `mcp__pixellab__get_topdown_tileset`. Record every resulting id.

- [ ] **Step 2: Write the manifest**

```json
{
  "tilesets": [
    { "slug": "soil",       "id": "<SOIL_ID>" },
    { "slug": "grass",      "id": "<GRASS_ID>" },
    { "slug": "red-barren", "id": "<RED_BARREN_ID>" },
    { "slug": "stone-path", "id": "<STONE_PATH_ID>" },
    { "slug": "bone-bed",   "id": "<BONE_BED_ID>" },
    { "slug": "water",      "id": "<WATER_ID>" },
    { "slug": "cliff",      "id": "<CLIFF_ID>" }
  ],
  "characters": [],
  "props": []
}
```

Replace each `<…_ID>` with the real id from Step 1.

- [ ] **Step 3: Commit**

```bash
git add scripts/asset-manifest.json
git commit -m "chore: record regenerated Wang tileset family ids"
```

If a tileset job fails or the result looks wrong, regenerate that single slug and update its id. Do not proceed to Task 12 until all seven ids resolve.

---

## Task 7: Source V2 characters from pixellab Objects + generate walk cycles

Long-running/async. Produces character object ids + walk-animation handles into the manifest.

**Files:**
- Modify: `scripts/asset-manifest.json`

- [ ] **Step 1: Locate the correct V2 Objects**

Use `mcp__pixellab__list_objects` and `mcp__pixellab__get_object` to find the frame-by-frame V2 trio that matches the mute site (https://mute-pixel.pages.dev/site/): `crab-head-v2`, `green-alien-v2`, `red-hair-v2`. These are **Objects**, not Characters. Confirm each has 8-direction static views. Record their object ids.

- [ ] **Step 2: Generate 8-direction walk cycles**

For each of the three V2 objects, call `mcp__pixellab__animate_object` in v3 mode to produce an 8-direction walk cycle (4–6 frames per direction), using the object's own rotations as the reference for consistency. Poll to completion. Record the animation id/handle for each.

(Doug is unchanged — he keeps the existing local `zero-g-float` frames; do not generate a walk for Doug.)

- [ ] **Step 3: Update the manifest `characters` array**

```json
  "characters": [
    { "slug": "crab-head-v2",   "objectId": "<CRAB_ID>",  "walkAnimId": "<CRAB_WALK_ID>",  "frames": 6 },
    { "slug": "green-alien-v2", "objectId": "<ALIEN_ID>", "walkAnimId": "<ALIEN_WALK_ID>", "frames": 6 },
    { "slug": "red-hair-v2",    "objectId": "<RED_ID>",   "walkAnimId": "<RED_WALK_ID>",   "frames": 6 }
  ],
```

- [ ] **Step 4: Commit**

```bash
git add scripts/asset-manifest.json
git commit -m "chore: record V2 character object ids and walk animation ids"
```

If any walk cycle can't be generated in time, leave `walkAnimId` null for that slug — the fetch script (Task 10) will pull rotations only, and the renderer already falls back to the static rotation when no walk frames exist.

---

## Task 8: Discover and record scene props (pixellab Objects)

Produces the prop source list. Some props already exist locally at `~/dev/mute-game/assets/objects/` (chests, alien-tree-6..9, ruin-archway-1..2, antenna-tower, crashed-ship-1..2, cyan-pod-10..12, data-terminal-1..5, jellyfish-1..4). The rest (signpost, bench, bedroll, mushroom, flower, boulder, skeleton, bones, statue, scrap, stump, gem) must be located in pixellab Objects.

**Files:**
- Modify: `scripts/asset-manifest.json`

- [ ] **Step 1: Inventory what's already local**

Run: `ls "$HOME/dev/mute-game/assets/objects/"`
These map directly and need no pixellab pull (the fetch script copies them).

- [ ] **Step 2: Find the missing props in pixellab**

Use `mcp__pixellab__list_objects` (1485 objects) filtered by name to locate: signpost, bench, bedroll, mushroom, flower, boulder/rock, skeleton, bone pile, statue, scrap pile, stump, gem. For each found, record its id and a stable download URL via `mcp__pixellab__get_object`. If a prop genuinely doesn't exist, generate it with `mcp__pixellab__create_map_object` (top-down, matched palette) and record the new id.

- [ ] **Step 3: Update the manifest `props` array**

```json
  "props": [
    { "kind": "signpost", "id": "<ID>", "variants": 1 },
    { "kind": "bench",    "id": "<ID>", "variants": 1 },
    { "kind": "bedroll",  "id": "<ID>", "variants": 1 },
    { "kind": "mushroom", "id": "<ID>", "variants": 2 },
    { "kind": "flower",   "id": "<ID>", "variants": 2 },
    { "kind": "boulder",  "id": "<ID>", "variants": 2 },
    { "kind": "skeleton", "id": "<ID>", "variants": 1 },
    { "kind": "bones",    "id": "<ID>", "variants": 2 },
    { "kind": "statue",   "id": "<ID>", "variants": 1 },
    { "kind": "scrap",    "id": "<ID>", "variants": 2 },
    { "kind": "stump",    "id": "<ID>", "variants": 1 },
    { "kind": "gem",      "id": "<ID>", "variants": 1 }
  ]
```

- [ ] **Step 4: Commit**

```bash
git add scripts/asset-manifest.json
git commit -m "chore: record scene prop object ids"
```

---

## Task 9: Prop path + footprint map

**Files:**
- Rewrite: `src/game/objects.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/objects.test.ts`
Expected: FAIL — old `objects.ts` imports `ObjectKind` from `world` (removed) and has no `signpost`.

- [ ] **Step 3: Write the implementation (replace objects.ts)**

```ts
// src/game/objects.ts
import type { PropKind } from './map-data';

// Props already on local mute disk live under objects/mute/; newly pulled props under objects/props/.
const PATHS: Record<PropKind, (v: number) => string> = {
  chest:    v => `/assets/objects/mute/treasure-chest-${(v % 7) + 1}.png`,
  campfire: () => `/assets/objects/campfire-flicker.gif`,
  tree:     v => `/assets/objects/mute/alien-tree-${6 + (v % 4)}.png`,
  ruin:     v => `/assets/objects/mute/ruin-archway-${(v % 2) + 1}.png`,
  antenna:  () => `/assets/objects/mute/antenna-tower.png`,
  ship:     v => `/assets/objects/mute/crashed-ship-${(v % 2) + 1}.png`,
  pod:      v => `/assets/objects/mute/cyan-pod-${10 + (v % 3)}.png`,
  terminal: v => `/assets/objects/mute/data-terminal-${(v % 5) + 1}.png`,
  jellyfish:v => `/assets/objects/mute/jellyfish-${(v % 4) + 1}.png`,
  stump:    v => `/assets/objects/props/stump-${v % 1}.png`,
  signpost: v => `/assets/objects/props/signpost-${v % 1}.png`,
  bench:    v => `/assets/objects/props/bench-${v % 1}.png`,
  bedroll:  v => `/assets/objects/props/bedroll-${v % 1}.png`,
  mushroom: v => `/assets/objects/props/mushroom-${v % 2}.png`,
  flower:   v => `/assets/objects/props/flower-${v % 2}.png`,
  boulder:  v => `/assets/objects/props/boulder-${v % 2}.png`,
  skeleton: v => `/assets/objects/props/skeleton-${v % 1}.png`,
  bones:    v => `/assets/objects/props/bones-${v % 2}.png`,
  statue:   v => `/assets/objects/props/statue-${v % 1}.png`,
  scrap:    v => `/assets/objects/props/scrap-${v % 2}.png`,
  gem:      v => `/assets/objects/props/gem-${v % 1}.png`,
};

export function objectPath(kind: PropKind, variant: number) { return PATHS[kind](variant); }

export function allObjectSources(): string[] {
  const out: string[] = [];
  for (const kind of Object.keys(PATHS) as PropKind[]) for (let v = 0; v < 7; v++) out.push(PATHS[kind](v));
  return [...new Set(out)];
}

// Which chests have been opened (network makes it authoritative).
export class OpenState {
  private open = new Set<string>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isOpen(tx: number, ty: number) { return this.open.has(OpenState.key(tx, ty)); }
  setOpen(tx: number, ty: number) { this.open.add(OpenState.key(tx, ty)); }
  keys() { return this.open.values(); }
}
```

(Variant counts above are conservative; if Task 8 recorded more variants for a kind, widen the `% N`. The exact modulus only affects which file is requested.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/objects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/objects.ts src/game/objects.test.ts
git commit -m "feat: prop path map keyed by PropKind"
```

---

## Task 10: Rewrite the asset fetch script

**Files:**
- Rewrite: `scripts/fetch-assets.mjs`

- [ ] **Step 1: Rewrite the script to consume the manifest and verify content-types**

```js
// scripts/fetch-assets.mjs
// Build-time asset pull. Reads scripts/asset-manifest.json and downloads everything the game
// serves locally. Verifies each downloaded file is a real image (the mute Pages SPA returns
// 200 + text/html for any path, so HTTP status is not proof of existence).
import { mkdir, writeFile, copyFile, readdir, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const PUB = join(ROOT, 'public/assets');
const MUTE_BASE = 'https://mute-pixel.pages.dev/assets';
const LOCAL_MUTE = process.env.HOME + '/dev/mute-game/assets';
const PIXELLAB_API = 'https://api.pixellab.ai/mcp';
const TOKEN = process.env.PIXELLAB_TOKEN;
const DIRS = ['south','south-east','east','north-east','north','north-west','west','south-west'];

const manifest = JSON.parse(await readFile(join(ROOT, 'scripts/asset-manifest.json'), 'utf8'));
let failures = 0;

function isImage(buf) {
  // PNG \x89PNG, GIF GIF8
  return (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46);
}

async function fetchImage(url, dest, headers = {}) {
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers });
  if (!res.ok) { console.error('FAIL', res.status, url); failures++; return; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isImage(buf)) { console.error('FAIL not-an-image', url); failures++; return; }
  await writeFile(dest, buf);
  console.log('ok', url.replace(PIXELLAB_API, 'pixellab'), '->', dest.replace(ROOT, ''));
}

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const e of await readdir(src, { withFileTypes: true })) {
    const s = join(src, e.name), d = join(dest, e.name);
    if (e.isDirectory()) await copyTree(s, d);
    else { await mkdir(dirname(d), { recursive: true }); await copyFile(s, d); }
  }
}

// 1) Wang tileset family (image + metadata) from manifest ids
if (!TOKEN) { console.error('PIXELLAB_TOKEN not set'); process.exit(1); }
const auth = { Authorization: `Bearer ${TOKEN}` };
for (const t of manifest.tilesets) {
  const dir = join(PUB, `tilesets/${t.slug}`);
  await fetchImage(`${PIXELLAB_API}/topdown-tilesets/${t.id}/image`, join(dir, 'image.png'), auth);
  const meta = await fetch(`${PIXELLAB_API}/topdown-tilesets/${t.id}/metadata`, { headers: auth });
  if (!meta.ok) { console.error('FAIL meta', t.slug); failures++; }
  else await writeFile(join(dir, 'metadata.json'), Buffer.from(await meta.arrayBuffer()));
}

// 2) Animated environmental GIFs
await fetchImage(`${MUTE_BASE}/gifs/campfire-flicker.gif`, join(PUB, 'objects/campfire-flicker.gif'));
await fetchImage(`${MUTE_BASE}/gifs/grass-sway.gif`, join(PUB, 'grass/grass-sway.gif'));

// 3) Doug from local mute-game (rotations + zero-g-float frames)
if (existsSync(LOCAL_MUTE)) {
  await copyTree(join(LOCAL_MUTE, 'space-traveler/rotations'), join(PUB, 'characters/doug/rotations'));
  await copyTree(join(LOCAL_MUTE, 'space-traveler/animations/zero-g-float'), join(PUB, 'characters/doug/zero-g-float'));
  await copyTree(join(LOCAL_MUTE, 'objects'), join(PUB, 'objects/mute'));
} else { console.error('FAIL LOCAL_MUTE missing'); failures++; }

// 4) V2 characters: rotations from the object, walk frames from the walk animation
for (const c of manifest.characters) {
  for (const d of DIRS) {
    await fetchImage(`${PIXELLAB_API}/objects/${c.objectId}/rotations/${d}`, join(PUB, `characters/${c.slug}/rotations/${d}.png`), auth);
  }
  if (c.walkAnimId) {
    for (const d of DIRS) for (let i = 0; i < c.frames; i++) {
      await fetchImage(`${PIXELLAB_API}/animations/${c.walkAnimId}/frames/${d}/${i}`, join(PUB, `characters/${c.slug}/walk/${d}/${i}.png`), auth);
    }
  }
}

// 5) Scene props pulled by id into objects/props/<kind>-<v>.png
for (const p of manifest.props) {
  for (let v = 0; v < (p.variants ?? 1); v++) {
    await fetchImage(`${PIXELLAB_API}/objects/${p.id}/image`, join(PUB, `objects/props/${p.kind}-${v}.png`), auth);
  }
}

if (failures) { console.error(`asset fetch FAILED: ${failures} missing/invalid`); process.exit(1); }
console.log('asset fetch complete');
```

(The exact pixellab download endpoint paths — `/topdown-tilesets/{id}/image`, `/objects/{id}/rotations/{dir}`, `/animations/{id}/frames/{dir}/{i}`, `/objects/{id}/image` — must be confirmed against the live API during Tasks 6–8; adjust the URL templates to match whatever `get_*`/download endpoints those tools expose. The verification + manifest-driven structure stays the same.)

- [ ] **Step 2: Run the fetch**

Run: `PIXELLAB_TOKEN=$PIXELLAB_TOKEN bun scripts/fetch-assets.mjs`
Expected: ends with `asset fetch complete` and exit 0. If it exits 1, fix the failing URL template or manifest id and re-run.

- [ ] **Step 3: Spot-check the output**

Run: `ls public/assets/tilesets/grass/ public/assets/characters/crab-head-v2/rotations/ public/assets/objects/props/ | head -40`
Expected: `image.png` + `metadata.json` for tilesets; 8 rotation PNGs per V2 char; prop PNGs present.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-assets.mjs
git commit -m "feat: manifest-driven asset fetch with image verification"
```

(Downloaded assets under `public/assets/` are gitignored as build artifacts? Check `.gitignore`. If `public/assets` is committed in this repo, `git add public/assets` too. Match the existing repo convention — the prior commits committed assets, so add them.)

---

## Task 11: Ground tileset mapping + corner autotile helper

**Files:**
- Create: `src/game/terrain.ts`
- Test: `src/game/terrain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/terrain.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/terrain.ts
// Ground renders as layered corner-autotiled Wang terrains over a soil base. Each "upper"
// terrain is drawn where its corner signature is non-zero, using the chained tileset whose
// lower terrain is soil — so edges always meet soil cleanly.
import { GroundType } from './map-data';
import type { World } from './world';

export const GROUND_TILESETS = ['soil', 'grass', 'red-barren', 'stone-path', 'bone-bed', 'water', 'cliff'] as const;

// Terrains drawn as Wang layers on top of the soil base, in paint order.
export const UPPER_TERRAINS: { ground: GroundType; slug: string }[] = [
  { ground: GroundType.RedBarren, slug: 'red-barren' },
  { ground: GroundType.Grass,     slug: 'grass' },
  { ground: GroundType.StonePath, slug: 'stone-path' },
  { ground: GroundType.BoneBed,   slug: 'bone-bed' },
  { ground: GroundType.Water,     slug: 'water' },
  { ground: GroundType.Cliff,     slug: 'cliff' },
];

// A grid corner (cx,cy) is shared by the 4 tiles up-left/up/left/self. Corner is "upper" for a
// terrain when 2+ of those 4 tiles are that terrain (ties grow the region slightly — looks fuller).
export function cornerUpper(world: World, terrain: GroundType, cx: number, cy: number): 0 | 1 {
  let n = 0;
  if (world.groundAt(cx - 1, cy - 1) === terrain) n++;
  if (world.groundAt(cx, cy - 1) === terrain) n++;
  if (world.groundAt(cx - 1, cy) === terrain) n++;
  if (world.groundAt(cx, cy) === terrain) n++;
  return n >= 2 ? 1 : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/terrain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/terrain.ts src/game/terrain.test.ts
git commit -m "feat: ground tileset mapping and corner autotile helper"
```

---

## Task 12: Render the continuous ground

**Files:**
- Modify: `src/game/render.ts` (ground + grass passes, imports, remove fallbacks)

- [ ] **Step 1: Update imports**

Replace the top imports of `render.ts`:

```ts
import { World, TILE } from './world';
import { GroundType } from './map-data';
import { getImage, getWangTileset, cornerKey } from './assets';
import type { Dir } from './assets';
import { objectPath } from './objects';
import { cornerUpper, UPPER_TERRAINS } from './terrain';
import type { GrassState } from './grass';
import type { OpenState } from './objects';
import { phaseAt, nightStrength } from './daynight';
import type { PeerState } from './peers';
import { indexDir } from './peers';
```

Delete `BIOME_COLOR`, `OSSUARY_TINT`, `GRASS_COLOR` constants and the `Biome` import.

- [ ] **Step 2: Replace the ground pass**

Replace the ground-pass loop (the `for ty … for tx … world.tileAt …` block including the bone overlay) with a layered Wang pass:

```ts
  // ground pass — soil base, then each upper terrain corner-autotiled on top
  const soilTs = getWangTileset('soil');
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      if (soilTs) {
        const base = soilTs.rects.get(0) ?? soilTs.rects.values().next().value;
        if (base) ctx.drawImage(soilTs.img, base[0], base[1], base[2], base[3], sx, sy, TILE, TILE);
      }
      for (const u of UPPER_TERRAINS) {
        const ts = getWangTileset(u.slug);
        if (!ts) continue;
        const key = cornerKey(
          cornerUpper(world, u.ground, tx, ty), cornerUpper(world, u.ground, tx + 1, ty),
          cornerUpper(world, u.ground, tx, ty + 1), cornerUpper(world, u.ground, tx + 1, ty + 1),
        );
        if (key === 0) continue;
        const r = ts.rects.get(key);
        if (r) ctx.drawImage(ts.img, r[0], r[1], r[2], r[3], sx, sy, TILE, TILE);
      }
    }
  }
```

- [ ] **Step 3: Replace the grass overlay pass**

The old grass pass drew `grass-sway.gif` per `t.grass` tile. Keep an animated sway overlay, but key it off the grass ground type (continuous), drawn subtly so the autotiled grass terrain is the real ground:

```ts
  // animated grass sway, overlaid on grass-ground tiles; dimmed once searched
  const grassImg = getImage('/assets/grass/grass-sway.gif');
  if (grassImg) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (world.groundAt(tx, ty) !== GroundType.Grass) continue;
        const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
        ctx.globalAlpha = rc.grass.isRevealed(tx, ty) ? 0.4 : 0.85;
        ctx.drawImage(grassImg, sx, sy - 4, TILE, TILE);
        ctx.globalAlpha = 1;
      }
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: remaining errors only in the drawable/peer section of `render.ts` (Task 13). The ground/grass passes should be clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/render.ts
git commit -m "feat: continuous layered-Wang ground and grass overlay"
```

---

## Task 13: Render props/scenes and campfire glow from the authored map

**Files:**
- Modify: `src/game/render.ts` (drawable pass, campfire glow, drawSprite fallback)

- [ ] **Step 1: Replace the drawable-collection loop**

Replace the chunk-iterating drawable loop (`for cy … for cx … world.getChunk(cx,cy).objects …`) with iteration over `world.drawables()`, culled to the visible window:

```ts
  // y-sorted drawables: authored props/scenes + peers + local player
  const drawables: Drawable[] = [];
  for (const o of world.drawables()) {
    if (o.tx < minTx - 2 || o.tx > maxTx + 2 || o.ty < minTy - 2 || o.ty > maxTy + 2) continue;
    const opened = o.kind === 'chest' && rc.open.isOpen(o.tx, o.ty);
    const path = objectPath(o.kind, o.variant);
    drawables.push({
      wy: o.ty * TILE + TILE,
      draw: () => {
        const img = getImage(path);
        if (!img) return; // assets are guaranteed at build time; no grey-block fallback
        const sx = Math.round(o.tx * TILE - cam.x), sy = Math.round(o.ty * TILE - cam.y);
        const w = TILE * 1.5, h = TILE * 1.5;
        ctx.globalAlpha = opened ? 0.65 : 1;
        ctx.drawImage(img, sx - (w - TILE) / 2, sy - (h - TILE), w, h);
        ctx.globalAlpha = 1;
      },
    });
  }
```

Keep the peer + local-player `drawables.push(...)` lines and the `drawables.sort(...)` exactly as they are.

- [ ] **Step 2: Replace the campfire glow loop**

Replace the chunk-iterating campfire glow with a `world.drawables()` scan:

```ts
  const night = nightStrength(rc.clockMs);
  if (night > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    for (const o of world.drawables()) {
      if (o.kind !== 'campfire') continue;
      const sx = o.tx * TILE - cam.x + TILE / 2, sy = o.ty * TILE - cam.y + TILE / 2;
      const rad = 70 + Math.sin(rc.clockMs / 120) * 6;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g.addColorStop(0, `rgba(255,180,80,${0.5 * night})`);
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
```

- [ ] **Step 3: Remove the sprite fallback block**

In `drawSprite`, keep the rotation fallback (a character may legitimately lack a walk cycle) but remove the gold `#d4a437` fillRect for a totally-missing image — log instead:

```ts
  if (img) ctx.drawImage(img, Math.round(sx) - 8, Math.round(sy) - 16, 48, 48);
  // else: asset missing at build time — nothing drawn (build should have failed first)
```

- [ ] **Step 4: Typecheck + full test**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/render.ts
git commit -m "feat: render authored props/scenes and campfire glow; drop fallback blocks"
```

---

## Task 14: ?debug logger

**Files:**
- Create: `src/game/debug.ts`
- Test: `src/game/debug.test.ts`
- Modify: `src/game/engine.ts` (wire log calls)

- [ ] **Step 1: Write the failing test**

```ts
// src/game/debug.test.ts
import { describe, it, expect } from 'bun:test';
import { makeLogger } from './debug';

describe('debug logger', () => {
  it('is a no-op when disabled', () => {
    let called = 0;
    const log = makeLogger(false, () => { called++; });
    log('move', { x: 1 });
    expect(called).toBe(0);
  });

  it('emits when enabled', () => {
    const lines: string[] = [];
    const log = makeLogger(true, (m) => lines.push(m));
    log('move', { x: 1 });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('move');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/debug.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/debug.ts
// Lightweight logger gated by the ?debug URL flag. Zero overhead when disabled.
export type Logger = (tag: string, data?: unknown) => void;

export function makeLogger(enabled: boolean, sink: (msg: string) => void = (m) => console.log(m)): Logger {
  if (!enabled) return () => {};
  return (tag, data) => sink(`[wl ${tag}] ${data !== undefined ? JSON.stringify(data) : ''}`);
}

export function debugEnabled(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/debug.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into engine.ts**

Add near the top of `startEngine`:

```ts
import { makeLogger, debugEnabled } from './debug';
// inside startEngine:
const log = makeLogger(debugEnabled());
log('engine-start', { seed: world.seed, spawn: world.spawn });
```

Add log calls at: slide start (`log('slide', { tx, ty, dir })` inside the `canStep` branch), arrival (`log('arrive', { tx: player.tx, ty: player.ty })` after the wasSliding→!sliding block), collision-blocked (in an `else` of the `canStep` check: `else if (dir) log('blocked', { tx: player.tx + dx, ty: player.ty + dy })`), reveal (`log('reveal', { key, result })`), and net connect (`log('net-connect')` in `begin()`). Wrap the `net` callbacks `onWelcome`/`onPeerJoin` with `log('welcome', { seed })` / `log('peer-join')`.

- [ ] **Step 6: Typecheck + commit**

Run: `bunx tsc --noEmit && bun test`
Expected: clean + green.

```bash
git add src/game/debug.ts src/game/debug.test.ts src/game/engine.ts
git commit -m "feat: ?debug-gated logger wired through engine"
```

---

## Task 15: Correctness sweep

**Files:**
- Modify: as needed across `src/game/` (no new features)

- [ ] **Step 1: Grep for dead references to the removed chunk API**

Run: `grep -rn "getChunk\|evictOutside\|CHUNK\|\.tiles\|ObjectKind\|cornerUpper(t\." src/ | grep -v node_modules`
Expected: no hits outside `terrain.ts`/`map-data.ts`. Fix any stragglers (likely `save.ts`, `net.ts`, `peers.ts`, `hud-bus.ts` import surfaces — verify each compiles).

- [ ] **Step 2: Verify save.ts still round-trips**

`save.ts` persists `tx, ty, revealed, opened` — these are still valid (tile coords, not chunk). Confirm `SaveData` doesn't reference removed types.

Run: `bun test src/game/save.test.ts`
Expected: PASS. If the saved position is now outside the finite map (old infinite-world saves), clamp on load: in `engine.ts` after constructing `player`, add `if (world.isBlocked(player.tx, player.ty)) { player.tx = world.spawn.tx; player.ty = world.spawn.ty; player.px = player.tx*TILE; player.py = player.ty*TILE; }`.

- [ ] **Step 3: Full typecheck + test + dev smoke**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean, all tests green.

Run: `bun run dev` then load `http://localhost:5173/?debug`, walk in all four directions, confirm: movement works, you cannot leave the map (barrier belt blocks), terrain looks continuous, scenes render with real sprites (no grey/gold blocks), campfire glows at night. Stop the dev server.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: correctness sweep — clamp stale saves, remove dead chunk refs"
```

---

## Task 16: Build, deploy, push

**Files:** none (release task)

- [ ] **Step 1: Production build**

Run: `bun run build`
Expected: `dist/` built, no errors. If the build runs `fetch-assets` as a prestep, ensure `PIXELLAB_TOKEN` is exported; otherwise assets were already fetched in Task 10 and committed.

- [ ] **Step 2: Deploy Pages**

Run: `bunx wrangler pages deploy dist --project-name=wanderlost --commit-dirty=true`
Expected: deploy succeeds, prints the `wanderlost.pages.dev` URL.

- [ ] **Step 3: Deploy the Worker (only if `worker/` changed — it didn't here, so verify it's live)**

Run: `cd worker && bunx wrangler deploy && cd ..` (skip if unchanged and already live at `wanderlost-realtime.fundlush.workers.dev`).

- [ ] **Step 4: Push to GitHub**

Run: `git remote -v` — confirm origin is `melonmelonz/wanderlost` (NOT an upstream). Then:

Run: `git push origin master`
Expected: push succeeds. Keep commit messages ASCII-only (no `→`/`≈`).

- [ ] **Step 5: Report**

Print the live URL (`https://wanderlost.pages.dev`) and the GitHub URL (`https://github.com/melonmelonz/wanderlost`) for the user. Load the live URL with `?debug`, walk around, and confirm the deployed build matches the dev smoke test.

---

## Final Review

After all tasks: dispatch a final code review over the full diff (`git diff bba2fbf..HEAD` or against the pre-overhaul commit), then use superpowers:finishing-a-development-branch.

---

## Self-Review notes (author)

- **Spec coverage:** finite authored map (T1–T3) ✓; continuous terrain / regenerated Wang family (T6, T11, T12) ✓; collision/barriers (T4–T5) ✓; composed scenes (T2, T13) ✓; V2 cast from pixellab Objects + walk cycles (T7, T10) ✓; build-time pipeline + content-type verify (T6–T10) ✓; ?debug logger (T14) ✓; correctness sweep (T15) ✓; deploy + push (T16) ✓; remove fallback blocks (T12, T13) ✓.
- **Known execution-time unknowns:** pixellab download endpoint URL templates (T6–T10) and the precise object ids (recorded into `asset-manifest.json` during T6–T8). These are real tool-driven steps, not placeholders — the manifest decouples ids from code.
- **Type consistency:** `GroundType`, `PropKind`, `SceneKind`, `WorldMap`, `PlacedProp`, `PlacedScene` defined in T1; `World.groundAt/isBlocked/isGrass/drawables/spawn` defined in T3 and consumed consistently in T5/T11/T12/T13; `cornerUpper`/`GROUND_TILESETS`/`UPPER_TERRAINS` defined in T11 and consumed in T12; `objectPath(PropKind, number)` defined in T9 and consumed in T13.
