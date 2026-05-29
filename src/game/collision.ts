// src/game/collision.ts
import type { World } from './world';

// Pokémon-style grid movement gate. Target must be walkable, and diagonals may not cut through
// a corner formed by two blocked orthogonal neighbors.
export function canStep(world: World, tx: number, ty: number, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  if (world.isBlocked(tx + dx, ty + dy)) return false;
  if (dx !== 0 && dy !== 0 && world.isBlocked(tx + dx, ty) && world.isBlocked(tx, ty + dy)) return false;
  return true;
}
