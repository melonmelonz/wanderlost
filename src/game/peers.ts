// src/game/peers.ts
// Other wanderers. We receive discrete tile targets (pixel-space) and interpolate toward them
// at the same cadence as the local player, so everyone moves in lockstep with the grid.
import { CARDINAL_MS, DIAGONAL_MS } from './doug';
import { TILE } from './world';
import type { Dir } from './assets';
import { DIRS } from './assets';
import type { PeerInit } from './net';

export interface PeerState {
  id: string; char: string; name: string;
  x: number; y: number;   // current interpolated pixel position
  tx: number; ty: number; // target pixel position
  dir: number; moving: boolean;
}

export class Peers {
  map = new Map<string, PeerState>();

  join(p: PeerInit): void {
    this.map.set(p.id, { ...p, tx: p.x, ty: p.y, dir: 0, moving: false });
  }
  leave(id: string): void { this.map.delete(id); }
  identity(id: string, char: string, name: string): void {
    const p = this.map.get(id); if (p) { p.char = char; p.name = name; }
  }
  move(id: string, x: number, y: number, dir: number, moving: boolean): void {
    const p = this.map.get(id); if (!p) return;
    p.tx = x; p.ty = y; p.dir = dir; p.moving = moving;
  }
  update(dt: number): void {
    for (const p of this.map.values()) {
      const diag = p.x !== p.tx && p.y !== p.ty;
      const dur = diag ? DIAGONAL_MS : CARDINAL_MS;
      const step = (TILE / dur) * dt;
      p.x = approach(p.x, p.tx, step);
      p.y = approach(p.y, p.ty, step);
      if (p.x === p.tx && p.y === p.ty) p.moving = false;
    }
  }
}

function approach(cur: number, target: number, step: number): number {
  if (cur < target) return Math.min(cur + step, target);
  if (cur > target) return Math.max(cur - step, target);
  return cur;
}

export function dirIndex(dir: Dir): number { return Math.max(0, DIRS.indexOf(dir)); }
export function indexDir(i: number): Dir { return DIRS[((i % 8) + 8) % 8]!; }
