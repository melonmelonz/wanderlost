// src/game/spawn.ts
// Pick a safe starting tile. A saved position is only trusted if it still lands on a walkable
// tile in the current authored map; otherwise (stale save from an older world, corrupt data, or
// a map that has since changed) we drop the player back on the authored spawn so they can move.
import type { World } from './world';
import type { SaveData } from './save';

export function resolveStart(world: World, save: SaveData | null): { tx: number; ty: number } {
  if (save && world.inBounds(save.tx, save.ty) && !world.isBlocked(save.tx, save.ty)) {
    return { tx: save.tx, ty: save.ty };
  }
  return world.spawn;
}
