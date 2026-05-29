// scripts/fetch-assets.mjs
import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const PUB = join(ROOT, 'public/assets');
const MUTE_BASE = 'https://mute-pixel.pages.dev/assets';
const LOCAL_MUTE = process.env.HOME + '/dev/mute-game/assets';

const DIRS = ['south','south-east','east','north-east','north','north-west','west','south-west'];

async function fetchTo(url, dest) {
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log('fetched', url, '->', dest.replace(ROOT, ''));
}

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src, { withFileTypes: true })) {
    const s = join(src, name.name), d = join(dest, name.name);
    if (name.isDirectory()) await copyTree(s, d);
    else { await mkdir(dirname(d), { recursive: true }); await copyFile(s, d); }
  }
}

// 1) V2 characters
for (const slug of ['crab-head-v2', 'green-alien-v2', 'red-hair-v2']) {
  for (const dir of DIRS) {
    const url = `${MUTE_BASE}/display/${slug}-${dir}.png`;
    const dest = join(PUB, `characters/${slug}/rotations/${dir}.png`);
    await fetchTo(url, dest);
  }
}

// 2) Animated environmental GIFs
await fetchTo(`${MUTE_BASE}/gifs/campfire-flicker.gif`, join(PUB, 'objects/campfire-flicker.gif'));
await fetchTo(`${MUTE_BASE}/gifs/grass-sway.gif`, join(PUB, 'grass/grass-sway.gif'));

// 3) Doug from local mute-game (canonical: rotations + zero-g-float + death)
if (existsSync(LOCAL_MUTE)) {
  await copyTree(join(LOCAL_MUTE, 'space-traveler/rotations'), join(PUB, 'characters/doug/rotations'));
  await copyTree(join(LOCAL_MUTE, 'space-traveler/animations/zero-g-float'), join(PUB, 'characters/doug/zero-g-float'));
  await copyTree(join(LOCAL_MUTE, 'space-traveler/animations/death'), join(PUB, 'characters/doug/death'));
  // Doug zero-g-float GIFs (used as primary animation source)
  await copyTree(join(LOCAL_MUTE, 'gifs'), join(PUB, 'characters/doug/gifs'));
  // Misc objects
  await copyTree(join(LOCAL_MUTE, 'objects'), join(PUB, 'objects/mute'));
  await copyTree(join(LOCAL_MUTE, 'tilesets'), join(PUB, 'tilesets/mute'));
} else {
  console.warn('LOCAL_MUTE not found; skipping Doug + local asset copy');
}

console.log('asset fetch complete');
