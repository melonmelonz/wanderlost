// src/game/render.ts
import { World, TILE } from './world';
import type { Biome } from './world';
import { Player } from './doug';
import { getImage, getWangTileset, cornerKey } from './assets';
import type { Dir } from './assets';

const BIOME_COLOR: Record<Biome, string> = { 'soil': '#2a241c', 'red-barren': '#3a201a' };
const OSSUARY_TINT = 'rgba(200,190,170,0.10)';
const GRASS_COLOR = '#1f3a1c';

export interface Camera { x: number; y: number; }

export interface PeerView { px: number; py: number; facing: string; character: string; name: string; }

// Optional moving sprite resolver: returns the frame src for an animated character, or null
// to fall back to the static rotation. Injected by the engine so render stays dependency-light.
export type SpriteResolver = (character: string, facing: string, moving: boolean) => string | null;

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  player: Player,
  cam: Camera,
  peers: PeerView[],
  resolve?: SpriteResolver,
) {
  const { width, height } = ctx.canvas;
  // ease camera toward player center
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

  // ground pass — Wang-blended tile art if loaded, else flat color
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      const ts = getWangTileset(t.biome);
      if (ts) {
        const key = cornerKey(
          world.cornerUpper(t.biome, tx, ty),
          world.cornerUpper(t.biome, tx + 1, ty),
          world.cornerUpper(t.biome, tx, ty + 1),
          world.cornerUpper(t.biome, tx + 1, ty + 1),
        );
        const r = ts.rects.get(key);
        if (r) ctx.drawImage(ts.img, r[0], r[1], r[2], r[3], sx, sy, TILE, TILE);
        else { ctx.fillStyle = BIOME_COLOR[t.biome]; ctx.fillRect(sx, sy, TILE, TILE); }
      } else {
        ctx.fillStyle = BIOME_COLOR[t.biome];
        ctx.fillRect(sx, sy, TILE, TILE);
      }
      if (t.ossuary) {
        const bone = getImage(`/assets/tilesets/bone-overlay/tile_${t.grassVariant * 4 % 16}.png`);
        if (bone) ctx.drawImage(bone, sx, sy, TILE, TILE);
        else { ctx.fillStyle = OSSUARY_TINT; ctx.fillRect(sx, sy, TILE, TILE); }
      }
    }
  }

  // grass pass (block placeholder; sprite art wired in grass task)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = world.tileAt(tx, ty);
      if (!t.grass) continue;
      const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
      ctx.fillStyle = GRASS_COLOR;
      ctx.fillRect(sx + 6, sy + 6, TILE - 12, TILE - 12);
    }
  }

  // peers (sorted with player by screen-y for rough depth)
  const drawables = [
    ...peers.map(p => ({ ...p, isPeer: true })),
    { px: player.px, py: player.py, facing: player.facing, character: player.character, name: '', isPeer: false },
  ].sort((a, b) => a.py - b.py);

  for (const d of drawables) {
    drawSprite(ctx, d.character, d.facing as Dir, d.px - cam.x, d.py - cam.y, d.isPeer ? d.name : undefined, resolve, !d.isPeer && player.sliding);
  }
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  character: string,
  facing: Dir,
  sx: number,
  sy: number,
  name: string | undefined,
  resolve: SpriteResolver | undefined,
  moving: boolean,
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
