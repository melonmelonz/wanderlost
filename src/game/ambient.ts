// src/game/ambient.ts
// Frame-based ambient animations. Real pre-rendered PNG sequences (extracted from the authored
// pixel-art gifs) that the canvas steps through by clock — the same approach as character walks.
// No procedural shear/sine distortion: each frame is drawn crisp and 1:1.
export interface FrameAnim { dir: string; count: number; fps: number; }

export const GRASS_SWAY: FrameAnim = { dir: '/assets/grass/sway', count: 5, fps: 7 };
export const CAMPFIRE: FrameAnim = { dir: '/assets/objects/campfire', count: 7, fps: 12 };

export function framePath(a: FrameAnim, i: number): string { return `${a.dir}/${i}.png`; }

export function frameSources(a: FrameAnim): string[] {
  return Array.from({ length: a.count }, (_, i) => framePath(a, i));
}

// Current frame index for a clock (ms). `offset` desyncs instances (e.g. per grass tile) so a
// field doesn't pulse in lockstep, while each tile still plays a clean, in-order loop.
export function frameAt(a: FrameAnim, nowMs: number, offset = 0): number {
  return (Math.floor((nowMs / 1000) * a.fps) + offset) % a.count;
}
