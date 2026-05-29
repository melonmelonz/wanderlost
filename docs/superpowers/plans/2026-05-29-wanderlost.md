# wanderlost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy `wanderlost` — a multiplayer pixel-art walking sim with shared world state, day/night cycle, persistence, biomes, and four playable characters — to Cloudflare Pages + a sibling Worker hosting a Durable Object, in ~10 hours.

**Architecture:** Vite + Preact + TypeScript frontend renders the world on Canvas 2D with a hand-rolled chunked tile system. Preact owns HUD/inventory overlays only; the game loop is plain Canvas. A sibling Cloudflare Worker hosts a single global Durable Object (`World`) that holds the authoritative reveal/open state and broadcasts WebSocket messages between connected voyagers. Client and server share `worldSeed`; the client locally generates all visuals deterministically, and the server only transmits state deltas.

**Tech Stack:** Vite, Preact, TypeScript (strict), Canvas 2D, Web Audio, WebSockets, Cloudflare Pages, Cloudflare Workers + Durable Objects, `wrangler`.

**Spec:** `~/docs/superpowers/specs/2026-05-29-wanderlost-design.md` — read this first if you don't have full context.

> **Runtime convention (supersedes inline commands below):** This project uses **bun**, not pnpm/npm. Translate every command accordingly: `pnpm install`→`bun install`, `pnpm add -D X`→`bun add -d X`, `pnpm dev`→`bun run dev`, `pnpm build`→`bun run build`, `pnpm test`→`bun test`. Test files import from **`bun:test`** (`import { describe, it, expect } from 'bun:test'`), NOT `vitest`. DOM globals (localStorage etc.) are provided by happy-dom via `test-setup.ts` (preloaded in `bunfig.toml`) — no per-test jsdom setup needed. No `vitest` dependency exists.

---

## File Structure

Files to be created or modified, grouped by responsibility:

**Frontend root:**
- `wanderlost/index.html` — single-page entry
- `wanderlost/package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`
- `wanderlost/wrangler.toml` — Pages config + DO binding
- `wanderlost/scripts/fetch-assets.mjs` — Node script to curl assets

**Frontend source (`wanderlost/src/`):**
- `main.tsx` — Preact mount, root component
- `App.tsx` — overlay layout, character-select gate
- `HUD.tsx` — specimens counter, thought bubble, day-title
- `Inventory.tsx` — 3-tab overlay
- `CharacterSelect.tsx` — first-visit modal, reused for in-game swap
- `style.css` — full-viewport, starfield, pixelated rendering
- `content/flavor-specimens.ts`, `flavor-thoughts.ts`, `flavor-days.ts`, `flavor-notes.ts` — text pools
- `game/engine.ts` — RAF loop, fixed-step update
- `game/input.ts` — WASD/arrows/touch, input buffer
- `game/render.ts` — camera, draw order, y-sort
- `game/assets.ts` — preloader, sprite atlas, animation player
- `game/rng.ts` — mulberry32 + xmur3
- `game/world.ts` — chunked gen, biome noise, eviction
- `game/doug.ts` — local player state, 8-dir slide tween, anim selector
- `game/peers.ts` — other-player tracking + interpolation
- `game/grass.ts` — interaction, reveal queue, opacity state
- `game/objects.ts` — chests, campfires, trees, ruins placement + draw
- `game/daynight.ts` — cycle clock, tint overlay, starfield, day-card
- `game/audio.ts` — Web Audio, loop, volume, mute, duck
- `game/save.ts` — versioned localStorage snapshot, autosave
- `game/net.ts` — WebSocket client, predict/reconcile, reconnect

**Worker (`wanderlost/worker/`):**
- `worker/package.json`, `wrangler.toml`, `tsconfig.json`
- `worker/src/index.ts` — fetch handler, WS upgrade
- `worker/src/world.ts` — `World` DO class

**Public assets (`wanderlost/public/assets/`):**
- `characters/doug/` — local Doug sprites copied from `~/dev/mute-game/`
- `characters/{red-hair,green-alien,crab-head}-v2/` — fetched from mute-pixel + generated walks
- `tilesets/` — Wang PNG+JSON + bone tile
- `grass/`, `objects/`, `audio/`, `CREDITS.md`

**Docs (`wanderlost/docs/superpowers/`):**
- `specs/2026-05-29-wanderlost-design.md` — copied from `~/docs/superpowers/specs/`
- `plans/2026-05-29-wanderlost.md` — copied from `~/docs/superpowers/plans/`

---

## Task 1: Repo scaffold + Vite/Preact/TS setup

**Files:**
- Create: `~/dev/wanderlost/` (repo root)
- Create: `wanderlost/package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `index.html`, `src/main.tsx`, `src/style.css`

- [ ] **Step 1: Create repo directory and initialize git**

```bash
mkdir -p ~/dev/wanderlost && cd ~/dev/wanderlost
git init
gh repo create melonmelonz/wanderlost --private --source=. --remote=origin
```

- [ ] **Step 2: Verify remote points to Penn's account**

Run: `cd ~/dev/wanderlost && git remote -v`
Expected: `origin  https://github.com/melonmelonz/wanderlost.git (fetch)` (and push). Per memory `feedback_never_push_upstream` — confirm `melonmelonz` not anything else.

- [ ] **Step 3: Create package.json**

```json
{
  "name": "wanderlost",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "fetch-assets": "node scripts/fetch-assets.mjs",
    "deploy": "pnpm build && wrangler pages deploy dist --project-name=wanderlost --commit-dirty=true"
  },
  "dependencies": {
    "preact": "^10.22.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "wrangler": "^3.78.0",
    "@cloudflare/workers-types": "^4.20240914.0"
  }
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022' },
});
```

Then add the preset to deps: `pnpm add -D @preact/preset-vite`

- [ ] **Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "preserve",
    "jsxImportSource": "preact",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "scripts"]
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.dev.vars
*.log
.DS_Store
```

- [ ] **Step 7: Create index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>wanderlost</title>
  <link rel="stylesheet" href="/src/style.css">
</head>
<body>
  <div id="root"></div>
  <canvas id="game"></canvas>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 8: Create src/style.css**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
body { font-family: 'Space Mono', monospace; color: #e8e0d0; image-rendering: pixelated; }
#root { position: fixed; inset: 0; z-index: 10; pointer-events: none; }
#root > * { pointer-events: auto; }
#game { position: fixed; inset: 0; z-index: 1; display: block; }
```

- [ ] **Step 9: Create src/main.tsx**

```tsx
import { render } from 'preact';
import { App } from './App';
import { startEngine } from './game/engine';

render(<App />, document.getElementById('root')!);
startEngine(document.getElementById('game') as HTMLCanvasElement);
```

- [ ] **Step 10: Create stub src/App.tsx + src/game/engine.ts so build works**

```tsx
// src/App.tsx
export function App() {
  return <div style={{position:'fixed',top:8,left:8,fontSize:10,color:'#6a6050',letterSpacing:'0.2em'}}>wanderlost.</div>;
}
```

```ts
// src/game/engine.ts
export function startEngine(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    raf = requestAnimationFrame(loop);
  };
  loop();
}
```

- [ ] **Step 11: Install + verify dev server boots**

```bash
cd ~/dev/wanderlost && pnpm install && pnpm dev
```
Expected: Vite reports a local URL (usually `http://localhost:5173`). Visit it and confirm black screen with `wanderlost.` text in top-left.

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "chore: scaffold vite+preact+ts skeleton"
```

---

## Task 2: Copy spec and plan into repo

**Files:**
- Create: `wanderlost/docs/superpowers/specs/2026-05-29-wanderlost-design.md`
- Create: `wanderlost/docs/superpowers/plans/2026-05-29-wanderlost.md`

- [ ] **Step 1: Copy spec**

```bash
mkdir -p ~/dev/wanderlost/docs/superpowers/specs ~/dev/wanderlost/docs/superpowers/plans
cp ~/docs/superpowers/specs/2026-05-29-wanderlost-design.md ~/dev/wanderlost/docs/superpowers/specs/
cp ~/docs/superpowers/plans/2026-05-29-wanderlost.md ~/dev/wanderlost/docs/superpowers/plans/
```

- [ ] **Step 2: Commit**

```bash
git add docs && git commit -m "docs: import wanderlost spec and plan"
```

---

## Task 3: Asset fetch script (V2 characters + animated GIFs + Doug local copy)

**Files:**
- Create: `wanderlost/scripts/fetch-assets.mjs`
- Create: `wanderlost/public/assets/CREDITS.md`

- [ ] **Step 1: Write fetch-assets.mjs**

```js
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
```

- [ ] **Step 2: Run fetch script**

```bash
cd ~/dev/wanderlost && node scripts/fetch-assets.mjs
```
Expected: prints `fetched ...` for each URL; final line `asset fetch complete`. Verify with `ls public/assets/characters/doug/rotations/`.

- [ ] **Step 3: Create CREDITS.md**

```markdown
# Asset credits

## From mute showcase (mute-pixel.pages.dev)
Characters V2 (crab-head-v2, green-alien-v2, red-hair-v2), campfire-flicker.gif, grass-sway.gif
— generated via PixelLab AI by Penn Porterfield.

## From local mute-game project (~/dev/mute-game)
Doug character (rotations, zero-g-float, death), tile sheets, world objects
— generated via PixelLab AI by Penn Porterfield.

## Generated for wanderlost (in this repo)
V2 walk cycles, grass rustle, chest open, specimen sparkle, Doug sit-by-fire pose
— generated via PixelLab AI by Penn Porterfield.

## Audio
ambient.ogg — see audio/CREDITS.md
```

- [ ] **Step 4: Commit**

```bash
git add scripts public/assets && git commit -m "feat: fetch V2 chars + animated GIFs + local Doug assets"
```

---

## Task 4: Pull pixellab Wang tilesets + bone overlay tile via API

**Files:**
- Modify: `wanderlost/scripts/fetch-assets.mjs` (append pixellab fetch logic)
- Create: `wanderlost/public/assets/tilesets/soil/{image.png,metadata.json}`, `red-barren/...`, `bone-overlay/...`

- [ ] **Step 1: Add pixellab fetch to scripts/fetch-assets.mjs**

Append to the existing script (above the final `console.log`):

```js
// 4) Pixellab tilesets
const PIXELLAB_API = 'https://api.pixellab.ai/mcp';
const PIXELLAB_TOKEN = process.env.PIXELLAB_TOKEN;
if (!PIXELLAB_TOKEN) { console.warn('PIXELLAB_TOKEN not set — skipping pixellab fetch'); }
else {
  const tilesets = [
    { id: '398d7604-a3b6-4a60-aec9-6189893b9466', slug: 'soil' },
    { id: 'df8064b8-65cc-47a7-87f4-086a6273d857', slug: 'red-barren' },
  ];
  for (const t of tilesets) {
    const img = await fetch(`${PIXELLAB_API}/topdown-tilesets/${t.id}/image`, { headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` } });
    const meta = await fetch(`${PIXELLAB_API}/topdown-tilesets/${t.id}/metadata`, { headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` } });
    await mkdir(join(PUB, `tilesets/${t.slug}`), { recursive: true });
    await writeFile(join(PUB, `tilesets/${t.slug}/image.png`), Buffer.from(await img.arrayBuffer()));
    await writeFile(join(PUB, `tilesets/${t.slug}/metadata.json`), Buffer.from(await meta.arrayBuffer()));
    console.log('pixellab tileset', t.slug);
  }
  // Bone-fragment overlay tile (tiles_pro)
  const boneId = 'e2b02fa7-12bc-46b7-a128-a80c81932f3d';
  const boneImg = await fetch(`${PIXELLAB_API}/tiles-pro/${boneId}/image`, { headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` } });
  const boneMeta = await fetch(`${PIXELLAB_API}/tiles-pro/${boneId}/metadata`, { headers: { Authorization: `Bearer ${PIXELLAB_TOKEN}` } });
  await mkdir(join(PUB, 'tilesets/bone-overlay'), { recursive: true });
  await writeFile(join(PUB, 'tilesets/bone-overlay/image.png'), Buffer.from(await boneImg.arrayBuffer()));
  await writeFile(join(PUB, 'tilesets/bone-overlay/metadata.json'), Buffer.from(await boneMeta.arrayBuffer()));
  console.log('pixellab bone-overlay tile');
}
```

- [ ] **Step 2: Export pixellab token + run**

```bash
export PIXELLAB_TOKEN="<the token from earlier mcp add>"
cd ~/dev/wanderlost && node scripts/fetch-assets.mjs
```
Expected: prints tileset slugs. Verify `ls public/assets/tilesets/soil/` shows `image.png` and `metadata.json`.

- [ ] **Step 3: Inspect metadata format**

```bash
head -50 public/assets/tilesets/soil/metadata.json | head -c 1000
```
Expected: JSON with tile bounding boxes, corner data. This informs slicing logic in `game/assets.ts` later.

- [ ] **Step 4: Commit (asset binary will be included; OK for v1)**

```bash
git add scripts public/assets/tilesets && git commit -m "feat: pull pixellab Wang tilesets and bone overlay"
```

---

## Task 5: Kick off pixellab animation generation (async, non-blocking)

This task is dispatched EARLY and runs in the background while later tasks proceed. Generation is slow; we poll/download near deploy time. Use the pixellab MCP tools directly (not the fetch script).

**Files:**
- Create: `wanderlost/scripts/ANIMATION_JOBS.md` — tracks job IDs + status

- [ ] **Step 1: Generate V2 walk cycles (3 calls)**

For each of crab-head-v2, green-alien-v2, red-hair-v2, call `animate_character` (or `create_character_state` for a walk state) using the V2 south-facing rotation PNG as reference. Description: `"<character> walking, 8 directions, 4-6 frame loop, top-down JRPG style, matches Doug reference"`. Record returned job IDs.

- [ ] **Step 2: Generate grass rustle**

`animate_object` referencing `public/assets/grass/grass-sway.gif` frame. Description: `"tall alien grass violently rustling as something steps through, 6 frame one-shot, returns to rest"`. Record job ID.

- [ ] **Step 3: Generate chest open**

`animate_object` referencing `public/assets/objects/mute/treasure-chest-1.png`. Description: `"treasure chest opening, lid lifts, faint glow escapes, 6-8 frames, holds open on last frame"`. Record job ID.

- [ ] **Step 4: Generate specimen sparkle**

`create_1_direction_object` or `animate_object`. Description: `"small cyan-gold sparkle pickup burst, 4-6 frames, 32x32"`. Record job ID.

- [ ] **Step 5: Generate Doug sit-by-fire pose**

`create_character_state` on Doug (id `5871ce77-b00c-4051-8868-ea0eb0ae5108`). Description: `"sitting cross-legged facing camera, staring into a fire, melancholic, single frame"`. Record job ID.

- [ ] **Step 6: Write ANIMATION_JOBS.md with all job IDs**

```markdown
# Pixellab animation jobs (poll with get_object / get_character)
- v2-walk-crab: <id>
- v2-walk-alien: <id>
- v2-walk-red: <id>
- grass-rustle: <id>
- chest-open: <id>
- specimen-sparkle: <id>
- doug-sit: <id>
```

- [ ] **Step 7: Commit the tracker**

```bash
git add scripts/ANIMATION_JOBS.md && git commit -m "chore: track pixellab animation generation jobs"
```

NOTE: Download these in Task 22 (pre-deploy). Until then, the engine uses fallbacks (zero-g-float for all chars, grass-sway as rustle stand-in, static chest, no sparkle, Doug idle for sit).

---

## Task 6: RNG module (deterministic, tested)

**Files:**
- Create: `wanderlost/src/game/rng.ts`
- Create: `wanderlost/src/game/rng.test.ts`
- Modify: `package.json` (add vitest)

- [ ] **Step 1: Add vitest**

```bash
cd ~/dev/wanderlost && pnpm add -D vitest
```
Then add to package.json scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Write the failing test**

```ts
// src/game/rng.test.ts
import { describe, it, expect } from 'vitest';
import { xmur3, mulberry32, chunkRng } from './rng';

describe('rng', () => {
  it('mulberry32 is deterministic for same seed', () => {
    const a = mulberry32(12345), b = mulberry32(12345);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it('produces floats in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('chunkRng is stable per (seed,cx,cy)', () => {
    const a = chunkRng(999, 3, -5), b = chunkRng(999, 3, -5);
    expect(a()).toBe(b());
    const c = chunkRng(999, 3, -4);
    expect(chunkRng(999,3,-5)()).not.toBe(c()); // different chunk differs (overwhelmingly likely)
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm test src/game/rng.test.ts`
Expected: FAIL — `rng` module not found / exports undefined.

- [ ] **Step 4: Implement rng.ts**

```ts
// src/game/rng.ts
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chunkRng(worldSeed: number, cx: number, cy: number): () => number {
  const seedFn = xmur3(`${worldSeed}|${cx}|${cy}`);
  return mulberry32(seedFn());
}

// Helper: deterministic int in [min,max]
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `pnpm test src/game/rng.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/rng.ts src/game/rng.test.ts package.json && git commit -m "feat: deterministic seeded RNG with tests"
```

---

## Task 7: World generation — chunks, biomes, deterministic placement

**Files:**
- Create: `wanderlost/src/game/world.ts`
- Create: `wanderlost/src/game/world.test.ts`

Key constants: `TILE = 32`, `CHUNK = 16` (tiles per chunk side).

- [ ] **Step 1: Write the failing test**

```ts
// src/game/world.test.ts
import { describe, it, expect } from 'vitest';
import { World, TILE, CHUNK } from './world';

describe('world', () => {
  it('generates the same chunk twice identically', () => {
    const w = new World(4242);
    const a = w.getChunk(2, -3), b = w.getChunk(2, -3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('chunk has CHUNK*CHUNK tiles with a biome each', () => {
    const w = new World(1);
    const c = w.getChunk(0, 0);
    expect(c.tiles.length).toBe(CHUNK * CHUNK);
    for (const t of c.tiles) expect(['soil','red-barren']).toContain(t.biome);
  });
  it('grass coverage is within expected band', () => {
    const w = new World(99);
    let grass = 0, total = 0;
    for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 4; cy++) {
      const c = w.getChunk(cx, cy);
      for (const t of c.tiles) { total++; if (t.grass) grass++; }
    }
    const frac = grass / total;
    expect(frac).toBeGreaterThan(0.05);
    expect(frac).toBeLessThan(0.30);
  });
  it('tileKey round-trips', () => {
    expect(World.tileKey(3, -7)).toBe('3,-7');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test src/game/world.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement world.ts**

```ts
// src/game/world.ts
import { chunkRng, randInt } from './rng';

export const TILE = 32;
export const CHUNK = 16;

export type Biome = 'soil' | 'red-barren';
export type ObjectKind = 'chest' | 'campfire' | 'tree' | 'ruin' | 'antenna' | 'ship' | 'pod' | 'terminal' | 'jellyfish';

export interface Tile {
  biome: Biome;
  ossuary: boolean;   // bone-fragment overlay
  grass: boolean;
  grassVariant: number;
}
export interface WorldObject { kind: ObjectKind; tx: number; ty: number; variant: number; }
export interface Chunk { cx: number; cy: number; tiles: Tile[]; objects: WorldObject[]; }

// Smooth-ish value noise over chunk coords for biome regions
function biomeNoise(seed: number, cx: number, cy: number): number {
  const r = chunkRng(seed ^ 0x9e3779b9, Math.floor(cx / 3), Math.floor(cy / 3));
  return r();
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
    for (const key of this.cache.keys()) {
      const [cx, cy] = key.split(',').map(Number);
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
        objects.push({ kind, tx: cx * CHUNK + (idx % CHUNK), ty: cy * CHUNK + Math.floor(idx / CHUNK), variant: randInt(rng, 0, maxVariant) });
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

  tileAt(tx: number, ty: number): Tile {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const lx = ((tx % CHUNK) + CHUNK) % CHUNK, ly = ((ty % CHUNK) + CHUNK) % CHUNK;
    return this.getChunk(cx, cy).tiles[ly * CHUNK + lx]!;
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/game/world.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/world.ts src/game/world.test.ts && git commit -m "feat: deterministic chunked world generation with biomes"
```

---

## Task 8: Asset loader + sprite/animation player

**Files:**
- Create: `wanderlost/src/game/assets.ts`

Responsibilities: preload images, decode GIFs into frame lists (GIFs can't be frame-stepped on canvas natively, so we use an `<img>` element drawn directly — accept GIF self-animation for environmental loops; for character anims we use sprite-sheet PNGs from pixellab where available, falling back to drawing the GIF img).

- [ ] **Step 1: Implement assets.ts**

```ts
// src/game/assets.ts
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

// Character sprite resolution: try generated walk sheet, fall back to rotation still / zero-g-float
export interface CharacterAssets {
  rotations: Record<Dir, string>;   // static facing PNGs
  moveGif?: Record<Dir, string>;    // animated movement (Doug zero-g-float, or generated walk)
}

export function characterAssets(slug: string): CharacterAssets {
  const base = `/assets/characters/${slug}`;
  const rotations = Object.fromEntries(DIRS.map(d => [d, `${base}/rotations/${d}.png`])) as Record<Dir, string>;
  if (slug === 'doug') {
    const moveGif = Object.fromEntries(DIRS.map(d => [d, `${base}/gifs/zero-g-float-${d}.gif`])) as Record<Dir, string>;
    return { rotations, moveGif };
  }
  // V2 chars: walk frames may exist after generation under /walk/{dir}.gif; loader tolerates 404 via fallback
  const moveGif = Object.fromEntries(DIRS.map(d => [d, `${base}/walk/${d}.gif`])) as Record<Dir, string>;
  return { rotations, moveGif };
}
```

- [ ] **Step 2: Smoke-check (manual)**

Add a temporary line in `engine.ts` to `loadImage('/assets/characters/doug/rotations/south.png').then(()=>console.log('doug ok'))`, run `pnpm dev`, confirm console logs `doug ok`. Remove the temp line after.

- [ ] **Step 3: Commit**

```bash
git add src/game/assets.ts && git commit -m "feat: image loader and character asset resolver"
```

---

## Task 9: Input handler (8-dir, buffered)

**Files:**
- Create: `wanderlost/src/game/input.ts`
- Create: `wanderlost/src/game/input.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/input.test.ts
import { describe, it, expect } from 'vitest';
import { vecToDir } from './input';

describe('vecToDir', () => {
  it('maps cardinals', () => {
    expect(vecToDir(0, 1)).toBe('south');
    expect(vecToDir(0, -1)).toBe('north');
    expect(vecToDir(1, 0)).toBe('east');
    expect(vecToDir(-1, 0)).toBe('west');
  });
  it('maps diagonals', () => {
    expect(vecToDir(1, 1)).toBe('south-east');
    expect(vecToDir(-1, -1)).toBe('north-west');
  });
  it('returns null for no movement', () => {
    expect(vecToDir(0, 0)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm test src/game/input.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement input.ts**

```ts
// src/game/input.ts
import type { Dir } from './assets';

export function vecToDir(dx: number, dy: number): Dir | null {
  if (dx === 0 && dy === 0) return null;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  if (sx === 0 && sy === 1) return 'south';
  if (sx === 0 && sy === -1) return 'north';
  if (sx === 1 && sy === 0) return 'east';
  if (sx === -1 && sy === 0) return 'west';
  if (sx === 1 && sy === 1) return 'south-east';
  if (sx === 1 && sy === -1) return 'north-east';
  if (sx === -1 && sy === 1) return 'south-west';
  return 'north-west';
}

export class Input {
  private held = new Set<string>();
  paused = false;
  onAction: (() => void) | null = null;
  onToggleInventory: (() => void) | null = null;
  onMute: (() => void) | null = null;
  // touch dpad sets these directly
  touchDx = 0; touchDy = 0;

  attach() {
    addEventListener('keydown', e => {
      this.held.add(e.key.toLowerCase());
      const k = e.key.toLowerCase();
      if (k === 'e' || k === ' ') this.onAction?.();
      if (k === 'i' || k === 'tab') { e.preventDefault(); this.onToggleInventory?.(); }
      if (k === 'm') this.onMute?.();
    });
    addEventListener('keyup', e => this.held.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.held.clear());
  }

  // Current movement intent as a unit-ish vector (each axis -1/0/1)
  intent(): { dx: number; dy: number } {
    if (this.paused) return { dx: 0, dy: 0 };
    let dx = this.touchDx, dy = this.touchDy;
    if (this.held.has('arrowup') || this.held.has('w')) dy -= 1;
    if (this.held.has('arrowdown') || this.held.has('s')) dy += 1;
    if (this.held.has('arrowleft') || this.held.has('a')) dx -= 1;
    if (this.held.has('arrowright') || this.held.has('d')) dx += 1;
    return { dx: Math.sign(dx), dy: Math.sign(dy) };
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/game/input.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/input.ts src/game/input.test.ts && git commit -m "feat: buffered 8-direction input handler"
```

---

## Task 10: Doug — local player state + 8-dir slide tween

**Files:**
- Create: `wanderlost/src/game/doug.ts`
- Create: `wanderlost/src/game/doug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/doug.test.ts
import { describe, it, expect } from 'vitest';
import { Player } from './doug';

describe('Player slide', () => {
  it('starts at a tile, not sliding', () => {
    const p = new Player(0, 0, 'doug');
    expect(p.sliding).toBe(false);
    expect(p.tx).toBe(0); expect(p.ty).toBe(0);
  });
  it('begins a slide and arrives after duration', () => {
    const p = new Player(0, 0, 'doug');
    p.startSlide(1, 0, 'east'); // cardinal
    expect(p.sliding).toBe(true);
    p.update(140); // exact cardinal duration
    expect(p.sliding).toBe(false);
    expect(p.tx).toBe(1); expect(p.ty).toBe(0);
  });
  it('diagonal takes longer than cardinal', () => {
    const p = new Player(0, 0, 'doug');
    p.startSlide(1, 1, 'south-east');
    p.update(140);
    expect(p.sliding).toBe(true); // not yet arrived at 140ms
    p.update(60);
    expect(p.sliding).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm test src/game/doug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement doug.ts**

```ts
// src/game/doug.ts
import type { Dir } from './assets';
import { TILE } from './world';

const CARDINAL_MS = 140;
const DIAGONAL_MS = 198;

export class Player {
  facing: Dir = 'south';
  sliding = false;
  // pixel position for rendering (interpolated during slide)
  px: number; py: number;
  private fromPx = 0; private fromPy = 0; private toPx = 0; private toPy = 0;
  private elapsed = 0; private duration = 0;
  private pendingTx = 0; private pendingTy = 0;

  constructor(public tx: number, public ty: number, public character: string) {
    this.px = tx * TILE; this.py = ty * TILE;
  }

  startSlide(ntx: number, nty: number, dir: Dir) {
    if (this.sliding) return;
    this.facing = dir;
    this.pendingTx = ntx; this.pendingTy = nty;
    this.fromPx = this.px; this.fromPy = this.py;
    this.toPx = ntx * TILE; this.toPy = nty * TILE;
    const diagonal = ntx !== this.tx && nty !== this.ty;
    this.duration = diagonal ? DIAGONAL_MS : CARDINAL_MS;
    this.elapsed = 0;
    this.sliding = true;
  }

  update(dtMs: number) {
    if (!this.sliding) return;
    this.elapsed += dtMs;
    const t = Math.min(1, this.elapsed / this.duration);
    const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; // easeInOutQuad
    this.px = this.fromPx + (this.toPx - this.fromPx) * e;
    this.py = this.fromPy + (this.toPy - this.fromPy) * e;
    if (t >= 1) {
      this.sliding = false;
      this.tx = this.pendingTx; this.ty = this.pendingTy;
      this.px = this.toPx; this.py = this.toPy;
    }
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/game/doug.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/doug.ts src/game/doug.test.ts && git commit -m "feat: player slide tween with cardinal/diagonal timing"
```

---

## Task 11: Renderer + camera + first playable (walk on tiles)

This is the first integration milestone: a player sliding around a tiled, scrolling world. Tiles drawn as flat color fills first (real tile art wired in Task 12), so we can validate motion + camera without art dependencies.

**Files:**
- Create: `wanderlost/src/game/render.ts`
- Rewrite: `wanderlost/src/game/engine.ts`

- [ ] **Step 1: Implement render.ts (camera + tile fills + player)**

```ts
// src/game/render.ts
import { World, TILE, CHUNK } from './world';
import { Player } from './doug';
import { getImage } from './assets';

const BIOME_COLOR = { 'soil': '#2a241c', 'red-barren': '#3a201a' } as const;
const OSSUARY_TINT = 'rgba(200,190,170,0.10)';
const GRASS_COLOR = '#1f3a1c';

export interface Camera { x: number; y: number; }

export function render(ctx: CanvasRenderingContext2D, world: World, player: Player, cam: Camera, peers: { px:number; py:number; facing:string; character:string; name:string }[]) {
  const { width, height } = ctx.canvas;
  // ease camera toward player center
  const targetX = player.px + TILE/2 - width/2;
  const targetY = player.py + TILE/2 - height/2;
  cam.x += (targetX - cam.x) * 0.15;
  cam.y += (targetY - cam.y) * 0.15;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const minTx = Math.floor(cam.x / TILE) - 1;
  const minTy = Math.floor(cam.y / TILE) - 1;
  const maxTx = Math.ceil((cam.x + width) / TILE) + 1;
  const maxTy = Math.ceil((cam.y + height) / TILE) + 1;

  // ground pass
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      ctx.fillStyle = BIOME_COLOR[t.biome];
      ctx.fillRect(sx, sy, TILE, TILE);
      if (t.ossuary) { ctx.fillStyle = OSSUARY_TINT; ctx.fillRect(sx, sy, TILE, TILE); }
    }
  }
  // grass pass (after ground, simple block for now; sprite in Task 13)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      if (!t.grass) continue;
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      ctx.fillStyle = GRASS_COLOR;
      ctx.fillRect(sx + 6, sy + 6, TILE - 12, TILE - 12);
    }
  }
  // peers
  for (const peer of peers) drawSprite(ctx, peer.character, peer.facing, peer.px - cam.x, peer.py - cam.y, peer.name);
  // local player
  drawSprite(ctx, player.character, player.facing, player.px - cam.x, player.py - cam.y);
}

function drawSprite(ctx: CanvasRenderingContext2D, character: string, facing: string, sx: number, sy: number, name?: string) {
  const img = getImage(`/assets/characters/${character}/rotations/${facing}.png`);
  if (img) ctx.drawImage(img, Math.round(sx) - 8, Math.round(sy) - 16, 48, 48);
  else { ctx.fillStyle = '#d4a437'; ctx.fillRect(Math.round(sx), Math.round(sy), TILE, TILE); }
  if (name) {
    ctx.font = '8px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(0,220,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(name, Math.round(sx) + TILE/2, Math.round(sy) - 6);
    ctx.textAlign = 'left';
  }
}
```

- [ ] **Step 2: Rewrite engine.ts to wire world + input + player + render**

```ts
// src/game/engine.ts
import { World, TILE, CHUNK } from './world';
import { Player } from './doug';
import { Input, vecToDir } from './input';
import { render, type Camera } from './render';
import { loadImage } from './assets';
import { DIRS } from './assets';

export interface Game { world: World; player: Player; input: Input; cam: Camera; }

export function startEngine(canvas: HTMLCanvasElement): Game {
  const ctx = canvas.getContext('2d')!;
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize(); addEventListener('resize', resize);

  const world = new World(1337);
  const player = new Player(0, 0, 'doug');
  const input = new Input(); input.attach();
  const cam: Camera = { x: player.px + TILE/2 - canvas.width/2, y: player.py + TILE/2 - canvas.height/2 };

  // preload doug rotations
  for (const d of DIRS) loadImage(`/assets/characters/doug/rotations/${d}.png`).catch(()=>{});

  let last = performance.now();
  const loop = (now: number) => {
    const dt = now - last; last = now;
    if (!player.sliding) {
      const { dx, dy } = input.intent();
      const dir = vecToDir(dx, dy);
      if (dir) player.startSlide(player.tx + dx, player.ty + dy, dir);
    }
    player.update(dt);
    world.evictOutside(Math.floor(player.tx / CHUNK), Math.floor(player.ty / CHUNK), 3);
    render(ctx, world, player, cam, []);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { world, player, input, cam };
}
```

- [ ] **Step 3: Manual verification**

Run `pnpm dev`. Expected: dark tiled ground with subtly different biome regions, green grass blocks scattered, Doug sprite centered, camera scrolls smoothly as you hold WASD/arrows. Diagonal moves work. Movement is grid-locked (one tile per press/hold-step).

- [ ] **Step 4: Commit**

```bash
git add src/game/render.ts src/game/engine.ts && git commit -m "feat: first playable - tiled scrolling world with sliding player"
```

---

## Task 12: Real tile art — Wang tileset slicing + bone overlay

**Files:**
- Modify: `wanderlost/src/game/render.ts` (replace color fills with tile sprites)
- Modify: `wanderlost/src/game/assets.ts` (add tileset slicer)

- [ ] **Step 1: Add a tileset slicer to assets.ts**

```ts
// append to src/game/assets.ts
export interface TilesetMeta { tileSize: number; columns: number; variants: number; }

// Reads the pixellab metadata.json; returns a function that maps a variant index to a source rect.
export async function loadTileset(slug: string): Promise<{ img: HTMLImageElement; rect: (v: number) => [number,number,number,number] }> {
  const img = await loadImage(`/assets/tilesets/${slug}/image.png`);
  const meta = await fetch(`/assets/tilesets/${slug}/metadata.json`).then(r => r.json()).catch(() => null);
  // pixellab tiles_pro / topdown export: assume row-major grid of `size`-px tiles.
  const size = meta?.tile_size ?? meta?.tileSize ?? 32;
  const cols = Math.max(1, Math.floor(img.width / size));
  const count = Math.floor(img.width / size) * Math.floor(img.height / size);
  return {
    img,
    rect: (v: number) => { const i = ((v % count) + count) % count; return [(i % cols) * size, Math.floor(i / cols) * size, size, size]; },
  };
}
```

NOTE: The exact metadata shape was captured in Task 4 Step 3. If field names differ, adjust `size`/`cols` accordingly — the fallback grid logic works regardless.

- [ ] **Step 2: Preload tilesets in engine.ts**

Add near the doug preload in `startEngine`:

```ts
import { loadTileset } from './assets';
// ...
const tilesets: Record<string, Awaited<ReturnType<typeof loadTileset>>> = {};
(async () => {
  for (const slug of ['soil','red-barren','bone-overlay']) {
    try { tilesets[slug] = await loadTileset(slug); } catch (e) { console.warn('tileset', slug, e); }
  }
})();
```

Pass `tilesets` into `render(...)` (extend its signature with a `tilesets` param).

- [ ] **Step 3: Replace ground color fills with sprite draws in render.ts**

In the ground pass, replace the `fillRect` biome block with:

```ts
const ts = tilesets[t.biome];
if (ts) { const [rx,ry,rw,rh] = ts.rect((tx*73856093 ^ ty*19349663) >>> 0); ctx.drawImage(ts.img, rx, ry, rw, rh, sx, sy, TILE, TILE); }
else { ctx.fillStyle = BIOME_COLOR[t.biome]; ctx.fillRect(sx, sy, TILE, TILE); }
if (t.ossuary) {
  const bo = tilesets['bone-overlay'];
  if (bo) { const [rx,ry,rw,rh] = bo.rect((tx*83492791 ^ ty*29849263) >>> 0); ctx.drawImage(bo.img, rx, ry, rw, rh, sx, sy, TILE, TILE); }
  else { ctx.fillStyle = OSSUARY_TINT; ctx.fillRect(sx, sy, TILE, TILE); }
}
```

- [ ] **Step 4: Manual verification**

Run `pnpm dev`. Expected: ground now shows alien-soil / red-barren textures; ossuary tiles show bone fragments overlaid. Variation between tiles (deterministic per coord).

- [ ] **Step 5: Commit**

```bash
git add src/game/render.ts src/game/assets.ts src/game/engine.ts && git commit -m "feat: render real Wang tile art with bone overlay"
```

---

## Task 13: Grass sprites + step-on rustle + reveal state (local, pre-network)

Wire grass visuals and the reveal mechanic locally first (resolved client-side); Task 19 swaps the resolver to be server-authoritative.

**Files:**
- Create: `wanderlost/src/game/grass.ts`
- Create: `wanderlost/src/game/grass.test.ts`
- Modify: `wanderlost/src/game/render.ts`, `engine.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/grass.test.ts
import { describe, it, expect } from 'vitest';
import { rollReveal } from './grass';

describe('rollReveal', () => {
  it('is deterministic per (seed,tx,ty)', () => {
    expect(rollReveal(5, 10, 20)).toEqual(rollReveal(5, 10, 20));
  });
  it('returns a collectible type, "note", or null', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const r = rollReveal(1, i, 0);
      seen.add(r === null ? 'null' : typeof r === 'number' ? 'num' : r);
    }
    expect(seen.has('null')).toBe(true);
    expect(seen.has('num')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm test src/game/grass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement grass.ts**

```ts
// src/game/grass.ts
import { xmur3, mulberry32 } from './rng';

export type RevealResult = number | 'note' | null; // 1..7 collectible, note, or nothing

export function rollReveal(worldSeed: number, tx: number, ty: number): RevealResult {
  const rng = mulberry32(xmur3(`reveal|${worldSeed}|${tx}|${ty}`)());
  const r = rng();
  if (r < 0.00125) return 'note';      // ~1/800
  if (r < 0.125) return 1 + Math.floor(rng() * 7); // ~12% collectible (types 1..7)
  return null;
}

// Tracks which tiles have been searched and what was found.
export class GrassState {
  private revealed = new Map<string, RevealResult>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isRevealed(tx: number, ty: number) { return this.revealed.has(GrassState.key(tx, ty)); }
  get(tx: number, ty: number) { return this.revealed.get(GrassState.key(tx, ty)); }
  set(tx: number, ty: number, r: RevealResult) { this.revealed.set(GrassState.key(tx, ty), r); }
  entries() { return this.revealed.entries(); }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/game/grass.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire reveal on arrival in engine.ts**

After `player.update(dt)`, detect arrival (slide just finished) and if the new tile has grass and isn't revealed, call a reveal handler:

```ts
// in loop, track previous sliding state
const wasSliding = player.sliding;
player.update(dt);
if (wasSliding && !player.sliding) {
  const tile = world.tileAt(player.tx, player.ty);
  if (tile.grass && !grass.isRevealed(player.tx, player.ty)) {
    const result = rollReveal(world.seed, player.tx, player.ty); // Task 19: replace with server round-trip
    grass.set(player.tx, player.ty, result);
    if (typeof result === 'number') onCollect(result);
    else if (result === 'note') onNote(player.tx, player.ty);
  }
}
```

Add `const grass = new GrassState();` and stub `onCollect`/`onNote` (console.log for now; HUD wiring in Task 16).

- [ ] **Step 6: Draw grass sprite + searched opacity in render.ts**

Replace the grass block: draw `grass-sway.gif` image (loaded via `getImage('/assets/grass/grass-sway.gif')`) at the tile; if `grassState.isRevealed(tx,ty)` set `ctx.globalAlpha = 0.6` before drawing and reset after. Pass `grassState` into `render`.

- [ ] **Step 7: Manual verification**

Run `pnpm dev`. Walk into grass: it dims to "searched"; console logs collectibles/notes occasionally. Deterministic — revisiting a tile shows it already searched.

- [ ] **Step 8: Commit**

```bash
git add src/game/grass.ts src/game/grass.test.ts src/game/render.ts src/game/engine.ts && git commit -m "feat: grass sprites + deterministic step-on reveal (local)"
```

---

## Task 14: Objects — chests, campfires, trees; chest open interaction

**Files:**
- Create: `wanderlost/src/game/objects.ts`
- Modify: `wanderlost/src/game/render.ts`, `engine.ts`

- [ ] **Step 1: Implement objects.ts (asset path resolution + open state)**

```ts
// src/game/objects.ts
import type { ObjectKind } from './world';

const PATHS: Record<ObjectKind, (v: number) => string> = {
  chest: v => `/assets/objects/mute/treasure-chest-${(v % 7) + 1}.png`,
  campfire: () => `/assets/objects/campfire-flicker.gif`,
  tree: v => `/assets/objects/mute/alien-tree-${6 + (v % 4)}.png`,
  ruin: v => `/assets/objects/mute/ruin-archway-${(v % 2) + 1}.png`,
  antenna: () => `/assets/objects/mute/antenna-tower.png`,
  ship: v => `/assets/objects/mute/crashed-ship-${(v % 2) + 1}.png`,
  pod: v => `/assets/objects/mute/cyan-pod-${10 + (v % 3)}.png`,
  terminal: v => `/assets/objects/mute/data-terminal-${(v % 5) + 1}.png`,
  jellyfish: v => `/assets/objects/mute/jellyfish-${(v % 4) + 1}.png`,
};
export function objectPath(kind: ObjectKind, variant: number) { return PATHS[kind](variant); }

export class OpenState {
  private open = new Set<string>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isOpen(tx: number, ty: number) { return this.open.has(OpenState.key(tx, ty)); }
  setOpen(tx: number, ty: number) { this.open.add(OpenState.key(tx, ty)); }
}
```

- [ ] **Step 2: Draw objects in render.ts**

Add an object pass after grass, before peers. For chunks in view, iterate `world.getChunk(cx,cy).objects`, load `objectPath(kind,variant)`, draw with bottom-anchor y-sort (sort all visible objects + player + peers by their world Y, draw in order). Anchor objects so their base sits on the tile.

- [ ] **Step 3: Chest open interaction in engine.ts**

Wire `input.onAction`: find a chest adjacent to the player in the direction they're facing; if found and not open, mark open via `OpenState`, roll 2-4 collectibles (`rollReveal`-style seeded by chest coords), call `onCollect` for each. Task 19 makes this server-authoritative.

- [ ] **Step 4: Manual verification**

Run `pnpm dev`. Trees/chests/campfires appear, y-sorted (player walks behind tall objects). Facing a chest and pressing E/Space opens it and yields collectibles (console).

- [ ] **Step 5: Commit**

```bash
git add src/game/objects.ts src/game/render.ts src/game/engine.ts && git commit -m "feat: world objects with y-sort + chest open interaction"
```

---

## Task 15: Day/night cycle + starfield + campfire glow

**Files:**
- Create: `wanderlost/src/game/daynight.ts`
- Create: `wanderlost/src/game/daynight.test.ts`
- Modify: `wanderlost/src/game/render.ts`, `engine.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/daynight.test.ts
import { describe, it, expect } from 'vitest';
import { phaseAt, CYCLE_MS } from './daynight';

describe('day/night', () => {
  it('returns dawn at 0, day mid-morning, night late', () => {
    expect(phaseAt(0).name).toBe('dawn');
    expect(phaseAt(CYCLE_MS * 0.4).name).toBe('day');
    expect(phaseAt(CYCLE_MS * 0.9).name).toBe('night');
  });
  it('wraps past one cycle', () => {
    expect(phaseAt(CYCLE_MS + 1).name).toBe('dawn');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm test src/game/daynight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement daynight.ts**

```ts
// src/game/daynight.ts
export const CYCLE_MS = 8 * 60 * 1000; // 8 minutes
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

export interface Phase { name: PhaseName; tint: string; alpha: number; starAlpha: number; }

export function phaseAt(ms: number): Phase {
  const t = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const frac = t / CYCLE_MS; // 0..1
  if (frac < 1/8)  return { name: 'dawn',  tint: '#d4a437', alpha: 0.12, starAlpha: lerp(0.3, 0, frac/(1/8)) };
  if (frac < 5/8)  return { name: 'day',   tint: '#000000', alpha: 0.0,  starAlpha: 0 };
  if (frac < 6/8)  return { name: 'dusk',  tint: '#b04280', alpha: 0.18, starAlpha: lerp(0, 0.6, (frac-5/8)/(1/8)) };
  return { name: 'night', tint: '#0a0a30', alpha: 0.45, starAlpha: lerp(0.6, 1, (frac-6/8)/(2/8)) };
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

export function dayNumber(ms: number) { return Math.floor(ms / CYCLE_MS); }
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test src/game/daynight.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Render tint overlay + starfield + campfire glow**

In render.ts, after world+objects+player, before peers' name tags: compute `phaseAt(clockMs)`, draw a full-screen rect of `tint` at `alpha`. Draw a starfield: precompute ~200 random star positions (screen-space, parallax 0.2), draw at `starAlpha`. For each visible campfire, draw a radial gradient (gold, additive `globalCompositeOperation='lighter'`) scaled by `(1 - cos(frac*2π))/2`-ish night strength.

Add `clockMs` to engine: `let clockMs = savedCyclePhase; clockMs += dt * dayNightSpeedMult;` and fire a day-change callback when `dayNumber` increments.

- [ ] **Step 6: Manual verification**

Run `pnpm dev` with a temporarily shortened `CYCLE_MS` (e.g. 20s) to watch dawn→day→dusk→night tint shifts and stars fading in. Restore `CYCLE_MS` after.

- [ ] **Step 7: Commit**

```bash
git add src/game/daynight.ts src/game/daynight.test.ts src/game/render.ts src/game/engine.ts && git commit -m "feat: day/night cycle with tint, starfield, campfire glow"
```

---

## Task 16: HUD (Preact) — specimens counter, thought bubble, day-card

**Files:**
- Create: `wanderlost/src/HUD.tsx`
- Create: `wanderlost/src/content/flavor-thoughts.ts`, `flavor-days.ts`
- Modify: `wanderlost/src/App.tsx`, `src/game/engine.ts`

The game loop and Preact communicate via a tiny shared event bus / signal object.

- [ ] **Step 1: Create a shared HUD state (preact signals-free, plain pub/sub)**

```ts
// src/game/hud-bus.ts
type Listener = () => void;
export const hudState = {
  specimens: {} as Record<number, number>,
  thought: '' as string,
  dayCard: '' as string,
  specimenFlash: 0 as number,
};
const listeners = new Set<Listener>();
export function subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); }
export function notify() { listeners.forEach(l => l()); }
export function addSpecimen(type: number) { hudState.specimens[type] = (hudState.specimens[type] ?? 0) + 1; hudState.specimenFlash = performance.now(); notify(); }
export function showThought(text: string) { hudState.thought = text; notify(); setTimeout(() => { hudState.thought = ''; notify(); }, 1500); }
export function showDayCard(text: string) { hudState.dayCard = text; notify(); setTimeout(() => { hudState.dayCard = ''; notify(); }, 3000); }
```

- [ ] **Step 2: Create flavor-thoughts.ts and flavor-days.ts**

```ts
// src/content/flavor-thoughts.ts
export const THOUGHTS = [
  "Did I leave the airlock open.",
  "If a tree falls on an alien planet...",
  "The stars look the same here. Probably aren't.",
  "I should have called her back.",
  "Hungry. Always.",
  "The grass remembers being stepped on. I think.",
  "Forty paces north, then nothing. Same as always.",
  "I used to be afraid of the dark. Now it's just Tuesday.",
  "Somewhere, a kettle is boiling without me.",
  "My boots are older than some of these stars.",
  // ... (fill to ~40; keep the dry, sad-funny register)
];
```

```ts
// src/content/flavor-days.ts
export const DAY_LINES = [
  (d: number) => `Day ${d}. The light came back. It always does. So far.`,
  (d: number) => `Day ${d}. Today, the same as yesterday.`,
  (d: number) => `Day ${d}. He has stopped counting, but the counter has not.`,
  (d: number) => `Day ${d}. Something moved. It was me.`,
  (d: number) => `Day ${d}. Still bright. Still here.`,
  // ... (fill to ~20)
];
```

(Fill both pools to the target counts. The tone is the product — see spec §2.)

- [ ] **Step 3: Implement HUD.tsx**

```tsx
// src/HUD.tsx
import { useEffect, useState } from 'preact/hooks';
import { hudState, subscribe } from './game/hud-bus';

export function HUD() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  const total = Object.values(hudState.specimens).reduce((a, b) => a + b, 0);
  return (
    <>
      <div style={{ position:'fixed', top:12, right:14, fontSize:11, letterSpacing:'0.18em', color:'#d4a437', textShadow:'0 0 12px rgba(212,164,55,0.4)' }}>
        specimens: {total}
      </div>
      {hudState.thought && (
        <div style={{ position:'fixed', left:'50%', bottom:'22%', transform:'translateX(-50%)', fontSize:11, color:'#9a9080', fontStyle:'italic', opacity:0.85, maxWidth:'60vw', textAlign:'center' }}>
          {hudState.thought}
        </div>
      )}
      {hudState.dayCard && (
        <div style={{ position:'fixed', left:'50%', top:'12%', transform:'translateX(-50%)', fontSize:13, letterSpacing:'0.15em', color:'#e8e0d0', textAlign:'center' }}>
          {hudState.dayCard}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Mount HUD in App.tsx, wire callbacks in engine**

In `App.tsx` render `<HUD />`. In `engine.ts`, replace stubbed `onCollect` with `addSpecimen(type)`; on day increment call `showDayCard(pick(DAY_LINES)(day))`; add idle-thought logic: if not sliding and idle >12s and not sitting, 25% roll every few seconds → `showThought(pick(THOUGHTS))`.

- [ ] **Step 5: Manual verification**

Run `pnpm dev`. Specimens counter increments when collecting from grass/chests. Stand still ~12s → occasional thought bubble. Day rollover → title card.

- [ ] **Step 6: Commit**

```bash
git add src/HUD.tsx src/content/flavor-thoughts.ts src/content/flavor-days.ts src/App.tsx src/game/hud-bus.ts src/game/engine.ts && git commit -m "feat: HUD with specimens counter, thoughts, day cards"
```

---

## Task 17: Ambient audio — loop, mute toggle, night ducking

**Files:**
- Create: `wanderlost/src/game/audio.ts`
- Modify: `wanderlost/src/game/engine.ts`, `wanderlost/src/game/input.ts`

- [ ] **Step 1: Implement audio.ts**

Web Audio is used (not `<audio>`) so we can crossfade and duck. Browsers block autoplay until a gesture, so `start()` is called from the first keydown/pointerdown.

```ts
// src/game/audio.ts
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loopSrc: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let started = false;
let muted = false;
let targetGain = 0.5;

const LOOP_URL = '/assets/audio/ambient-loop.ogg';

export async function preloadAudio(): Promise<void> {
  // Decode ahead of time; safe to call before any gesture.
  const res = await fetch(LOOP_URL);
  const arr = await res.arrayBuffer();
  // AudioContext needed to decode; create lazily but don't start.
  ctx ??= new AudioContext();
  buffer = await ctx.decodeAudioData(arr);
}

export function startAudio(): void {
  if (started || !buffer) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : targetGain;
  master.connect(ctx.destination);
  loopSrc = ctx.createBufferSource();
  loopSrc.buffer = buffer;
  loopSrc.loop = true;
  loopSrc.connect(master);
  loopSrc.start();
  started = true;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(muted ? 0 : targetGain, ctx.currentTime + 0.3);
  }
  return muted;
}

export function isMuted(): boolean { return muted; }

// duck: 0..1 multiplier on target gain (used at night for a hushed feel)
export function setDuck(mult: number): void {
  targetGain = 0.5 * mult;
  if (master && ctx && !muted) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 1.5);
  }
}
```

- [ ] **Step 2: Wire into engine + input**

In `engine.ts`: call `void preloadAudio()` during boot. On the first `Input` action or movement, call `startAudio()` once (guard with a boolean). Each frame, derive duck from the day/night phase (`night` → `setDuck(0.55)`, `dusk`/`dawn` → `setDuck(0.8)`, `day` → `setDuck(1)`); only call `setDuck` when the phase changes to avoid ramp spam.

In `input.ts`: the `onMute` callback (bound to `M`) calls `toggleMute()` and returns the new state so the HUD can show a muted glyph.

- [ ] **Step 3: Manual verification**

`pnpm dev`. Music starts on first keypress, not before. `M` mutes/unmutes with a smooth fade. Walking into night lowers the volume; returning to day restores it.

- [ ] **Step 4: Commit**

```bash
git add src/game/audio.ts src/game/engine.ts src/game/input.ts && git commit -m "feat: ambient audio loop with mute and night ducking"
```

---

## Task 18: Inventory overlay (Preact) — specimens / journal / settings tabs

**Files:**
- Create: `wanderlost/src/Inventory.tsx`
- Modify: `wanderlost/src/App.tsx`, `wanderlost/src/game/hud-bus.ts`, `wanderlost/src/game/input.ts`

- [ ] **Step 1: Extend hud-bus with inventory open state + journal entries**

Add to `hud-bus.ts`:

```ts
// appended to src/game/hud-bus.ts
export interface JournalEntry { id: string; text: string; day: number; }

interface HudExtra {
  inventoryOpen: boolean;
  journal: JournalEntry[];
}
export const hudExtra: HudExtra = { inventoryOpen: false, journal: [] };

export function toggleInventory(): void {
  hudExtra.inventoryOpen = !hudExtra.inventoryOpen;
  emit();
}
export function addJournal(entry: JournalEntry): void {
  if (hudExtra.journal.some(e => e.id === entry.id)) return; // de-dupe notes
  hudExtra.journal.push(entry);
  emit();
}
```

(Reuse the existing `emit`/`subscribe` pub/sub from Task 16. If `emit` is private, export it or route through a shared notifier.)

- [ ] **Step 2: Implement Inventory.tsx**

```tsx
// src/Inventory.tsx
import { useEffect, useState } from 'preact/hooks';
import { hudState, hudExtra, subscribe, toggleInventory } from './game/hud-bus';
import { SPECIMEN_FLAVOR } from './content/flavor-specimens';
import { isMuted, toggleMute } from './game/audio';

type Tab = 'specimens' | 'journal' | 'settings';

export function Inventory() {
  const [, force] = useState(0);
  const [tab, setTab] = useState<Tab>('specimens');
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  if (!hudExtra.inventoryOpen) return null;

  return (
    <div onClick={toggleInventory} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={panel}>
        <div style={tabRow}>
          {(['specimens','journal','settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...tabBtn, ...(tab===t?tabActive:{}) }}>{t}</button>
          ))}
          <button onClick={toggleInventory} style={closeBtn}>esc</button>
        </div>
        {tab==='specimens' && (
          <div style={grid}>
            {Object.entries(hudState.specimens).length===0 && <p style={dim}>nothing found yet. the grass is patient.</p>}
            {Object.entries(hudState.specimens).map(([k,n]) => (
              <div key={k} style={cell}>
                <div style={{ fontSize:12, color:'#e8e0d0' }}>{SPECIMEN_FLAVOR[k]?.name ?? k}</div>
                <div style={{ fontSize:10, color:'#9a9080', fontStyle:'italic' }}>{SPECIMEN_FLAVOR[k]?.note}</div>
                <div style={{ fontSize:11, color:'#d4a437' }}>x{n}</div>
              </div>
            ))}
          </div>
        )}
        {tab==='journal' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {hudExtra.journal.length===0 && <p style={dim}>no notes recovered. someone was here before you.</p>}
            {hudExtra.journal.map(e => (
              <div key={e.id} style={{ borderLeft:'2px solid #4a4338', paddingLeft:10 }}>
                <div style={{ fontSize:9, color:'#6a6358' }}>day {e.day}</div>
                <div style={{ fontSize:11, color:'#c8c0b0', fontStyle:'italic' }}>{e.text}</div>
              </div>
            ))}
          </div>
        )}
        {tab==='settings' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <button style={tabBtn} onClick={() => { toggleMute(); force(n=>n+1); }}>
              audio: {isMuted() ? 'muted' : 'on'}
            </button>
            <p style={dim}>WASD / arrows to walk. E to open. M mutes. I or Tab for this.</p>
            <p style={dim}>wanderlost — everything you find, someone else cannot.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position:'fixed', inset:0, background:'rgba(8,8,12,0.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, backdropFilter:'blur(2px)' } as const;
const panel = { width:'min(560px,90vw)', maxHeight:'80vh', overflow:'auto', background:'#16140f', border:'1px solid #4a4338', padding:'18px 20px', fontFamily:'"Space Mono",monospace' } as const;
const tabRow = { display:'flex', gap:8, marginBottom:16, alignItems:'center' } as const;
const tabBtn = { background:'transparent', border:'1px solid #4a4338', color:'#9a9080', padding:'4px 10px', fontSize:11, cursor:'pointer', textTransform:'lowercase' } as const;
const tabActive = { color:'#d4a437', borderColor:'#d4a437' } as const;
const closeBtn = { ...tabBtn, marginLeft:'auto' } as const;
const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10 } as const;
const cell = { border:'1px solid #2a2820', padding:'8px 10px' } as const;
const dim = { color:'#6a6358', fontSize:11, fontStyle:'italic' } as const;
```

- [ ] **Step 3: Wire toggle + render**

In `input.ts`: bind `I` and `Tab` to `onToggleInventory` (call `preventDefault` on Tab). In `engine.ts`, the toggle callback calls `toggleInventory()` from hud-bus AND tells the game loop to pause movement input (don't process intent while `hudExtra.inventoryOpen`). In `App.tsx`, render `<Inventory />` alongside `<HUD />`.

- [ ] **Step 4: Manual verification**

`pnpm dev`. `I` or `Tab` opens overlay; movement freezes while open. Specimens collected show on the specimens tab with flavor names. Settings audio toggle works. `esc` / click-outside closes.

- [ ] **Step 5: Commit**

```bash
git add src/Inventory.tsx src/App.tsx src/game/hud-bus.ts src/game/input.ts src/game/engine.ts && git commit -m "feat: inventory overlay with specimens, journal, settings tabs"
```

---

## Task 19: Character select modal (first-visit gate + in-game swap)

**Files:**
- Create: `wanderlost/src/CharacterSelect.tsx`
- Modify: `wanderlost/src/App.tsx`, `wanderlost/src/game/save.ts` (created next task — forward-declare via a tiny inline default until then)

- [ ] **Step 1: Implement CharacterSelect.tsx**

Four characters per spec §6: `doug` (zero-g-float, "drifts"), `red-hair-v2`, `green-alien-v2`, `crab-head-v2`. Preview uses the south-facing idle sprite.

```tsx
// src/CharacterSelect.tsx
import { useState } from 'preact/hooks';

export interface CharDef { id: string; name: string; blurb: string; preview: string; }

export const CHARACTERS: CharDef[] = [
  { id:'doug',          name:'Doug',  blurb:'lost his ship. drifts more than walks.', preview:'/assets/characters/doug/zero-g-float/south.gif' },
  { id:'red-hair-v2',   name:'Red',   blurb:'came looking for someone.',              preview:'/assets/characters/red-hair-v2/south.png' },
  { id:'green-alien-v2',name:'Vix',   blurb:'native. unimpressed by visitors.',       preview:'/assets/characters/green-alien-v2/south.png' },
  { id:'crab-head-v2',  name:'Pott',  blurb:'not actually a crab. long story.',       preview:'/assets/characters/crab-head-v2/south.png' },
];

export function CharacterSelect({ onPick, current }: { onPick:(id:string)=>void; current?:string }) {
  const [sel, setSel] = useState(current ?? 'doug');
  return (
    <div style={overlay}>
      <div style={panel}>
        <h1 style={{ fontSize:18, letterSpacing:'0.2em', color:'#e8e0d0', margin:'0 0 6px' }}>wanderlost</h1>
        <p style={{ fontSize:11, color:'#9a9080', fontStyle:'italic', margin:'0 0 18px' }}>choose who you'll be out here. you can change later.</p>
        <div style={row}>
          {CHARACTERS.map(c => (
            <button key={c.id} onClick={() => setSel(c.id)}
              style={{ ...card, ...(sel===c.id?cardSel:{}) }}>
              <img src={c.preview} width={64} height={64} style={{ imageRendering:'pixelated' }} alt={c.name}/>
              <div style={{ fontSize:12, color:'#e8e0d0', marginTop:6 }}>{c.name}</div>
              <div style={{ fontSize:9, color:'#9a9080', fontStyle:'italic' }}>{c.blurb}</div>
            </button>
          ))}
        </div>
        <button style={go} onClick={() => onPick(sel)}>wander</button>
      </div>
    </div>
  );
}

const overlay = { position:'fixed', inset:0, background:'#0a0a0e', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60, fontFamily:'"Space Mono",monospace' } as const;
const panel = { textAlign:'center', padding:24 } as const;
const row = { display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' } as const;
const card = { background:'#16140f', border:'1px solid #2a2820', padding:'12px 14px', cursor:'pointer', width:120 } as const;
const cardSel = { borderColor:'#d4a437', boxShadow:'0 0 16px rgba(212,164,55,0.25)' } as const;
const go = { marginTop:22, background:'transparent', border:'1px solid #d4a437', color:'#d4a437', padding:'8px 28px', fontSize:12, letterSpacing:'0.2em', cursor:'pointer' } as const;
```

- [ ] **Step 2: App.tsx gating**

`App.tsx` holds `characterId` state, initialized from `loadSave()?.characterId`. If undefined, render `<CharacterSelect onPick={id => { setCharacterId(id); engine.setCharacter(id); saveCharacter(id); }} />` and DON'T start the engine's input until picked. Add a small "swap character" affordance in the inventory settings tab that re-opens the modal (`current` prop pre-selects).

- [ ] **Step 3: Engine.setCharacter**

`engine.ts` exposes `setCharacter(id)` which sets the local player's sprite set (via `characterAssets[id]` from Task 8) and, if connected, sends `{t:"identity", char:id}` to the server (Task 22) so peers see the change.

- [ ] **Step 4: Manual verification**

Fresh load (clear localStorage) shows the modal; world isn't interactive behind it. Pick a character → world starts, chosen sprite walks. Reload → goes straight in with saved character. Swap from settings updates the on-screen sprite immediately.

- [ ] **Step 5: Commit**

```bash
git add src/CharacterSelect.tsx src/App.tsx src/game/engine.ts && git commit -m "feat: character select modal with first-visit gate and in-game swap"
```

---

## Task 20: Persistence — versioned localStorage snapshot + autosave

**Files:**
- Create: `wanderlost/src/game/save.ts`
- Create test: `wanderlost/src/game/save.test.ts`
- Modify: `wanderlost/src/game/engine.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/game/save.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSave, saveSnapshot, saveCharacter, KEY } from './save';

beforeEach(() => localStorage.clear());

describe('save', () => {
  it('returns null when empty', () => expect(loadSave()).toBeNull());

  it('round-trips a snapshot', () => {
    saveSnapshot({ characterId:'doug', x:10, y:-4, specimens:{ stone:2 }, journalIds:['n1'], identity:'Voyager 1a2b' });
    const s = loadSave();
    expect(s?.x).toBe(10);
    expect(s?.specimens.stone).toBe(2);
    expect(s?.journalIds).toContain('n1');
  });

  it('saveCharacter merges without wiping position', () => {
    saveSnapshot({ characterId:'doug', x:5, y:5, specimens:{}, journalIds:[], identity:'V x' });
    saveCharacter('crab-head-v2');
    const s = loadSave();
    expect(s?.characterId).toBe('crab-head-v2');
    expect(s?.x).toBe(5);
  });

  it('discards snapshots with a mismatched version', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 99, data: { x: 1 } }));
    expect(loadSave()).toBeNull();
  });
});
```

Run: `cd ~/dev/wanderlost && pnpm test save` — expect failure (module missing).

- [ ] **Step 2: Implement save.ts**

```ts
// src/game/save.ts
export const KEY = 'wanderlost:v1';
const VERSION = 1;

export interface Snapshot {
  characterId: string;
  x: number; y: number;
  specimens: Record<string, number>;
  journalIds: string[];
  identity: string;
}

export function loadSave(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; data: Snapshot };
    if (parsed.v !== VERSION) return null;
    return parsed.data;
  } catch { return null; }
}

export function saveSnapshot(s: Snapshot): void {
  localStorage.setItem(KEY, JSON.stringify({ v: VERSION, data: s }));
}

export function saveCharacter(characterId: string): void {
  const prev = loadSave();
  const base: Snapshot = prev ?? { characterId, x:0, y:0, specimens:{}, journalIds:[], identity:'' };
  saveSnapshot({ ...base, characterId });
}
```

Run: `pnpm test save` — expect pass.

- [ ] **Step 3: Autosave wiring in engine**

In `engine.ts`: on boot, `const save = loadSave()` → restore player tile position, character, and rehydrate HUD specimens/journal. Call `saveSnapshot(...)` (a) every 5s on a timer, (b) on `visibilitychange`→hidden, and (c) on `beforeunload`. Identity (voyager name) is generated once if absent and persisted. Specimens/journal come from `hud-bus` state.

- [ ] **Step 4: Manual verification**

Walk somewhere, collect a specimen, reload → you're in the same spot with the same character and counts. DevTools → Application → localStorage shows `wanderlost:v1`. Manually corrupt the value → game boots fresh without throwing.

- [ ] **Step 5: Commit**

```bash
git add src/game/save.ts src/game/save.test.ts src/game/engine.ts && git commit -m "feat: versioned localStorage persistence with autosave"
```

---

## Task 21: Worker scaffold + Durable Object skeleton

**Files:**
- Create: `wanderlost/worker/package.json`, `worker/wrangler.toml`, `worker/tsconfig.json`
- Create: `wanderlost/worker/src/index.ts`, `worker/src/world.ts`

Per memory `feedback_cf_pages_durable_objects`: a Pages project can't declare a DO inline. The DO lives in this **sibling Worker** (`wanderlost-realtime`); the client connects to it directly by URL (simplest), and we skip the Pages→Worker service binding for v1.

- [ ] **Step 1: worker/package.json**

```json
{
  "name": "wanderlost-realtime",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240000.0",
    "typescript": "^5.5.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 2: worker/wrangler.toml**

```toml
name = "wanderlost-realtime"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[[durable_objects.bindings]]
name = "WORLD"
class_name = "World"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["World"]
```

- [ ] **Step 3: worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: worker/src/index.ts — route to the single global DO**

```ts
// worker/src/index.ts
export { World } from './world';

export interface Env { WORLD: DurableObjectNamespace }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/ws') {
      // one global room — fixed name → one DO instance for everyone
      const id = env.WORLD.idFromName('global');
      return env.WORLD.get(id).fetch(req);
    }
    return new Response('wanderlost-realtime', { status: 200 });
  },
};
```

- [ ] **Step 5: Minimal world.ts (compiles, upgrades WS, echoes ping)**

```ts
// worker/src/world.ts
export class World {
  state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server); // hibernatable WS
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    if (typeof msg !== 'string') return;
    const m = JSON.parse(msg);
    if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', ts: m.ts }));
  }

  webSocketClose(ws: WebSocket): void { ws.close(); }
}
```

- [ ] **Step 6: Verify it builds + dev-serves**

```bash
cd ~/dev/wanderlost/worker && pnpm install && pnpm wrangler dev
# in another shell: curl http://localhost:8787/health → "ok"
```

- [ ] **Step 7: Commit**

```bash
cd ~/dev/wanderlost && git add worker && git commit -m "feat: worker scaffold with hibernatable WebSocket Durable Object skeleton"
```

---

## Task 22: Durable Object — presence, movement relay, authoritative reveal/open

**Files:**
- Modify: `wanderlost/worker/src/world.ts`

Implements the full server protocol from spec §4.3. Presence is in-memory (per-connection attachment); reveal/open state is **persisted in DO storage** so it survives hibernation and is global/first-come-wins.

- [ ] **Step 1: Full World implementation**

```ts
// worker/src/world.ts
interface PeerMeta { id: string; char: string; name: string; x: number; y: number; }

type ClientMsg =
  | { t:'join'; char:string; name:string; x:number; y:number }
  | { t:'move'; x:number; y:number; dir:number; moving:boolean }
  | { t:'identity'; char:string; name:string }
  | { t:'reveal'; key:string; kind:string; specimen?:string }
  | { t:'open'; key:string }
  | { t:'ping'; ts:number };

const SEED_KEY = 'worldSeed';

export class World {
  state: DurableObjectState;
  seed = 0;
  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      let s = await this.state.storage.get<number>(SEED_KEY);
      if (s === undefined) { s = (Math.random() * 2 ** 31) | 0; await this.state.storage.put(SEED_KEY, s); }
      this.seed = s;
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private peers(): WebSocket[] { return this.state.getWebSockets(); }
  private meta(ws: WebSocket): PeerMeta | null {
    const a = ws.deserializeAttachment();
    return a ?? null;
  }
  private broadcast(obj: unknown, except?: WebSocket): void {
    const s = JSON.stringify(obj);
    for (const ws of this.peers()) if (ws !== except) { try { ws.send(s); } catch {} }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let m: ClientMsg;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'ping') { ws.send(JSON.stringify({ t:'pong', ts:m.ts })); return; }

    if (m.t === 'join') {
      const id = crypto.randomUUID().slice(0, 8);
      const meta: PeerMeta = { id, char:m.char, name:m.name, x:m.x, y:m.y };
      ws.serializeAttachment(meta);
      // snapshot of current peers
      const present = this.peers().filter(p => p !== ws).map(p => this.meta(p)).filter(Boolean);
      // all revealed/opened state (global)
      const reveals = await this.state.storage.list<{ kind:string; specimen?:string }>({ prefix:'r:' });
      const opens = await this.state.storage.list<true>({ prefix:'o:' });
      ws.send(JSON.stringify({
        t:'welcome', id, seed:this.seed, peers:present,
        reveals:[...reveals].map(([k,v]) => ({ key:k.slice(2), ...v })),
        opens:[...opens].map(([k]) => k.slice(2)),
      }));
      this.broadcast({ t:'presence', join:meta }, ws);
      return;
    }

    const meta = this.meta(ws);
    if (!meta) return; // must join first

    if (m.t === 'move') {
      meta.x = m.x; meta.y = m.y; ws.serializeAttachment(meta);
      this.broadcast({ t:'move', id:meta.id, x:m.x, y:m.y, dir:m.dir, moving:m.moving }, ws);
      return;
    }

    if (m.t === 'identity') {
      meta.char = m.char; meta.name = m.name; ws.serializeAttachment(meta);
      this.broadcast({ t:'identity', id:meta.id, char:m.char, name:m.name }, ws);
      return;
    }

    if (m.t === 'reveal') {
      const sk = 'r:' + m.key;
      const existing = await this.state.storage.get(sk);
      if (existing) return; // first-to-reveal wins; ignore dupes silently
      const val = { kind:m.kind, specimen:m.specimen };
      await this.state.storage.put(sk, val);
      this.broadcast({ t:'reveal', key:m.key, kind:m.kind, specimen:m.specimen, by:meta.id });
      return;
    }

    if (m.t === 'open') {
      const ok = 'o:' + m.key;
      const existing = await this.state.storage.get(ok);
      if (existing) { ws.send(JSON.stringify({ t:'open', key:m.key, by:'', taken:true })); return; }
      await this.state.storage.put(ok, true);
      this.broadcast({ t:'open', key:m.key, by:meta.id });
      return;
    }
  }

  webSocketClose(ws: WebSocket): void {
    const meta = this.meta(ws);
    if (meta) this.broadcast({ t:'presence', leave: meta.id }, ws);
    try { ws.close(); } catch {}
  }
  webSocketError(ws: WebSocket): void { this.webSocketClose(ws); }
}
```

- [ ] **Step 2: Sanity-check storage growth**

Reveal/open keys are unbounded over the world's lifetime. For v1 that's acceptable (one private toy world). Note in `worker/README` that a future cleanup job could TTL-evict cold keys. Do not implement eviction now (spec §10 cut).

- [ ] **Step 3: Manual verification (two browser tabs after client lands)**

Defer full check to Task 23. For now: `wrangler dev`, connect with a scratch `wscat`/`websocat` to `ws://localhost:8787/ws`, send `{"t":"join","char":"doug","name":"V test","x":0,"y":0}` → receive a `welcome` with `seed`. Open a second connection → first receives a `presence.join`.

- [ ] **Step 4: Commit**

```bash
git add worker/src/world.ts && git commit -m "feat: DO presence, movement relay, authoritative global reveal/open state"
```

---

## Task 23: Client networking — net.ts (connect, predict, reconcile, reconnect)

**Files:**
- Create: `wanderlost/src/game/net.ts`
- Create: `wanderlost/src/game/net.test.ts` (message-shape encode/decode helpers only)
- Modify: `wanderlost/src/game/engine.ts`

The client is authoritative over its OWN position (prediction, no rollback needed for a walking sim); the server is authoritative over reveal/open. The shared `seed` from `welcome` overrides the local default so all clients generate the identical world.

- [ ] **Step 1: Write failing test for the reveal-key helper**

The reveal key must be stable and identical on every client for a given tile, so reveals dedupe across players.

```ts
// src/game/net.test.ts
import { describe, it, expect } from 'vitest';
import { tileKey } from './net';

describe('tileKey', () => {
  it('is stable and order-independent of sign', () => {
    expect(tileKey(3, -7)).toBe('3,-7');
    expect(tileKey(-7, 3)).toBe('-7,3');
  });
  it('round-trips distinct tiles to distinct keys', () => {
    const keys = new Set([tileKey(0,0), tileKey(0,1), tileKey(1,0), tileKey(-1,0)]);
    expect(keys.size).toBe(4);
  });
});
```

Run: `pnpm test net` → fail.

- [ ] **Step 2: Implement net.ts**

```ts
// src/game/net.ts
export function tileKey(tx: number, ty: number): string { return `${tx},${ty}`; }

export interface PeerState {
  id: string; char: string; name: string;
  x: number; y: number;            // current interpolated
  tx: number; ty: number;          // target from last move
  dir: number; moving: boolean;
}

export interface NetCallbacks {
  onWelcome(seed: number, selfId: string): void;
  onPeerJoin(p: { id:string; char:string; name:string; x:number; y:number }): void;
  onPeerLeave(id: string): void;
  onPeerMove(id: string, x:number, y:number, dir:number, moving:boolean): void;
  onPeerIdentity(id: string, char:string, name:string): void;
  onReveal(key: string, kind: string, specimen?: string): void;
  onOpen(key: string, taken: boolean): void;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? 'wss://wanderlost-realtime.<account>.workers.dev/ws';

export class Net {
  private ws: WebSocket | null = null;
  private backoff = 500;
  private joinInfo: { char:string; name:string; x:number; y:number } | null = null;
  private queue: string[] = [];
  selfId = '';
  connected = false;

  constructor(private cb: NetCallbacks) {}

  connect(join: { char:string; name:string; x:number; y:number }): void {
    this.joinInfo = join;
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.backoff = 500;
      if (this.joinInfo) this.send({ t:'join', ...this.joinInfo });
      for (const q of this.queue) ws.send(q);
      this.queue = [];
    };
    ws.onmessage = ev => this.handle(JSON.parse(ev.data));
    ws.onclose = () => { this.connected = false; this.scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.open(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 8000);
  }

  private handle(m: any): void {
    switch (m.t) {
      case 'welcome':
        this.selfId = m.id;
        this.cb.onWelcome(m.seed, m.id);
        for (const p of m.peers) this.cb.onPeerJoin(p);
        for (const r of m.reveals) this.cb.onReveal(r.key, r.kind, r.specimen);
        for (const k of m.opens) this.cb.onOpen(k, true);
        break;
      case 'presence':
        if (m.join) this.cb.onPeerJoin(m.join);
        if (m.leave) this.cb.onPeerLeave(m.leave);
        break;
      case 'move': this.cb.onPeerMove(m.id, m.x, m.y, m.dir, m.moving); break;
      case 'identity': this.cb.onPeerIdentity(m.id, m.char, m.name); break;
      case 'reveal': this.cb.onReveal(m.key, m.kind, m.specimen); break;
      case 'open': this.cb.onOpen(m.key, !!m.taken); break;
      case 'pong': /* latency sample if wanted */ break;
    }
  }

  private send(obj: unknown): void {
    const s = JSON.stringify(obj);
    if (this.ws && this.connected) this.ws.send(s);
    else this.queue.push(s);
  }

  // public emitters
  move(x:number,y:number,dir:number,moving:boolean){ this.send({t:'move',x,y,dir,moving}); }
  identity(char:string,name:string){ this.joinInfo && (this.joinInfo.char=char,this.joinInfo.name=name); this.send({t:'identity',char,name}); }
  reveal(key:string,kind:string,specimen?:string){ this.send({t:'reveal',key,kind,specimen}); }
  open(key:string){ this.send({t:'open',key}); }
}
```

Run: `pnpm test net` → pass.

- [ ] **Step 3: Add VITE_WS_URL to env + replace `<account>`**

After the Worker is deployed (Task 28) capture its URL. For local dev create `.env.local` with `VITE_WS_URL=ws://localhost:8787/ws`. Commit a `.env.example`. Do NOT commit `.env.local`.

- [ ] **Step 4: Wire engine to Net**

In `engine.ts`: build `Net` with callbacks that (a) `onWelcome` → set `world.seed = seed` and regenerate visible chunks; (b) peer callbacks → mutate the `peers` map (Task 24); (c) `onReveal`/`onOpen` → apply to grass/objects state (Task 25). On every local slide-arrival, call `net.move(tx,ty,dir,moving)` (throttled to tile granularity, not per-frame).

- [ ] **Step 5: Manual verification**

Run worker (`wrangler dev`) + client (`pnpm dev` with `.env.local`). Open two browser windows → each sees the other's character move tile-by-tile. Reload one → it rejoins; the other shows leave then join. Kill the worker → client logs reconnect attempts with growing backoff; restart worker → client reconnects.

- [ ] **Step 6: Commit**

```bash
git add src/game/net.ts src/game/net.test.ts src/game/engine.ts .env.example && git commit -m "feat: websocket client with prediction, reconnect backoff, shared seed"
```

---

## Task 24: Peer rendering with interpolation

**Files:**
- Create: `wanderlost/src/game/peers.ts`
- Modify: `wanderlost/src/game/render.ts`, `wanderlost/src/game/engine.ts`

Peers move on the same grid; we receive discrete tile targets and smoothly interpolate toward them using the same slide durations as the local player, so everyone moves at the same cadence.

- [ ] **Step 1: Implement peers.ts**

```ts
// src/game/peers.ts
import { CARDINAL_MS, DIAGONAL_MS } from './doug';
import { TILE } from './world';
import type { PeerState } from './net';

export class Peers {
  map = new Map<string, PeerState>();

  join(p: { id:string; char:string; name:string; x:number; y:number }): void {
    this.map.set(p.id, { ...p, tx:p.x, ty:p.y, dir:0, moving:false });
  }
  leave(id: string): void { this.map.delete(id); }
  identity(id:string, char:string, name:string): void {
    const p = this.map.get(id); if (p) { p.char = char; p.name = name; }
  }
  // server sends pixel-space target (tile*TILE). Set target; interpolation in update.
  move(id:string, x:number, y:number, dir:number, moving:boolean): void {
    const p = this.map.get(id); if (!p) return;
    p.tx = x; p.ty = y; p.dir = dir; p.moving = moving;
  }
  update(dt: number): void {
    for (const p of this.map.values()) {
      const diag = p.tx !== p.x && p.ty !== p.y;
      const dur = diag ? DIAGONAL_MS : CARDINAL_MS;
      const step = (TILE / dur) * dt; // px this frame
      p.x = approach(p.x, p.tx, step);
      p.y = approach(p.y, p.ty, step);
      if (p.x === p.tx && p.y === p.ty) p.moving = false;
    }
  }
}
function approach(cur:number, target:number, step:number): number {
  if (cur < target) return Math.min(cur + step, target);
  if (cur > target) return Math.max(cur - step, target);
  return cur;
}
```

- [ ] **Step 2: render.ts peer pass**

In the y-sorted draw list, include peers alongside the local player (sort by world-Y so closer peers overlap correctly). Reuse `drawSprite` with the peer's `char` asset set, current `dir`, and `moving` flag (walk vs idle frame; Doug peers use zero-g-float). Draw the peer's `name` tag above them in muted text (spec §2 voyager names).

- [ ] **Step 3: engine wiring**

Construct one `Peers` instance; route Net peer callbacks into it; call `peers.update(dt)` each fixed step; pass `peers.map` to the renderer.

- [ ] **Step 4: Manual verification**

Two windows: the other character glides smoothly between tiles (not teleporting), faces the right direction, shows its voyager name, and animates walk/float while moving and idles when stopped.

- [ ] **Step 5: Commit**

```bash
git add src/game/peers.ts src/game/render.ts src/game/engine.ts && git commit -m "feat: peer rendering with tile-target interpolation and name tags"
```

---

## Task 25: Server-authoritative reveals & opens (swap local resolver)

**Files:**
- Modify: `wanderlost/src/game/grass.ts`, `wanderlost/src/game/objects.ts`, `wanderlost/src/game/engine.ts`

Tasks 13/14 resolved reveals/opens locally. Now the server is the source of truth so finds are global and first-come-wins (spec §4.5). The client still PREDICTS optimistically for snappy feel, then reconciles.

- [ ] **Step 1: Grass reveal flow**

When the local player steps onto a grass tile:
1. Compute `key = tileKey(tx,ty)` and the deterministic roll (`rollReveal` from Task 13) — this gives the *candidate* kind/specimen/note.
2. If already in `grass.revealed` (from a server message), just show it; do nothing.
3. Otherwise optimistically play the rustle + show the find locally AND send `net.reveal(key, kind, specimen)`.
4. On `onReveal(key,...)` from the server: mark `grass.revealed.set(key, payload)`. If the server's payload differs from our optimistic guess (shouldn't, since deterministic), trust the server. If we get a reveal for a tile we hadn't stepped on, just render it as already-disturbed (no specimen awarded to us).

Crucially: **specimens are only added to the local inventory when WE are the revealer** (our send was first). Implement by tracking a `pendingReveals: Set<string>` of keys we optimistically claimed; when the matching server `reveal.by === self`, confirm the award; if `by !== self` (someone beat us — possible race), roll back the optimistic specimen and show a wry note ("already picked clean").

- [ ] **Step 2: Chest open flow**

On `E` near a chest at `key`: send `net.open(key)`, play open animation optimistically. On `onOpen(key, taken)`: if `taken` and we weren't the opener, show the empty/looted chest and a flavor line ("someone got here first"). If we were the opener, award the chest's deterministic contents.

- [ ] **Step 3: Reconcile snapshot on join**

`welcome.reveals`/`welcome.opens` arrive before the player moves; apply them so the world shows prior players' disturbances immediately (trampled grass, opened chests) with NO awards to the newcomer.

- [ ] **Step 4: Manual verification (two windows)**

Window A steps on a grass tile → both windows show it rustled/revealed; only A's specimen count goes up. Window B walks onto the same tile → no second award, grass already disturbed. A opens a chest → B sees it open, empty, with the "someone got here first" line if B tries it. Reload B → revealed/opened tiles persist (from DO storage via welcome).

- [ ] **Step 5: Commit**

```bash
git add src/game/grass.ts src/game/objects.ts src/game/engine.ts && git commit -m "feat: server-authoritative global reveals and opens with optimistic prediction"
```

---

## Task 26: Flavor content — specimens + notes pools

**Files:**
- Create: `wanderlost/src/content/flavor-specimens.ts`, `wanderlost/src/content/flavor-notes.ts`
- Modify: `wanderlost/src/game/grass.ts` (use the pools)

Tone is the product (spec §2): melancholy with levity. Fill these pools richly.

- [ ] **Step 1: flavor-specimens.ts**

```ts
// src/content/flavor-specimens.ts
export interface SpecimenFlavor { name: string; note: string; }
// keys MUST match the kinds rollReveal can produce
export const SPECIMEN_FLAVOR: Record<string, SpecimenFlavor> = {
  'bone-shard':   { name:'bone shard',        note:"too small to identify. too large to ignore." },
  'jaw-fragment': { name:'jaw fragment',      note:"it was smiling. they usually are." },
  'amber-bead':   { name:'amber bead',        note:"something is inside. it's better not to look." },
  'glass-tear':   { name:'glass tear',        note:"the grass cries these when no one is watching." },
  'rusted-cog':   { name:'rusted cog',        note:"proof someone tried to build a clock out here." },
  'pale-flower':  { name:'pale flower',       note:"it has no sun to turn toward, and turns anyway." },
  'star-fleck':   { name:'star-fleck',       note:"fell a long time ago. still warm. impossible." },
  'quiet-stone':  { name:'quiet stone',       note:"hum it to your ear and you hear your own house." },
};
export const SPECIMEN_KINDS = Object.keys(SPECIMEN_FLAVOR);
```

- [ ] **Step 2: flavor-notes.ts (rare folded-note finds, spec §2 ~1/800 grass)**

```ts
// src/content/flavor-notes.ts
export const NOTES: string[] = [
  "Day 9. I keep finding bones that match no animal I know, including myself.",
  "If you're reading this, the grass took my radio. Don't let it near anything that hums.",
  "I named the two suns. Then they set together and I felt foolish.",
  "There was a chest here. I left it for whoever's next. That's you. Sorry it's empty.",
  "I walked east for a year. East is a rumor.",
  "My ship is forty thousand steps that way. I counted. I am not going back.",
  "Saw another wanderer today. Waved. They waved. Neither of us came closer.",
  "The flowers only open at night. I've started keeping their hours.",
  "I think the planet is lonely too. That's why it keeps things for us to find.",
  "Whoever you are: you are not the first, and the grass will let you pretend you are.",
];
```

- [ ] **Step 3: Wire pools into grass.ts**

`rollReveal` selects a specimen kind from `SPECIMEN_KINDS` via the deterministic chunk RNG, and on the rare note roll picks `NOTES[rng()*NOTES.length|0]`, returning `{kind:'note', text}`. On a note reveal, `engine` calls `addJournal({id:key, text, day})` (Task 18) and shows a thought bubble.

- [ ] **Step 4: Manual verification**

Collect several specimens → inventory shows flavorful names + notes. Walk a lot of grass → eventually find a folded note; it appears in the journal tab and triggers a bubble.

- [ ] **Step 5: Commit**

```bash
git add src/content/flavor-specimens.ts src/content/flavor-notes.ts src/game/grass.ts && git commit -m "feat: specimen and folded-note flavor pools"
```

---

## Task 27: Touch controls — on-screen dpad for mobile

**Files:**
- Create: `wanderlost/src/Touch.tsx`
- Modify: `wanderlost/src/App.tsx`, `wanderlost/src/game/input.ts`

8-direction virtual dpad + an action button, shown only on touch devices.

- [ ] **Step 1: input.ts touch API**

Add `setTouchVector(dx:number, dy:number)` and `pressAction()` to the `Input` class. The held-key intent logic already converts a vector to a `Dir` (Task 9); touch just feeds that same vector (each component in {-1,0,1}). Touch vector overrides keyboard when nonzero.

- [ ] **Step 2: Touch.tsx**

```tsx
// src/Touch.tsx
import { useRef } from 'preact/hooks';

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function Touch({ onVec, onAction }: { onVec:(dx:number,dy:number)=>void; onAction:()=>void }) {
  if (!isTouch) return null;
  const ref = useRef<HTMLDivElement>(null);

  function handle(e: TouchEvent) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const t = e.touches[0]; if (!t) { onVec(0,0); return; }
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const dx = t.clientX - cx, dy = t.clientY - cy;
    const dead = 16;
    onVec(Math.abs(dx)<dead?0:Math.sign(dx), Math.abs(dy)<dead?0:Math.sign(dy));
  }

  return (
    <>
      <div ref={ref} style={pad}
        onTouchStart={handle as any} onTouchMove={handle as any}
        onTouchEnd={() => onVec(0,0)}>
        <div style={knob} />
      </div>
      <button style={action} onTouchStart={(e)=>{e.preventDefault();onAction();}}>E</button>
    </>
  );
}

const pad = { position:'fixed', left:24, bottom:24, width:120, height:120, borderRadius:'50%', border:'1px solid #4a4338', background:'rgba(22,20,15,0.5)', zIndex:40, touchAction:'none', display:'flex', alignItems:'center', justifyContent:'center' } as const;
const knob = { width:40, height:40, borderRadius:'50%', background:'rgba(212,164,55,0.4)' } as const;
const action = { position:'fixed', right:24, bottom:40, width:72, height:72, borderRadius:'50%', border:'1px solid #d4a437', background:'rgba(22,20,15,0.6)', color:'#d4a437', fontSize:18, zIndex:40, touchAction:'none' } as const;
```

- [ ] **Step 3: App wiring**

Render `<Touch onVec={(dx,dy)=>engine.input.setTouchVector(dx,dy)} onAction={()=>engine.input.pressAction()} />`.

- [ ] **Step 4: Manual verification**

In device emulation (or a phone), the dpad appears, drags move the character 8-directionally, the E button opens chests. On desktop the controls are hidden.

- [ ] **Step 5: Commit**

```bash
git add src/Touch.tsx src/App.tsx src/game/input.ts && git commit -m "feat: mobile on-screen dpad and action button"
```

---

## Task 28: Deploy — Worker first, then Pages

**Files:**
- Modify: `wanderlost/src/game/net.ts` (real WS URL), `wanderlost/.env.production`
- Create: `wanderlost/public/assets/CREDITS.md` (if not already)

Per memory `feedback_cf_pages_direct_deploy` + `feedback_goolz_deploy_target_dirs`: deploy via `wrangler` directly (not git), and move any heavy non-shipping dirs out of the tree before upload.

- [ ] **Step 1: Deploy the Worker (DO)**

```bash
cd ~/dev/wanderlost/worker
pnpm wrangler deploy
# capture the printed URL, e.g. https://wanderlost-realtime.<account>.workers.dev
```

Verify: `curl https://wanderlost-realtime.<account>.workers.dev/health` → `ok`.

- [ ] **Step 2: Point the client at the deployed Worker**

Create `~/dev/wanderlost/.env.production`:
```
VITE_WS_URL=wss://wanderlost-realtime.<account>.workers.dev/ws
```
Also update the fallback default in `net.ts` to this URL (so it's correct even without env). Commit.

- [ ] **Step 3: Build the client**

```bash
cd ~/dev/wanderlost && pnpm build
# sanity: ls dist/ has index.html + assets/
```

- [ ] **Step 4: Move heavy non-shipping dirs out before upload**

```bash
cd ~/dev/wanderlost
mkdir -p /tmp/wl-stash
[ -d node_modules ] && true   # vite already excludes; only stash stray heavy dirs
# wrangler pages deploy uploads ONLY the given dir (dist), so this is usually a no-op.
```
(`pages deploy dist` uploads just `dist/`, so the goolz target/ problem doesn't apply here. Keep this step as an explicit check that `dist/` is lean: `du -sh dist`.)

- [ ] **Step 5: Create the Pages project + deploy**

```bash
cd ~/dev/wanderlost
pnpm wrangler pages deploy dist --project-name wanderlost
```
First run creates the project (accept prompts / use `--branch main`). Capture the live URL `https://wanderlost.pages.dev`.

- [ ] **Step 6: Smoke test production**

Open `https://wanderlost.pages.dev` in two browsers. Verify: character select → wander → see the other player move → reveal grass globally → open a chest → day/night shifts → audio plays after gesture → reload persists position. Check the console for the WS connecting to the `wss://...workers.dev` URL (not localhost).

- [ ] **Step 7: Final commit + push**

```bash
cd ~/dev/wanderlost
git add -A && git commit -m "chore: production WS URL and deploy config"
git remote -v   # CONFIRM origin = github.com/melonmelonz/wanderlost (memory: never push upstream)
git push -u origin main
```

---

## Final Self-Review Checklist

- [ ] All spec §3 mechanics present: 8-dir grid slide, grass auto-interact, chest E-open, day/night.
- [ ] Multiplayer: presence, movement relay, global reveal/open all work across two clients.
- [ ] Persistence restores position + character + specimens + journal after reload.
- [ ] Determinism: two clients with the same `seed` render identical terrain.
- [ ] Tone present: specimen flavor, idle thoughts, day cards, voyager names, rare notes.
- [ ] Audio starts on gesture, mutes, ducks at night.
- [ ] Mobile dpad works; desktop hides it.
- [ ] No secrets committed (`.env.local` gitignored; PIXELLAB token not in repo).
- [ ] `origin` remote is `melonmelonz/wanderlost`; deployed via wrangler, not git provider.
- [ ] Both URLs live: `wanderlost.pages.dev` + `wanderlost-realtime.<account>.workers.dev`.
