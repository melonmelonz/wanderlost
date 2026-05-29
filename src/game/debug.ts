// src/game/debug.ts
// Lightweight logger gated by the ?debug URL flag. Zero overhead when disabled.
export type Logger = (tag: string, data?: unknown) => void;

export function makeLogger(enabled: boolean, sink: (msg: string) => void = (m) => console.log(m)): Logger {
  if (!enabled) return () => {};
  return (tag, data) => sink(`[wl ${tag}] ${data !== undefined ? JSON.stringify(data) : ''}`);
}

export function debugEnabled(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
}
