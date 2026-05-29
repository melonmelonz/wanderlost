// src/game/terrain.ts
// Ground renders as layered corner-autotiled Wang terrains over a soil base. Each "upper"
// terrain is drawn where its corner signature is non-zero, using the chained tileset whose
// lower terrain is soil — so edges always meet soil cleanly.
import { GroundType } from './map-data';
import type { World } from './world';

export const GROUND_TILESETS = ['soil', 'grass', 'red-barren', 'stone-path', 'bone-bed', 'water', 'cliff'] as const;

// Terrains drawn as Wang layers on top of the soil base, in paint order.
export const UPPER_TERRAINS: { ground: GroundType; slug: string }[] = [
  { ground: GroundType.RedBarren, slug: 'red-barren' },
  { ground: GroundType.Grass,     slug: 'grass' },
  { ground: GroundType.StonePath, slug: 'stone-path' },
  { ground: GroundType.BoneBed,   slug: 'bone-bed' },
  { ground: GroundType.Water,     slug: 'water' },
  { ground: GroundType.Cliff,     slug: 'cliff' },
];

// A grid corner (cx,cy) is shared by the 4 tiles up-left/up/left/self. Corner is "upper" for a
// terrain when 2+ of those 4 tiles are that terrain (ties grow the region slightly — looks fuller).
export function cornerUpper(world: World, terrain: GroundType, cx: number, cy: number): 0 | 1 {
  let n = 0;
  if (world.groundAt(cx - 1, cy - 1) === terrain) n++;
  if (world.groundAt(cx, cy - 1) === terrain) n++;
  if (world.groundAt(cx - 1, cy) === terrain) n++;
  if (world.groundAt(cx, cy) === terrain) n++;
  return n >= 2 ? 1 : 0;
}
