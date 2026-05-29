// src/game/debug.ts
// Lightweight logger gated by the ?debug URL flag. Zero overhead when disabled.
export type Logger = (tag: string, data?: unknown) => void;

export function makeLogger(enabled: boolean, sink: (msg: string) => void = (m) => console.log(m)): Logger {
  if (!enabled) return () => {};
  return (tag, data) => sink(`[wl ${tag}] ${data !== undefined ? JSON.stringify(data) : ''}`);
}

export function debugEnabled(search?: string): boolean {
  if (search === undefined) {
    if (typeof location === 'undefined') return false;
    search = location.search;
  }
  // Default-on while we stabilize the game loop, so the console always shows
  // boot/slide/blocked/arrive events. Pass ?quiet to silence.
  return !new URLSearchParams(search).has('quiet');
}
