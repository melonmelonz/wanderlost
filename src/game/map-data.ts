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
    for (let t = 0; t < thickness; t++) {
      for (let tx = t; tx < this.width - t; tx++) {
        this.setGround(tx, t, g); this.block(tx, t);
        this.setGround(tx, this.height - 1 - t, g); this.block(tx, this.height - 1 - t);
      }
      for (let ty = t + 1; ty < this.height - 1 - t; ty++) {
        this.setGround(t, ty, g); this.block(t, ty);
        this.setGround(this.width - 1 - t, ty, g); this.block(this.width - 1 - t, ty);
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

// ---- Scene definitions -------------------------------------------------------------------
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
