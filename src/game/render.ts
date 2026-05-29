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

export interface Camera { x: number; y: number; }
export interface PeerView { px: number; py: number; facing: string; character: string; name: string; }

export type SpriteResolver = (character: string, facing: string, moving: boolean) => string | null;

export interface RenderCtx {
  clockMs: number;
  grass: GrassState;
  open: OpenState;
  peers: Map<string, PeerState>;
  resolve?: SpriteResolver;
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

interface Drawable { wy: number; draw(): void; }

export function render(ctx: CanvasRenderingContext2D, world: World, player: Player, cam: Camera, rc: RenderCtx) {
  const { width, height } = ctx.canvas;
  const targetX = player.px + TILE / 2 - width / 2;
  const targetY = player.py + TILE / 2 - height / 2;
  cam.x += (targetX - cam.x) * 0.15;
  cam.y += (targetY - cam.y) * 0.15;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const minTx = Math.floor(cam.x / TILE) - 1;
  const minTy = Math.floor(cam.y / TILE) - 1;
  const maxTx = Math.ceil((cam.x + width) / TILE) + 1;
  const maxTy = Math.ceil((cam.y + height) / TILE) + 1;

  // ground pass — soil base, then each upper terrain corner-autotiled on top
  const soilTs = getWangTileset('soil');
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
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
        const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
        ctx.globalAlpha = rc.grass.isRevealed(tx, ty) ? 0.4 : 0.85;
        ctx.drawImage(grassImg, sx, sy - 4, TILE, TILE);
        ctx.globalAlpha = 1;
      }
    }
  }

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
        const sx = Math.round(o.tx * TILE - cam.x), sy = Math.round(o.ty * TILE - cam.y);
        const w = TILE * 1.5, h = TILE * 1.5;
        ctx.globalAlpha = opened ? 0.65 : 1;
        ctx.drawImage(img, sx - (w - TILE) / 2, sy - (h - TILE), w, h);
        ctx.globalAlpha = 1;
      },
    });
  }
  for (const p of rc.peers.values()) {
    drawables.push({ wy: p.y + TILE, draw: () => drawSprite(ctx, p.char, indexDir(p.dir), p.x - cam.x, p.y - cam.y, p.name, rc.resolve, p.moving) });
  }
  drawables.push({ wy: player.py + TILE, draw: () => drawSprite(ctx, player.character, player.facing, player.px - cam.x, player.py - cam.y, undefined, rc.resolve, player.sliding) });
  drawables.sort((a, b) => a.wy - b.wy);
  for (const d of drawables) d.draw();

  // campfire glow (additive), strongest at night
  const night = nightStrength(rc.clockMs);
  if (night > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    for (const o of world.drawables()) {
      if (o.kind !== 'campfire') continue;
      const sx = o.tx * TILE - cam.x + TILE / 2, sy = o.ty * TILE - cam.y + TILE / 2;
      const rad = 70 + Math.sin(rc.clockMs / 120) * 6;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g.addColorStop(0, `rgba(255,180,80,${0.5 * night})`);
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
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
      const px = ((s.x - cam.x * 0.2) % width + width) % width;
      const py = ((s.y - cam.y * 0.2) % (height * 0.7) + height * 0.7) % (height * 0.7);
      ctx.fillRect(px, py, s.r, s.r);
    }
    ctx.restore();
  }
  if (ph.alpha > 0.001) {
    ctx.fillStyle = ph.tint; ctx.globalAlpha = ph.alpha;
    ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
  }
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
