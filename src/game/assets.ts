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
