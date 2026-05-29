// src/game/render.ts
import { World, TILE, CHUNK } from './world';
import type { Biome } from './world';
import { Player } from './doug';
import { getImage, getWangTileset, cornerKey } from './assets';
import type { Dir } from './assets';
import { objectPath } from './objects';
import type { GrassState } from './grass';
import type { OpenState } from './objects';
import { phaseAt, nightStrength } from './daynight';
import type { PeerState } from './peers';
import { indexDir } from './peers';

const BIOME_COLOR: Record<Biome, string> = { 'soil': '#2a241c', 'red-barren': '#3a201a' };
const OSSUARY_TINT = 'rgba(200,190,170,0.10)';
const GRASS_COLOR = '#1f3a1c';

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

  // ground pass — Wang-blended tile art, else flat color; bone overlay on ossuary tiles
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      const ts = getWangTileset(t.biome);
      const r = ts?.rects.get(cornerKey(
        world.cornerUpper(t.biome, tx, ty), world.cornerUpper(t.biome, tx + 1, ty),
        world.cornerUpper(t.biome, tx, ty + 1), world.cornerUpper(t.biome, tx + 1, ty + 1),
      ));
      if (ts && r) ctx.drawImage(ts.img, r[0], r[1], r[2], r[3], sx, sy, TILE, TILE);
      else { ctx.fillStyle = BIOME_COLOR[t.biome]; ctx.fillRect(sx, sy, TILE, TILE); }
      if (t.ossuary) {
        const bi = (((tx * 7 + ty * 13) % 16) + 16) % 16;
        const bone = getImage(`/assets/tilesets/bone-overlay/tile_${bi}.png`);
        if (bone) ctx.drawImage(bone, sx, sy, TILE, TILE);
        else { ctx.fillStyle = OSSUARY_TINT; ctx.fillRect(sx, sy, TILE, TILE); }
      }
    }
  }

  // grass pass (sprite if loaded, else block); dimmed once searched
  const grassImg = getImage('/assets/grass/grass-sway.gif');
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      if (!t.grass) continue;
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      const searched = rc.grass.isRevealed(tx, ty);
      ctx.globalAlpha = searched ? 0.5 : 1;
      if (grassImg) ctx.drawImage(grassImg, sx, sy - 4, TILE, TILE);
      else { ctx.fillStyle = GRASS_COLOR; ctx.fillRect(sx + 6, sy + 6, TILE - 12, TILE - 12); }
      ctx.globalAlpha = 1;
    }
  }

  // y-sorted drawable list: world objects + peers + local player
  const drawables: Drawable[] = [];
  const cMinX = Math.floor(minTx / CHUNK), cMaxX = Math.floor(maxTx / CHUNK);
  const cMinY = Math.floor(minTy / CHUNK), cMaxY = Math.floor(maxTy / CHUNK);
  for (let cy = cMinY; cy <= cMaxY; cy++) {
    for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (const o of world.getChunk(cx, cy).objects) {
        const opened = o.kind === 'chest' && rc.open.isOpen(o.tx, o.ty);
        const path = objectPath(o.kind, o.variant);
        const wy = o.ty * TILE + TILE;
        drawables.push({
          wy, draw: () => {
            const img = getImage(path);
            const sx = Math.round(o.tx * TILE - cam.x), sy = Math.round(o.ty * TILE - cam.y);
            if (img) {
              const w = TILE * 1.5, h = TILE * 1.5;
              ctx.globalAlpha = opened ? 0.65 : 1;
              ctx.drawImage(img, sx - (w - TILE) / 2, sy - (h - TILE), w, h);
              ctx.globalAlpha = 1;
            } else {
              ctx.fillStyle = '#555'; ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
            }
          },
        });
      }
    }
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
    for (let cy = cMinY; cy <= cMaxY; cy++) for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (const o of world.getChunk(cx, cy).objects) {
        if (o.kind !== 'campfire') continue;
        const sx = o.tx * TILE - cam.x + TILE / 2, sy = o.ty * TILE - cam.y + TILE / 2;
        const rad = 70 + Math.sin(rc.clockMs / 120) * 6;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        g.addColorStop(0, `rgba(255,180,80,${0.5 * night})`);
        g.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
      }
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
  else { ctx.fillStyle = '#d4a437'; ctx.fillRect(Math.round(sx), Math.round(sy), TILE, TILE); }
  if (name) {
    ctx.font = '8px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(0,220,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(name, Math.round(sx) + TILE / 2, Math.round(sy) - 6);
    ctx.textAlign = 'left';
  }
}
