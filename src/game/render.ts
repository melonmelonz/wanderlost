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

interface Drawable { wy: number; draw(): void; }

export function render(ctx: CanvasRenderingContext2D, world: World, player: Player, cam: Camera, rc: RenderCtx) {
  const { width, height } = ctx.canvas;
  const targetX = player.px + TILE / 2 - width / 2;
  const targetY = player.py + TILE / 2 - height / 2;
  cam.x += (targetX - cam.x) * 0.12; // gentle follow — a touch smoother than a hard snap
  cam.y += (targetY - cam.y) * 0.12;
  // Draw against a whole-pixel camera. The smoothed cam stays fractional for state, but every
  // sprite and tile is offset by the SAME integer, so the player never shimmers +/-1px against
  // the ground (independent rounding of fractional offsets was a big source of the jitter).
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

  // animated grass sway, overlaid on grass-ground tiles; dimmed once searched
  const grassImg = getImage('/assets/grass/grass-sway.gif');
  if (grassImg) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (world.groundAt(tx, ty) !== GroundType.Grass) continue;
        const sx = tx * TILE - camX, sy = ty * TILE - camY;
        // top-pinned wave: shear the blade tips sideways while the base stays planted, so the
        // breeze visibly ripples across the field. drawImage can't animate the GIF frames, so we
        // move the pixels ourselves. Phase advances SMOOTHLY across space (a travelling wave), so
        // neighbouring tufts lean *together* like real wind. A per-tile random phase (the old
        // approach) made adjacent tiles shear in opposite directions, overlapping their dark blades
        // into doubled-darkness columns that swept across the field as black "bars". The two slow
        // harmonics keep it organic without ever locking into one rigid synced wavefront.
        const ph = (tx + ty) * 0.6;
        const shear = (Math.sin(now / 900 + ph) * 0.7 + Math.sin(now / 2100 + ph * 0.5) * 0.3) * 0.09;
        const baseY = sy + TILE;
        ctx.globalAlpha = rc.grass.isRevealed(tx, ty) ? 0.4 : 0.85;
        ctx.save();
        ctx.translate(0, baseY); ctx.transform(1, 0, shear, 1, 0, 0); ctx.translate(0, -baseY);
        ctx.drawImage(grassImg, sx, sy - 4, TILE, TILE);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  // water shimmer: a couple of slow specular glints sweeping each water tile (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (world.groundAt(tx, ty) !== GroundType.Water) continue;
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      const phw = tx * 0.7 + ty * 1.3;
      for (let k = 0; k < 2; k++) {
        const yy = sy + 3 + (Math.sin(now / 700 + phw + k * 2.1) * 0.5 + 0.5) * (TILE - 6);
        const a = 0.04 + 0.05 * Math.sin(now / 480 + phw + k);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(150,220,255)';
        ctx.fillRect(sx + 3, Math.round(yy), TILE - 6, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // y-sorted drawables: authored props/scenes + peers + local player
  const drawables: Drawable[] = [];
  for (const o of world.drawables()) {
    if (o.tx < minTx - 2 || o.tx > maxTx + 2 || o.ty < minTy - 2 || o.ty > maxTy + 2) continue;
    const opened = o.kind === 'chest' && rc.open.isOpen(o.tx, o.ty);
    const path = objectPath(o.kind, o.variant);
    drawables.push({
      wy: o.ty * TILE + TILE,
      draw: () => {
        const img = getImage(path);
        if (!img) return; // assets are guaranteed at build time; no grey-block fallback
        const sx = o.tx * TILE - camX, sy = o.ty * TILE - camY;
        const w = TILE * 1.5, h = TILE * 1.5;
        const dx = sx - (w - TILE) / 2, dy = sy - (h - TILE);
        ctx.globalAlpha = opened ? 0.65 : 1;
        if (o.kind === 'tree') {
          // gentle bend: shear x by height, pivoting at the trunk base so the canopy sways
          const baseY = sy + TILE;
          const shear = Math.sin(now / 900 + o.tx * 0.6 + o.ty * 0.3) * 0.07;
          ctx.save();
          ctx.translate(0, baseY); ctx.transform(1, 0, shear, 1, 0, 0); ctx.translate(0, -baseY);
          ctx.drawImage(img, dx, dy, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, dx, dy, w, h);
        }
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
      const rad = 70 + Math.sin(rc.clockMs / 120) * 6;
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
    const pulse = 0.25 + 0.1 * Math.sin(now / 600 + o.tx + o.ty);
    const a = pulse * (0.4 + 0.6 * night);
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
