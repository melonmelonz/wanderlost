// src/game/hud-bus.ts
// Tiny pub/sub bridge between the canvas game loop and the Preact overlays.
type Listener = () => void;

export interface JournalEntry { id: string; text: string; day: number; }

export const hudState = {
  specimens: {} as Record<number, number>,
  interact: '' as string,
  dayCard: '' as string,
  specimenFlash: 0 as number,
  muted: false as boolean,
  inventoryOpen: false as boolean,
  characterSelectOpen: false as boolean,
  journal: [] as JournalEntry[],
  character: 'doug' as string,
  peerCount: 0 as number,
};

const listeners = new Set<Listener>();
export function subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); }
export function emit() { listeners.forEach(l => l()); }

let interactTimer = 0;
let dayTimer = 0;

export function addSpecimen(type: number) {
  hudState.specimens[type] = (hudState.specimens[type] ?? 0) + 1;
  hudState.specimenFlash = performance.now();
  emit();
}

// Examine text shown when the player interacts (space/E) with a nearby prop. Transient, bottom-centre.
export function showInteract(text: string) {
  hudState.interact = text; emit();
  clearTimeout(interactTimer);
  interactTimer = setTimeout(() => { hudState.interact = ''; emit(); }, 4200) as unknown as number;
}

export function showDayCard(text: string) {
  hudState.dayCard = text; emit();
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => { hudState.dayCard = ''; emit(); }, 3500) as unknown as number;
}

export function setMuted(m: boolean) { hudState.muted = m; emit(); }
export function setPeerCount(n: number) { hudState.peerCount = n; emit(); }

export function toggleInventory() { hudState.inventoryOpen = !hudState.inventoryOpen; emit(); }
export function openCharacterSelect() { hudState.characterSelectOpen = true; emit(); }
export function closeCharacterSelect() { hudState.characterSelectOpen = false; emit(); }
export function setCharacter(slug: string) { hudState.character = slug; emit(); }

export function addJournal(entry: JournalEntry) {
  if (hudState.journal.some(e => e.id === entry.id)) return; // de-dupe notes
  hudState.journal.push(entry);
  emit();
}

// Restore persisted HUD-visible state on boot.
export function hydrateHud(s: Partial<typeof hudState>) {
  Object.assign(hudState, s);
  emit();
}
