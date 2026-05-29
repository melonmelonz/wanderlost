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

export type SceneKind =
  | 'rest-stop' | 'ruin-field' | 'crash-site' | 'grove' | 'bone-bed'
  | 'marsh' | 'overlook' | 'crystal-hollow';

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
  'marsh': {
    ground: [{ dx: -3, dy: -3, w: 7, h: 7, g: GroundType.Grass }],
    props: [
      { kind: 'jellyfish', dx: 0, dy: 0, variant: 0 },
      { kind: 'jellyfish', dx: 2, dy: 1, variant: 1 },
      { kind: 'mushroom', dx: -2, dy: 1, variant: 0 },
      { kind: 'mushroom', dx: 1, dy: -2, variant: 1 },
      { kind: 'flower', dx: -1, dy: 2, variant: 0 },
    ],
  },
  'overlook': {
    ground: [{ dx: -3, dy: -2, w: 7, h: 5, g: GroundType.StonePath }],
    props: [
      { kind: 'antenna', dx: 0, dy: 0, blocked: true },
      { kind: 'terminal', dx: 2, dy: 1, variant: 1 },
      { kind: 'gem', dx: -2, dy: 1, variant: 0 },
      { kind: 'boulder', dx: -1, dy: -1, variant: 0, blocked: true },
      { kind: 'scrap', dx: 1, dy: -1, variant: 0 },
    ],
  },
  'crystal-hollow': {
    props: [
      { kind: 'gem', dx: 0, dy: 0, variant: 0 },
      { kind: 'gem', dx: 2, dy: 1, variant: 0 },
      { kind: 'gem', dx: -2, dy: -1, variant: 0 },
      { kind: 'mushroom', dx: 1, dy: -2, variant: 1 },
      { kind: 'mushroom', dx: -1, dy: 2, variant: 0 },
      { kind: 'pod', dx: 2, dy: -2, variant: 1 },
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
// 128x128 soil basin, ringed by a 2-tile cliff belt with a water moat just inside it. The spawn
// hub is a central stone plaza; four stone-path spokes lead N/E/S/W to a deliberately composed
// destination region apiece — north grassland+groves framing a pond, east red-barren ruins and a
// crash site, south bone-bed flats with twin ossuaries, west a stone-path rest-stop settlement.
// Mid-spoke clusters keep each journey from reading as empty soil, and a grass apron + early chest
// sit beside spawn so collectibles turn up within the first few steps. Props read as arrangements
// (rows, clusters, framing a focal point) — never single random drops.
function buildWorld(): WorldMap {
  const W = 128, C = 64;
  const b = new MapBuilder(W, W, GroundType.Soil);
  b.border(2, GroundType.Cliff);
  // water moat just inside the cliff (blocked)
  for (let i = 2; i < W - 2; i++) {
    for (const [x, y] of [[i, 2], [i, W - 3], [2, i], [W - 3, i]] as const) { b.setGround(x, y, GroundType.Water); b.block(x, y); }
  }

  // a blocked pond: paint water, then block every water tile in its bounding box
  const pond = (cx: number, cy: number, r: number, seed: number) => {
    b.blob(cx, cy, r, GroundType.Water, seed);
    for (let ty = cy - r - 1; ty <= cy + r + 1; ty++)
      for (let tx = cx - r - 1; tx <= cx + r + 1; tx++)
        if (b.inBounds(tx, ty) && b.ground[ty * W + tx] === GroundType.Water) b.block(tx, ty);
  };

  // --- North: grassland + groves, framing a pond focal point ----------------------------------
  b.blob(C, 34, 20, GroundType.Grass, 11);
  b.blob(C - 16, 30, 8, GroundType.Grass, 17);
  b.blob(C + 16, 30, 8, GroundType.Grass, 19);
  pond(C, 12, 5, 101); // sits above the spoke's end so you arrive at its shore, not in it
  b.scene('grove', C - 14, 30);
  b.scene('grove', C + 14, 30);
  b.prop('tree', C - 6, 20, 0, true).prop('tree', C + 6, 20, 1, true);
  b.prop('tree', C - 3, 18, 2, true).prop('tree', C + 3, 18, 0, true);
  b.prop('mushroom', C - 12, 28, 0).prop('mushroom', C + 12, 28, 1).prop('mushroom', C, 22, 0);
  b.prop('flower', C - 4, 38, 0).prop('flower', C + 4, 38, 1).prop('flower', C, 42, 0);
  // mid-spoke cluster so the walk north isn't bare
  b.prop('tree', C - 4, 48, 1, true).prop('mushroom', C + 4, 48, 0).prop('flower', C - 3, 52, 1);

  // --- East: red-barren wastes → ruin-field + crash-site --------------------------------------
  b.blob(104, C, 16, GroundType.RedBarren, 47);
  b.blob(86, C - 10, 8, GroundType.RedBarren, 53);
  b.blob(90, C + 11, 8, GroundType.RedBarren, 59);
  b.scene('ruin-field', 98, C - 8);
  b.scene('crash-site', 110, C + 8);
  b.prop('boulder', 84, C + 6, 0, true).prop('boulder', 116, C - 8, 1, true);
  b.prop('scrap', 92, C, 0).prop('scrap', 118, C + 3, 1);
  b.prop('antenna', 112, C - 10, 0, true);
  // mid-spoke cluster
  b.prop('scrap', 84, C - 3, 0).prop('boulder', 86, C + 3, 1, true);

  // --- South: bone-bed flats → twin ossuaries (chests) + statue landmark ----------------------
  b.blob(C, 100, 16, GroundType.BoneBed, 71);
  b.blob(C - 12, 92, 7, GroundType.BoneBed, 73);
  b.blob(C + 12, 108, 7, GroundType.BoneBed, 79);
  b.scene('bone-bed', C - 9, 96);
  b.scene('bone-bed', C + 9, 106);
  b.prop('bones', C, 90, 0).prop('bones', C - 4, 102, 1).prop('bones', C + 4, 102, 0);
  b.prop('bones', C - 8, 110, 1).prop('bones', C + 8, 110, 0);
  b.prop('statue', C, 114, 0, true);
  // mid-spoke cluster
  b.prop('bones', C - 3, 84, 0).prop('bones', C + 3, 84, 1);

  // --- West: stone-path settlement → rest-stop ------------------------------------------------
  b.fillRect(8, C - 8, 26, 17, GroundType.StonePath);
  b.scene('rest-stop', 20, C);
  b.prop('bench', 14, C - 4, 0, true).prop('bench', 28, C + 4, 0, true);
  b.prop('signpost', 32, C - 5, 0, true).prop('signpost', 10, C + 5, 0, true);
  b.prop('bedroll', 16, C + 5, 0).prop('boulder', 30, C - 6, 0, true);
  // mid-spoke cluster
  b.prop('signpost', 46, C - 3, 0, true).prop('bench', 48, C + 2, 0, true);

  // --- Diagonal quadrants between the spokes: four side-zones to reward wandering off-path -----
  // Northwest: a marsh — grass fringe around still water pools, drifting jellyfish.
  b.blob(28, 30, 9, GroundType.Grass, 301);
  pond(24, 25, 3, 307);
  pond(34, 34, 3, 311);
  b.scene('marsh', 28, 30);
  b.prop('mushroom', 21, 34, 0).prop('flower', 35, 26, 1).prop('jellyfish', 26, 38, 2);
  b.prop('signpost', 44, 44, 0, true); // trail marker off the plaza's NW corner

  // Northeast: an overlook ridge — antenna mast, data terminal, a vein of gems in the barrens.
  b.blob(98, 30, 10, GroundType.RedBarren, 331);
  b.scene('overlook', 98, 30);
  b.prop('boulder', 91, 36, 1, true).prop('boulder', 106, 23, 0, true);
  b.prop('gem', 104, 34, 0).prop('scrap', 90, 27, 1);
  b.prop('signpost', 84, 44, 0, true); // trail marker off the plaza's NE corner

  // Southeast: a crystal hollow — gem clusters and glowing caps ringing a small grass pool.
  b.blob(98, 98, 8, GroundType.Grass, 351);
  pond(105, 104, 3, 357);
  b.scene('crystal-hollow', 96, 96);
  b.prop('gem', 92, 104, 0).prop('mushroom', 104, 92, 1).prop('boulder', 89, 91, 0, true);
  b.prop('signpost', 84, 84, 0, true); // trail marker off the plaza's SE corner

  // Southwest: a wild overgrown grove — feral trees, mossy stumps, blooms underfoot.
  b.blob(30, 98, 11, GroundType.Grass, 371);
  b.scene('grove', 30, 96);
  b.prop('tree', 23, 102, 2, true).prop('tree', 37, 92, 0, true).prop('tree', 35, 105, 1, true);
  b.prop('stump', 25, 93, 0).prop('mushroom', 33, 101, 0).prop('flower', 21, 100, 1).prop('flower', 37, 99, 0);
  b.prop('signpost', 44, 84, 0, true); // trail marker off the plaza's SW corner

  // --- spawn hub plaza + four stone-path spokes -----------------------------------------------
  b.fillRect(C - 4, C - 4, 9, 9, GroundType.StonePath);  // plaza
  b.fillRect(C - 1, 22, 2, 38, GroundType.StonePath);    // north spoke (stops at the pond shore)
  b.fillRect(C - 1, C + 5, 2, 38, GroundType.StonePath); // south spoke
  b.fillRect(20, C - 1, 40, 2, GroundType.StonePath);    // west spoke
  b.fillRect(C + 5, C - 1, 40, 2, GroundType.StonePath); // east spoke

  // --- spawn apron: grass beside the plaza + an early chest so artifacts turn up immediately ---
  b.blob(C - 10, C + 10, 5, GroundType.Grass, 201);
  b.blob(C + 10, C + 10, 5, GroundType.Grass, 203);
  b.prop('chest', C + 5, C + 6, 0, true); // just off the SE corner, easy to find and face
  b.prop('signpost', C + 2, C - 2, 0, true); // central plaza signpost

  b.spawnAt(C, C);

  // bake each scene's ground stamps + blocked footprints into the layers
  for (const s of b.scenes) {
    const def = SCENE_DEFS[s.kind];
    for (const g of def.ground ?? []) b.fillRect(s.tx + g.dx, s.ty + g.dy, g.w, g.h, g.g);
    for (const p of expandScene(s)) if (p.blocked) b.block(p.tx, p.ty);
  }

  // keep the plaza + spokes walkable even where a region painted/stamped over them.
  // Every rectangle below is verified to contain no water tiles, so this never opens the moat/pond.
  const clearWalk = (x: number, y: number, w: number, h: number) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++)
      if (b.inBounds(tx, ty)) b.collision[ty * W + tx] = 0;
  };
  clearWalk(C - 4, C - 4, 9, 9);  // plaza
  clearWalk(C - 1, 22, 2, 38);    // north spoke
  clearWalk(C - 1, C + 5, 2, 38); // south spoke
  clearWalk(20, C - 1, 40, 2);    // west spoke
  clearWalk(C + 5, C - 1, 40, 2); // east spoke
  b.block(C + 2, C - 2); // re-solidify the plaza signpost the clear just opened

  return b.build();
}

export const WORLD_MAP: WorldMap = buildWorld();
