// src/game/render.ts
import { World, TILE } from './world';
import { GroundType } from './map-data';
import { Player } from './doug';
import { getImage, getWangTileset, cornerKey } from './assets';
import type { Dir } from './assets';
import { objectPath } from './objects';
import { cornerUpper, UPPER_TERRAINS } from './terrain';
import type { GrassState } from './grass';
import type { OpenState } from './objects';
import { phaseAt, nightStrength } from './daynight';
import type { PeerState } from './peers';
import { indexDir } from './peers';
import type { Particles } from './particles';
import { GRASS_SWAY, CAMPFIRE, framePath, frameAt } from './ambient';

export interface Camera { x: number; y: number; }
export interface PeerView { px: number; py: number; facing: string; character: string; name: string; }

export type SpriteResolver = (character: string, facing: string, moving: boolean) => string | null;

export interface RenderCtx {
  clockMs: number;
  grass: GrassState;
  open: OpenState;
  peers: Map<string, PeerState>;
  resolve?: SpriteResolver;
  particles?: Particles;
}

// Precomputed parallax starfield (screen-space, regenerated on first use).
let stars: { x: number; y: number; r: number }[] | null = null;
function ensureStars(w: number, h: number) {
  if (stars) return;
  stars = [];
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 220; i++) stars.push({ x: rnd() * w, y: rnd() * h * 0.7, r: rnd() < 0.85 ? 0.7 : 1.4 });
}

// Distant birds drifting across the sky (screen-space, slow parallax). Daytime only. Each is a
// tiny chevron whose wings flap by easing the apex up and down — classic pixel-bird, no bitmaps.
let birds: { x: number; y: number; v: number; ph: number; size: number }[] | null = null;
function ensureBirds(w: number, h: number) {
  if (birds) return;
  birds = [];
  let seed = 70707;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 9; i++) {
    birds.push({
      x: rnd() * w, y: 30 + rnd() * h * 0.3,
      v: 14 + rnd() * 10, ph: rnd() * Math.PI * 2, size: 3 + Math.floor(rnd() * 2),
    });
  }
}

// World-space fireflies, scattered once over grass tiles. They only glow at dusk/night.
let fireflies: { x: number; y: number; ph: number }[] | null = null;
function ensureFireflies(world: World) {
  if (fireflies) return;
  fireflies = [];
  let seed = 991733;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let tries = 0; tries < 4000 && fireflies.length < 110; tries++) {
    const tx = Math.floor(rnd() * world.map.width), ty = Math.floor(rnd() * world.map.height);
    if (world.groundAt(tx, ty) !== GroundType.Grass) continue;
    fireflies.push({ x: tx * TILE + rnd() * TILE, y: ty * TILE + rnd() * TILE, ph: rnd() * Math.PI * 2 });
  }
}

// World-space cloud shadows: a handful of big soft blobs that drift slowly across the map. They
// only darken the ground in daylight (faded out at night, where they'd just read as murk).
let clouds: { x: number; y: number; rx: number; ry: number; vx: number; vy: number }[] | null = null;
function ensureClouds(world: World) {
  if (clouds) return;
  clouds = [];
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const W = world.map.width * TILE, H = world.map.height * TILE;
  for (let i = 0; i < 12; i++) {
    clouds.push({
      x: rnd() * W, y: rnd() * H,
      rx: 150 + rnd() * 200, ry: 90 + rnd() * 110,
      vx: 5 + rnd() * 6, vy: (rnd() - 0.5) * 2, // px/sec, mostly eastward drift
    });
  }
}

// Soft contact shadow: a flat dark ellipse that grounds a sprite to the tile beneath it.
function groundShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

interface Drawable { wy: number; draw(): void; }

export function render(ctx: CanvasRenderingContext2D, world: World, player: Player, cam: Camera, rc: RenderCtx) {
  const { width, height } = ctx.canvas;
  // Camera locked hard to the player — no easing. Exponential follow (cam += (target-cam)*k) is
  // applied per-frame, so at varying frame times it scrolls the world unevenly and reads as chop
  // against Doug's constant-velocity walk. Snapping the camera to the player keeps Doug pinned
  // dead-centre while the ground scrolls in clean whole-pixel steps — crisp, never procedural.
  cam.x = player.px + TILE / 2 - width / 2;
  cam.y = player.py + TILE / 2 - height / 2;
  // Round to whole pixels so every sprite and tile shares the SAME integer offset (no +/-1px
  // sub-pixel shimmer between the player and the ground).
  const camX = Math.round(cam.x), camY = Math.round(cam.y);

  const now = performance.now(); // continuous clock for ambient sway/glow (independent of day clock)

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const minTx = Math.floor(camX / TILE) - 1;
  const minTy = Math.floor(camY / TILE) - 1;
  const maxTx = Math.ceil((camX + width) / TILE) + 1;
  const maxTy = Math.ceil((camY + height) / TILE) + 1;

  // ground pass — soil base, then each upper terrain corner-autotiled on top
  const soilTs = getWangTileset('soil');
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      if (soilTs) {
        const base = soilTs.rects.get(0) ?? soilTs.rects.values().next().value;
        if (base) ctx.drawImage(soilTs.img, base[0], base[1], base[2], base[3], sx, sy, TILE, TILE);
      }
      for (const u of UPPER_TERRAINS) {
        const ts = getWangTileset(u.slug);
        if (!ts) continue;
        const key = cornerKey(
          cornerUpper(world, u.ground, tx, ty), cornerUpper(world, u.ground, tx + 1, ty),
          cornerUpper(world, u.ground, tx, ty + 1), cornerUpper(world, u.ground, tx + 1, ty + 1),
        );
        if (key === 0) continue;
        const r = ts.rects.get(key);
        if (r) ctx.drawImage(ts.img, r[0], r[1], r[2], r[3], sx, sy, TILE, TILE);
      }
    }
  }

  // animated grass sway, overlaid on grass-ground tiles; dimmed once searched. Real pre-rendered
  // frames stepped by clock — crisp 1:1 pixels, no shear/distortion. A per-tile frame offset keeps
  // the field from pulsing in lockstep while each tuft still plays a clean, in-order loop.
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (world.groundAt(tx, ty) !== GroundType.Grass) continue;
      const off = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const frame = getImage(framePath(GRASS_SWAY, frameAt(GRASS_SWAY, now, off)));
      if (!frame) continue;
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      ctx.globalAlpha = rc.grass.isRevealed(tx, ty) ? 0.4 : 0.85;
      ctx.drawImage(frame, sx, sy - 4, TILE, TILE);
      ctx.globalAlpha = 1;
    }
  }

  // drifting cloud shadows over the ground — daytime only, eased out as dusk falls
  const daylight = 1 - nightStrength(rc.clockMs);
  if (daylight > 0.05) {
    ensureClouds(world);
    const t = now / 1000;
    const W = world.map.width * TILE, H = world.map.height * TILE;
    ctx.save();
    for (const c of clouds!) {
      const wx = ((c.x + c.vx * t) % W + W) % W;
      const wy = ((c.y + c.vy * t) % H + H) % H;
      const sx = wx - camX, sy = wy - camY;
      if (sx < -c.rx || sy < -c.ry || sx > width + c.rx || sy > height + c.ry) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, c.rx);
      g.addColorStop(0, `rgba(0,0,0,${0.12 * daylight})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(sx, sy, c.rx, c.ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // y-sorted drawables: authored props/scenes + peers + local player
  const drawables: Drawable[] = [];
  for (const o of world.drawables()) {
    if (o.tx < minTx - 2 || o.tx > maxTx + 2 || o.ty < minTy - 2 || o.ty > maxTy + 2) continue;
    const opened = o.kind === 'chest' && rc.open.isOpen(o.tx, o.ty);
    // campfire animates through real frames; everything else is its static authored sprite
    const path = o.kind === 'campfire' ? null : objectPath(o.kind, o.variant);
    drawables.push({
      wy: o.ty * TILE + TILE,
      draw: () => {
        const sx = o.tx * TILE - camX, sy = o.ty * TILE - camY;
        const w = TILE * 1.5, h = TILE * 1.5;
        const dx = sx - (w - TILE) / 2, dy = sy - (h - TILE);
        const img = o.kind === 'campfire'
          ? getImage(framePath(CAMPFIRE, frameAt(CAMPFIRE, now, (o.tx + o.ty) % CAMPFIRE.count)))
          : getImage(path!);
        if (!img) return; // assets are guaranteed at build time; no grey-block fallback
        groundShadow(ctx, sx + TILE / 2, sy + TILE - 3, TILE * 0.42, TILE * 0.16);
        ctx.globalAlpha = opened ? 0.65 : 1;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalAlpha = 1;
      },
    });
  }
  for (const p of rc.peers.values()) {
    drawables.push({ wy: p.y + TILE, draw: () => drawSprite(ctx, p.char, indexDir(p.dir), p.x - camX, p.y - camY, p.name, rc.resolve, p.moving) });
  }
  drawables.push({ wy: player.py + TILE, draw: () => drawSprite(ctx, player.character, player.facing, player.px - camX, player.py - camY, undefined, rc.resolve, player.sliding) });
  drawables.sort((a, b) => a.wy - b.wy);
  for (const d of drawables) d.draw();

  // footstep dust: drawn above the ground, fading as motes age
  if (rc.particles) {
    for (const p of rc.particles.items) {
      const a = Math.max(0, 1 - p.life / p.max) * 0.6;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.rgb})`;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // campfire glow (additive), strongest at night
  const night = nightStrength(rc.clockMs);
  if (night > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    for (const o of world.drawables()) {
      if (o.kind !== 'campfire') continue;
      const sx = o.tx * TILE - camX + TILE / 2, sy = o.ty * TILE - camY + TILE / 2;
      const rad = 72;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g.addColorStop(0, `rgba(255,180,80,${0.5 * night})`);
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // mushroom glow (additive) — always on, gently pulsing cyan/violet, brighter at night
  ctx.globalCompositeOperation = 'lighter';
  for (const o of world.drawables()) {
    if (o.kind !== 'mushroom') continue;
    if (o.tx < minTx - 2 || o.tx > maxTx + 2 || o.ty < minTy - 2 || o.ty > maxTy + 2) continue;
    const sx = o.tx * TILE - camX + TILE / 2, sy = o.ty * TILE - camY + TILE / 2;
    const a = 0.3 * (0.4 + 0.6 * night);
    const rad = 22;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    g.addColorStop(0, `rgba(120,220,255,${a})`);
    g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // fireflies — drifting warm motes over the grass, only after dusk settles in
  if (night > 0.12) {
    ensureFireflies(world);
    const fade = Math.min(1, (night - 0.12) / 0.5);
    ctx.globalCompositeOperation = 'lighter';
    for (const f of fireflies!) {
      const wx = f.x + Math.sin(now / 1300 + f.ph) * 10;
      const wy = f.y + Math.cos(now / 1700 + f.ph * 1.3) * 8;
      const sx = wx - camX, sy = wy - camY;
      if (sx < -8 || sy < -8 || sx > width + 8 || sy > height + 8) continue;
      const flick = 0.35 + 0.65 * Math.pow(Math.sin(now / 400 + f.ph * 3) * 0.5 + 0.5, 2);
      const a = flick * fade * 0.85;
      const rad = 5;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g.addColorStop(0, `rgba(190,255,150,${a})`);
      g.addColorStop(1, 'rgba(190,255,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = 'rgb(225,255,185)';
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // distant birds drifting across the sky — daytime only, slow parallax against the camera
  const sky = 1 - nightStrength(rc.clockMs);
  if (sky > 0.2) {
    ensureBirds(width, height);
    const t = now / 1000;
    ctx.save();
    ctx.strokeStyle = `rgba(40,45,60,${0.5 * sky})`;
    ctx.lineWidth = 1;
    for (const b of birds!) {
      const x = ((b.x + b.v * t - camX * 0.05) % (width + 40) + width + 40) % (width + 40) - 20;
      const y = b.y - (camY * 0.05) % (height * 0.4); // gentle vertical parallax, stays up high
      const flap = Math.sin(t * 6 + b.ph) * 0.5 + 0.5; // 0 wings-down, 1 wings-up
      const apex = b.size * (0.3 + flap * 0.9);
      ctx.beginPath();
      ctx.moveTo(x - b.size, y);
      ctx.lineTo(x, y - apex);
      ctx.lineTo(x + b.size, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // day/night tint + starfield
  const ph = phaseAt(rc.clockMs);
  if (ph.starAlpha > 0.01) {
    ensureStars(width, height);
    ctx.save();
    ctx.fillStyle = '#fff';
    for (const s of stars!) {
      ctx.globalAlpha = ph.starAlpha * (s.r > 1 ? 0.9 : 0.6);
      const px = ((s.x - camX * 0.2) % width + width) % width;
      const py = ((s.y - camY * 0.2) % (height * 0.7) + height * 0.7) % (height * 0.7);
      ctx.fillRect(px, py, s.r, s.r);
    }
    ctx.restore();
  }
  if (ph.alpha > 0.001) {
    ctx.fillStyle = ph.tint; ctx.globalAlpha = ph.alpha;
    ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
  }

  // vignette — a soft dark frame that pulls the eye inward and deepens the mood
  const vg = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.35,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, width, height);
}

function drawSprite(
  ctx: CanvasRenderingContext2D, character: string, facing: Dir, sx: number, sy: number,
  name: string | undefined, resolve: SpriteResolver | undefined, moving: boolean,
) {
  const src = resolve?.(character, facing, moving) ?? `/assets/characters/${character}/rotations/${facing}.png`;
  const img = getImage(src) ?? getImage(`/assets/characters/${character}/rotations/${facing}.png`);
  groundShadow(ctx, Math.round(sx) + TILE / 2, Math.round(sy) + TILE - 2, TILE * 0.34, TILE * 0.13);
  if (img) ctx.drawImage(img, Math.round(sx) - 8, Math.round(sy) - 16, 48, 48);
  // else: asset missing at build time — nothing drawn (build should have failed first)
  if (name) {
    ctx.font = '8px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(0,220,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(name, Math.round(sx) + TILE / 2, Math.round(sy) - 6);
    ctx.textAlign = 'left';
  }
}
