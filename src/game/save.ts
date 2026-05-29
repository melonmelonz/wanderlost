// src/game/save.ts
// localStorage persistence: position, character, specimens, journal, day-clock, and the local
// caches of revealed grass / opened chests survive a reload. (Server-side reveal authority is
// separate — this just keeps the client from re-asking.)
import type { JournalEntry } from './hud-bus';
import type { RevealResult } from './grass';

const KEY = 'wanderlost.save.v1';

export interface SaveData {
  tx: number;
  ty: number;
  character: string;
  specimens: Record<number, number>;
  journal: JournalEntry[];
  clockMs: number;
  muted: boolean;
  revealed: [string, RevealResult][];
  opened: string[];
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / disabled storage — fail silently, game still runs */
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Coalesce frequent saves into at most one write per `intervalMs`.
export function makeThrottledSaver(intervalMs = 1500): (get: () => SaveData) => void {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  return (get) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      writeSave(get());
    } else if (!pending) {
      pending = setTimeout(() => {
        pending = null; last = Date.now(); writeSave(get());
      }, intervalMs - (now - last));
    }
  };
}
