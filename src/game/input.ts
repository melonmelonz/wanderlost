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
  // touch dpad writes directly into these
  touchDx = 0; touchDy = 0;

  attach() {
    addEventListener('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.held.add(k);
      if (k === 'e' || k === ' ') this.onAction?.();
      if (k === 'i' || k === 'tab') { e.preventDefault(); this.onToggleInventory?.(); }
      if (k === 'm') this.onMute?.();
    });
    addEventListener('keyup', (e: KeyboardEvent) => this.held.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.held.clear());
  }

  // Current movement intent: each axis snapped to -1/0/1.
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
