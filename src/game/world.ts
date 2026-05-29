// src/game/world.ts
// Deterministic chunked world. Every client generates the identical world from the seed;
// the network only carries who-moved and what's-been-found.
import { chunkRng, randInt, xmur3, mulberry32 } from './rng';

export const TILE = 32;
export const CHUNK = 16; // tiles per chunk side

export type Biome = 'soil' | 'red-barren';
export type ObjectKind =
  | 'chest' | 'campfire' | 'tree' | 'ruin' | 'antenna' | 'ship' | 'pod' | 'terminal' | 'jellyfish';

export interface Tile {
  biome: Biome;
  ossuary: boolean; // bone-fragment overlay
  grass: boolean;
  grassVariant: number;
}
export interface WorldObject { kind: ObjectKind; tx: number; ty: number; variant: number; }
export interface Chunk { cx: number; cy: number; tiles: Tile[]; objects: WorldObject[]; }

// Coarse value noise over 3x3 chunk regions -> contiguous biome patches.
function biomeNoise(seed: number, cx: number, cy: number): number {
  const r = chunkRng(seed ^ 0x9e3779b9, Math.floor(cx / 3), Math.floor(cy / 3));
  return r();
}

// Value-noise lattice sample in [0,1), stable per (seed,biome,gx,gy).
function lattice(seed: number, biome: string, gx: number, gy: number): number {
  return mulberry32(xmur3(`${seed}|${biome}|${gx}|${gy}`)())();
}

// Bilinearly-interpolated smooth noise over a 4-corner-unit lattice.
function smoothNoise(seed: number, biome: string, x: number, y: number): number {
  const s = 4;
  const gx = Math.floor(x / s), gy = Math.floor(y / s);
  const fx = x / s - gx, fy = y / s - gy;
  const a = lattice(seed, biome, gx, gy), b = lattice(seed, biome, gx + 1, gy);
  const c = lattice(seed, biome, gx, gy + 1), d = lattice(seed, biome, gx + 1, gy + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); // smoothstep
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class World {
  private cache = new Map<string, Chunk>();
  constructor(public readonly seed: number) {}

  static chunkKey(cx: number, cy: number) { return `${cx},${cy}`; }
  static tileKey(tx: number, ty: number) { return `${tx},${ty}`; }

  getChunk(cx: number, cy: number): Chunk {
    const key = World.chunkKey(cx, cy);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const chunk = this.genChunk(cx, cy);
    this.cache.set(key, chunk);
    return chunk;
  }

  evictOutside(centerCx: number, centerCy: number, radius = 3) {
    for (const key of [...this.cache.keys()]) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      if (Math.abs(cx - centerCx) > radius || Math.abs(cy - centerCy) > radius) this.cache.delete(key);
    }
  }

  private genChunk(cx: number, cy: number): Chunk {
    const rng = chunkRng(this.seed, cx, cy);
    const baseBiome: Biome = biomeNoise(this.seed, cx, cy) < 0.6 ? 'soil' : 'red-barren';
    const tiles: Tile[] = [];
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      const ossuary = rng() < 0.15;
      const grassChance = ossuary ? 0.20 : 0.125;
      const grass = rng() < grassChance;
      tiles.push({ biome: baseBiome, ossuary, grass, grassVariant: randInt(rng, 0, 3) });
    }
    const objects: WorldObject[] = [];
    const place = (kind: ObjectKind, prob: number, maxVariant: number) => {
      if (rng() < prob) {
        const idx = randInt(rng, 0, CHUNK * CHUNK - 1);
        objects.push({
          kind,
          tx: cx * CHUNK + (idx % CHUNK),
          ty: cy * CHUNK + Math.floor(idx / CHUNK),
          variant: randInt(rng, 0, maxVariant),
        });
      }
    };
    place('chest', 0.4, 6);
    place('campfire', 0.1, 0);
    if (rng() < 0.5) { const n = randInt(rng, 1, 3); for (let k = 0; k < n; k++) place('tree', 1, 3); }
    place('ruin', 0.05, 1);
    place('antenna', 0.02, 0);
    place('ship', 0.01, 1);
    place('pod', 0.05, 2);
    place('terminal', 0.03, 4);
    return { cx, cy, tiles, objects };
  }

  // Per-corner terrain for Wang blending. Smooth value noise -> contiguous "upper" pools
  // (glowing water on soil, cracked veins on red-barren) instead of salt-and-pepper.
  cornerUpper(biome: Biome, cx: number, cy: number): 0 | 1 {
    return smoothNoise(this.seed, biome, cx, cy) > 0.62 ? 1 : 0;
  }

  tileAt(tx: number, ty: number): Tile {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const lx = ((tx % CHUNK) + CHUNK) % CHUNK, ly = ((ty % CHUNK) + CHUNK) % CHUNK;
    return this.getChunk(cx, cy).tiles[ly * CHUNK + lx]!;
  }
}
