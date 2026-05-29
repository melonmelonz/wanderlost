// scripts/fetch-assets.mjs
// Build-time asset pull. Reads scripts/asset-manifest.json and downloads everything the game
// serves locally into public/assets/, so the running game serves only local static files
// (no live PixelLab / mute-pixel fetches at runtime).
//
// Every downloaded file is verified to be a real image: the mute Pages SPA returns 200 + text/html
// for any path, and a failed PixelLab pull can return JSON, so HTTP status alone is not proof.
import { mkdir, writeFile, copyFile, readdir, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const PUB = join(ROOT, 'public/assets');
const MUTE_BASE = 'https://mute-pixel.pages.dev/assets';
const LOCAL_MUTE = process.env.HOME + '/dev/mute-game/assets';
const PIXELLAB_API = 'https://api.pixellab.ai/mcp';
const TOKEN = process.env.PIXELLAB_TOKEN;

const manifest = JSON.parse(await readFile(join(ROOT, 'scripts/asset-manifest.json'), 'utf8'));
let failures = 0;

function isImage(buf) {
  // PNG \x89PNG  |  GIF GIF8
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

if (!TOKEN) { console.error('PIXELLAB_TOKEN not set'); process.exit(1); }
const auth = { Authorization: `Bearer ${TOKEN}` };

// 1) Wang tileset family (image + metadata) — endpoint is /tilesets/{id}, tile sizes vary so the
//    renderer reads tile_size from each metadata.json.
for (const t of manifest.tilesets) {
  const dir = join(PUB, `tilesets/${t.slug}`);
  await fetchImage(`${PIXELLAB_API}/tilesets/${t.id}/image`, join(dir, 'image.png'), auth);
  const meta = await fetch(`${PIXELLAB_API}/tilesets/${t.id}/metadata`, { headers: auth });
  if (!meta.ok) { console.error('FAIL meta', t.slug, meta.status); failures++; }
  else await writeFile(join(dir, 'metadata.json'), Buffer.from(await meta.arrayBuffer()));
}

// 2) Animated environmental GIFs
await fetchImage(`${MUTE_BASE}/gifs/campfire-flicker.gif`, join(PUB, 'objects/campfire-flicker.gif'));
await fetchImage(`${MUTE_BASE}/gifs/grass-sway.gif`, join(PUB, 'grass/grass-sway.gif'));

// 3) Characters — pulled from PixelLab as full character zips (rotations + walking frames).
//    Normalizes into characters/{slug}/rotations/{dir}.png and characters/{slug}/walk/{dir}/{n}.png
async function downloadCharacter({ slug, id }) {
  const zipPath = join(tmpdir(), `wl-${slug}.zip`);
  const exDir = join(tmpdir(), `wl-${slug}`);
  const res = await fetch(`${PIXELLAB_API}/characters/${id}/download`, { headers: auth });
  if (!res.ok) { console.error('FAIL character', slug, res.status); failures++; return; }
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  await rm(exDir, { recursive: true, force: true });
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', exDir]);
  const top = (await readdir(exDir, { withFileTypes: true })).find(e => e.isDirectory());
  if (!top) { console.error('FAIL character', slug, 'no top-level dir in zip'); failures++; return; }
  const base = join(exDir, top.name);
  const rotSrc = join(base, 'rotations');
  if (existsSync(rotSrc)) await copyTree(rotSrc, join(PUB, `characters/${slug}/rotations`));
  const animsDir = join(base, 'animations');
  if (existsSync(animsDir)) {
    const walkDir = (await readdir(animsDir)).find(d => d.startsWith('walking'));
    if (walkDir) {
      for (const dir of await readdir(join(animsDir, walkDir))) {
        const frames = (await readdir(join(animsDir, walkDir, dir))).filter(f => f.endsWith('.png')).sort();
        const destDir = join(PUB, `characters/${slug}/walk/${dir}`);
        await mkdir(destDir, { recursive: true });
        for (let i = 0; i < frames.length; i++) await copyFile(join(animsDir, walkDir, dir, frames[i]), join(destDir, `${i}.png`));
      }
    }
  }
  await rm(zipPath, { force: true });
  await rm(exDir, { recursive: true, force: true });
  console.log('character', slug, '(rotations + walk)');
}
for (const c of manifest.characters) await downloadCharacter(c);

// 4) Doug + local mute props/tilesets from the local mute-game checkout.
if (existsSync(LOCAL_MUTE)) {
  await copyTree(join(LOCAL_MUTE, 'space-traveler/rotations'), join(PUB, 'characters/doug/rotations'));
  await copyTree(join(LOCAL_MUTE, 'space-traveler/animations/zero-g-float'), join(PUB, 'characters/doug/zero-g-float'));
  if (existsSync(join(LOCAL_MUTE, 'space-traveler/animations/death')))
    await copyTree(join(LOCAL_MUTE, 'space-traveler/animations/death'), join(PUB, 'characters/doug/death'));
  await copyTree(join(LOCAL_MUTE, 'objects'), join(PUB, 'objects/mute'));
} else { console.error('FAIL LOCAL_MUTE missing'); failures++; }

// 5) Scene props pulled by object id into objects/props/{kind}-{v}.png
for (const p of manifest.props) {
  for (let v = 0; v < (p.variants ?? 1); v++) {
    await fetchImage(`${PIXELLAB_API}/objects/${p.id}/download`, join(PUB, `objects/props/${p.kind}-${v}.png`), auth);
  }
}

if (failures) { console.error(`asset fetch FAILED: ${failures} missing/invalid`); process.exit(1); }
console.log('asset fetch complete');
