// src/game/doug.ts
// Local player: grid-locked position with an eased slide tween between tiles.
import type { Dir } from './assets';
import { TILE } from './world';

export const CARDINAL_MS = 140;
export const DIAGONAL_MS = 198; // ~140 * sqrt(2): feels uniform-speed in both axes

export class Player {
  facing: Dir = 'south';
  sliding = false;
  // pixel position for rendering (interpolated during a slide)
  px: number; py: number;
  private fromPx = 0; private fromPy = 0; private toPx = 0; private toPy = 0;
  private elapsed = 0; private duration = 0;
  private pendingTx = 0; private pendingTy = 0;

  constructor(public tx: number, public ty: number, public character: string) {
    this.px = tx * TILE; this.py = ty * TILE;
  }

  // 0..1 across the current tile step (0 when idle). Drives a procedural hop in the renderer.
  get progress() { return this.sliding ? Math.min(1, this.elapsed / this.duration) : 0; }

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
    // Linear interpolation: constant velocity per tile so continuous walking is smooth.
    // (Eased tweens pulse velocity to zero at every tile boundary, which reads as choppy.)
    const t = Math.min(1, this.elapsed / this.duration);
    this.px = this.fromPx + (this.toPx - this.fromPx) * t;
    this.py = this.fromPy + (this.toPy - this.fromPy) * t;
    if (t >= 1) {
      this.sliding = false;
      this.tx = this.pendingTx; this.ty = this.pendingTy;
      this.px = this.toPx; this.py = this.toPy;
    }
  }
}
