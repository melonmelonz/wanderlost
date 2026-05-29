// src/game/objects.ts
import type { PropKind } from './map-data';

// Props already on local mute disk live under objects/mute/; newly pulled props under objects/props/.
const PATHS: Record<PropKind, (v: number) => string> = {
  chest:    v => `/assets/objects/mute/treasure-chest-${(v % 7) + 1}.png`,
  campfire: () => `/assets/objects/campfire/0.png`,
  tree:     v => `/assets/objects/mute/alien-tree-${6 + (v % 4)}.png`,
  ruin:     v => `/assets/objects/mute/ruin-archway-${(v % 2) + 1}.png`,
  antenna:  () => `/assets/objects/mute/antenna-tower.png`,
  ship:     v => `/assets/objects/mute/crashed-ship-${(v % 2) + 1}.png`,
  pod:      v => `/assets/objects/mute/cyan-pod-${10 + (v % 3)}.png`,
  terminal: v => `/assets/objects/mute/data-terminal-${(v % 5) + 1}.png`,
  jellyfish:v => `/assets/objects/mute/jellyfish-${(v % 4) + 1}.png`,
  stump:    v => `/assets/objects/props/stump-${v % 1}.png`,
  signpost: v => `/assets/objects/props/signpost-${v % 1}.png`,
  bench:    v => `/assets/objects/props/bench-${v % 1}.png`,
  bedroll:  v => `/assets/objects/props/bedroll-${v % 1}.png`,
  mushroom: v => `/assets/objects/props/mushroom-${v % 2}.png`,
  flower:   v => `/assets/objects/props/flower-${v % 2}.png`,
  boulder:  v => `/assets/objects/props/boulder-${v % 2}.png`,
  skeleton: v => `/assets/objects/props/skeleton-${v % 1}.png`,
  bones:    v => `/assets/objects/props/bones-${v % 2}.png`,
  statue:   v => `/assets/objects/props/statue-${v % 1}.png`,
  scrap:    v => `/assets/objects/props/scrap-${v % 2}.png`,
  gem:      v => `/assets/objects/props/gem-${v % 1}.png`,
};

export function objectPath(kind: PropKind, variant: number) { return PATHS[kind](variant); }

export function allObjectSources(): string[] {
  const out: string[] = [];
  for (const kind of Object.keys(PATHS) as PropKind[]) for (let v = 0; v < 7; v++) out.push(PATHS[kind](v));
  return [...new Set(out)];
}

// Which chests have been opened (network makes it authoritative).
export class OpenState {
  private open = new Set<string>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isOpen(tx: number, ty: number) { return this.open.has(OpenState.key(tx, ty)); }
  setOpen(tx: number, ty: number) { this.open.add(OpenState.key(tx, ty)); }
  keys() { return this.open.values(); }
}
