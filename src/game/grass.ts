// src/game/grass.ts
import { xmur3, mulberry32 } from './rng';

export type RevealResult = number | 'note' | null; // 1..7 collectible, a note, or nothing

// Deterministic per (seed,tx,ty): every client agrees on what a given grass tile hides.
export function rollReveal(worldSeed: number, tx: number, ty: number): RevealResult {
  const rng = mulberry32(xmur3(`reveal|${worldSeed}|${tx}|${ty}`)());
  const r = rng();
  if (r < 0.00125) return 'note';                  // ~1/800
  if (r < 0.125) return 1 + Math.floor(rng() * 7); // ~12% collectible (types 1..7)
  return null;
}

// Tracks which grass tiles have been searched and what they gave up.
export class GrassState {
  private revealed = new Map<string, RevealResult>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isRevealed(tx: number, ty: number) { return this.revealed.has(GrassState.key(tx, ty)); }
  get(tx: number, ty: number) { return this.revealed.get(GrassState.key(tx, ty)); }
  set(tx: number, ty: number, r: RevealResult) { this.revealed.set(GrassState.key(tx, ty), r); }
  entries() { return this.revealed.entries(); }
}
