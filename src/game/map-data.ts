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
