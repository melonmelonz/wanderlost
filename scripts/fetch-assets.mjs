// scripts/fetch-assets.mjs
// Build-time asset pull. Downloads EVERYTHING the game needs into public/assets/ so the
// running game serves only local static files (no live PixelLab/mute-pixel fetches at runtime).
import { mkdir, writeFile, copyFile, readdir, rm, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const PUB = join(ROOT, 'public/assets');
const MUTE_BASE = 'https://mute-pixel.pages.dev/assets';
const LOCAL_MUTE = process.env.HOME + '/dev/mute-game/assets';
const PIXELLAB_API = 'https://api.pixellab.ai/mcp';
const PIXELLAB_TOKEN = process.env.PIXELLAB_TOKEN;

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

// 1) Characters — pulled from PixelLab as full character zips (rotations + walking frames).
//    These are the canonical source art (the mute-pixel display PNGs had no walk cycles).
//    Normalizes into: characters/{slug}/rotations/{dir}.png and characters/{slug}/walk/{dir}/{n}.png
const CHARACTERS = [
  { slug: 'crab-head-v2',   id: '19a81f05-f60c-4a7a-a582-194505d48a88' },
  { slug: 'green-alien-v2', id: 'd9f23604-f47b-4c13-8802-30585cd70a20' },
  { slug: 'red-hair-v2',    id: 'e0e0dba8-2feb-45ce-9865-b934db108a11' },
  { slug: 'doug',           id: '5871ce77-b00c-4051-8868-ea0eb0ae5108' },
];

async function downloadCharacter({ slug, id }) {
  if (!PIXELLAB_TOKEN) { console.warn(`PIXELLAB_TOKEN not set — skipping character ${slug}`); return; }
  const zipPath = join(tmpdir(), `wl-${slug}.zip`);
  const exDir = join(tmpdir(), `wl-${slug}`);
  // download zip via pixellab download endpoint (auth required)
  const res = await fetch(`${PIXELLAB_API}/characters/${id}/download`, {
    headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`character ${slug} download -> ${res.status}`);
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  await rm(exDir, { recursive: true, force: true });
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', exDir]);
  // the zip contains a top-level char dir (e.g. "Crab_Head/") alongside a metadata.json — pick the dir
  const top = (await readdir(exDir, { withFileTypes: true })).find(e => e.isDirectory());
  if (!top) throw new Error(`character ${slug}: no top-level dir in zip`);
  const base = join(exDir, top.name);
  // rotations
  const rotSrc = join(base, 'rotations');
  if (existsSync(rotSrc)) await copyTree(rotSrc, join(PUB, `characters/${slug}/rotations`));
  // walking animation: animations/walking-XXXX/{dir}/frame_NNN.png -> walk/{dir}/{n}.png
  const animsDir = join(base, 'animations');
  if (existsSync(animsDir)) {
    const walkDir = (await readdir(animsDir)).find(d => d.startsWith('walking'));
    if (walkDir) {
      for (const dir of await readdir(join(animsDir, walkDir))) {
        const frames = (await readdir(join(animsDir, walkDir, dir))).filter(f => f.endsWith('.png')).sort();
        const destDir = join(PUB, `characters/${slug}/walk/${dir}`);
        await mkdir(destDir, { recursive: true });
        for (let i = 0; i < frames.length; i++) {
          await copyFile(join(animsDir, walkDir, dir, frames[i]), join(destDir, `${i}.png`));
        }
      }
    }
  }
  await rm(zipPath, { force: true });
  await rm(exDir, { recursive: true, force: true });
  console.log('character', slug, '(rotations + walk)');
}

for (const c of CHARACTERS) await downloadCharacter(c);

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

// 4) Pixellab Wang tilesets (need PIXELLAB_TOKEN). Endpoint path is /tilesets/{id}, NOT /topdown-tilesets.
//    NOTE tile sizes differ: soil = 16x16px, red-barren = 32x32px. The slicer must read tile_size
//    from each metadata.json and scale to the world TILE size on draw.
if (!PIXELLAB_TOKEN) {
  console.warn('PIXELLAB_TOKEN not set — skipping Wang tileset fetch');
} else {
  const tilesets = [
    { id: '398d7604-a3b6-4a60-aec9-6189893b9466', slug: 'soil' },        // 16x16
    { id: 'df8064b8-65cc-47a7-87f4-086a6273d857', slug: 'red-barren' },  // 32x32
  ];
  const auth = { headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` } };
  for (const t of tilesets) {
    const dir = join(PUB, `tilesets/${t.slug}`);
    await mkdir(dir, { recursive: true });
    const img = await fetch(`${PIXELLAB_API}/tilesets/${t.id}/image`, auth);
    if (!img.ok) throw new Error(`tileset ${t.slug} image -> ${img.status}`);
    await writeFile(join(dir, 'image.png'), Buffer.from(await img.arrayBuffer()));
    const meta = await fetch(`${PIXELLAB_API}/tilesets/${t.id}/metadata`, auth);
    if (!meta.ok) throw new Error(`tileset ${t.slug} metadata -> ${meta.status}`);
    await writeFile(join(dir, 'metadata.json'), Buffer.from(await meta.arrayBuffer()));
    console.log('pixellab tileset', t.slug);
  }
}

// 5) Bone-fragment / decoration overlay tiles (tiles_pro, 16 variations, 32x32).
//    Served from public backblaze storage URLs — no auth needed.
//    Variations: 0-2 bone fragments, mushroom cluster, rusted debris, crystal, puddle, flower patch, ...
const BONE_BASE = 'https://backblaze.pixellab.ai/file/pixellab-tiles/080f7873-d1fc-444d-9aff-ee22b01a34da/e2b02fa7-12bc-46b7-a128-a80c81932f3d';
for (let i = 0; i < 16; i++) {
  await fetchTo(`${BONE_BASE}/tile_${i}.png`, join(PUB, `tilesets/bone-overlay/tile_${i}.png`));
}

console.log('asset fetch complete');
