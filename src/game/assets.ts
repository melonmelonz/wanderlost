// src/game/assets.ts
// Image loading + character sprite resolution. Everything is a local PNG under /assets
// (pulled at build time). Animations are PNG frame sequences so the canvas can step frames
// — GIFs can't be frame-advanced when drawn to a 2D context, so we never rely on them for
// character motion.
export type Dir = 'south'|'south-east'|'east'|'north-east'|'north'|'north-west'|'west'|'south-west';
export const DIRS: Dir[] = ['south','south-east','east','north-east','north','north-west','west','south-west'];

const cache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { cache.set(src, img); resolve(img); };
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export function getImage(src: string): HTMLImageElement | undefined { return cache.get(src); }

export async function preloadAll(srcs: string[]): Promise<void> {
  await Promise.all(srcs.map(s => loadImage(s).catch(e => console.warn(e.message))));
}

// A character's drawable assets, resolved to concrete local paths.
//   rotations: one still PNG per facing (used when standing)
//   walk:      per-facing array of frame PNG paths (used when moving)
export interface CharacterAssets {
  slug: string;
  rotations: Record<Dir, string>;
  walk: Record<Dir, string[]>;
  walkFrames: number;
}

// Doug's canonical movement is the 9-frame zero-g-float; the V2 chars use 6-frame walk cycles.
const WALK_LAYOUT: Record<string, { folder: string; frames: number }> = {
  doug: { folder: 'zero-g-float', frames: 9 },
};
const DEFAULT_WALK = { folder: 'walk', frames: 6 };

export function characterAssets(slug: string): CharacterAssets {
  const base = `/assets/characters/${slug}`;
  const layout = WALK_LAYOUT[slug] ?? DEFAULT_WALK;
  const rotations = Object.fromEntries(
    DIRS.map(d => [d, `${base}/rotations/${d}.png`]),
  ) as Record<Dir, string>;
  const walk = Object.fromEntries(
    DIRS.map(d => [d, Array.from({ length: layout.frames }, (_, i) => `${base}/${layout.folder}/${d}/${i}.png`)]),
  ) as Record<Dir, string[]>;
  return { slug, rotations, walk, walkFrames: layout.frames };
}

// All image paths a character needs, for preloading.
export function characterSources(slug: string): string[] {
  const a = characterAssets(slug);
  return [...Object.values(a.rotations), ...Object.values(a.walk).flat()];
}

// ---- Wang tilesets (pixellab `tileset15` format) -------------------------------------------
// Each tileset blends two terrains ("lower" / "upper") across tile corners. We index every tile
// by its 4-corner signature so the renderer can pick the right blend for any corner pattern.
export type Corner = 0 | 1; // 0 = lower, 1 = upper
export interface WangTileset {
  img: HTMLImageElement;
  tileSize: number;
  // key = NW | NE<<1 | SW<<2 | SE<<3  ->  source rect [x,y,w,h]
  rects: Map<number, [number, number, number, number]>;
}

export function cornerKey(nw: Corner, ne: Corner, sw: Corner, se: Corner): number {
  return nw | (ne << 1) | (sw << 2) | (se << 3);
}

const tilesetCache = new Map<string, WangTileset>();

interface WangMetaTile {
  corners: { NE: string; NW: string; SE: string; SW: string };
  bounding_box: { x: number; y: number; width: number; height: number };
}

export async function loadWangTileset(slug: string): Promise<WangTileset> {
  const hit = tilesetCache.get(slug);
  if (hit) return hit;
  const [img, meta] = await Promise.all([
    loadImage(`/assets/tilesets/${slug}/image.png`),
    fetch(`/assets/tilesets/${slug}/metadata.json`).then(r => r.json()),
  ]);
  const tileSize: number = meta.tile_size?.width ?? meta.tileset_data?.tile_size?.width ?? 32;
  const rects = new Map<number, [number, number, number, number]>();
  const u = (s: string): Corner => (s === 'upper' ? 1 : 0);
  for (const t of meta.tileset_data.tiles as WangMetaTile[]) {
    const k = cornerKey(u(t.corners.NW), u(t.corners.NE), u(t.corners.SW), u(t.corners.SE));
    const b = t.bounding_box;
    rects.set(k, [b.x, b.y, b.width, b.height]);
  }
  const ts: WangTileset = { img, tileSize, rects };
  tilesetCache.set(slug, ts);
  return ts;
}

export function getWangTileset(slug: string): WangTileset | undefined { return tilesetCache.get(slug); }
