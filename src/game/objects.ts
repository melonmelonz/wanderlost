// src/game/objects.ts
import type { ObjectKind } from './world';

const PATHS: Record<ObjectKind, (v: number) => string> = {
  chest: v => `/assets/objects/mute/treasure-chest-${(v % 7) + 1}.png`,
  campfire: () => `/assets/objects/campfire-flicker.gif`,
  tree: v => `/assets/objects/mute/alien-tree-${6 + (v % 4)}.png`,
  ruin: v => `/assets/objects/mute/ruin-archway-${(v % 2) + 1}.png`,
  antenna: () => `/assets/objects/mute/antenna-tower.png`,
  ship: v => `/assets/objects/mute/crashed-ship-${(v % 2) + 1}.png`,
  pod: v => `/assets/objects/mute/cyan-pod-${10 + (v % 3)}.png`,
  terminal: v => `/assets/objects/mute/data-terminal-${(v % 5) + 1}.png`,
  jellyfish: v => `/assets/objects/mute/jellyfish-${(v % 4) + 1}.png`,
};

export function objectPath(kind: ObjectKind, variant: number) { return PATHS[kind](variant); }

export function allObjectSources(): string[] {
  const out: string[] = [];
  for (let v = 0; v < 7; v++) {
    out.push(PATHS.chest(v), PATHS.tree(v), PATHS.ruin(v), PATHS.ship(v), PATHS.pod(v), PATHS.terminal(v), PATHS.jellyfish(v));
  }
  out.push(PATHS.antenna(0));
  return [...new Set(out)];
}

// Which chests have been opened (local until network makes it authoritative).
export class OpenState {
  private open = new Set<string>();
  static key(tx: number, ty: number) { return `${tx},${ty}`; }
  isOpen(tx: number, ty: number) { return this.open.has(OpenState.key(tx, ty)); }
  setOpen(tx: number, ty: number) { this.open.add(OpenState.key(tx, ty)); }
  keys() { return this.open.values(); }
}
