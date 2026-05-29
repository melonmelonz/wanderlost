// src/game/daynight.ts
export const CYCLE_MS = 8 * 60 * 1000; // 8 minutes
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

export interface Phase { name: PhaseName; tint: string; alpha: number; starAlpha: number; }

function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

export function phaseAt(ms: number): Phase {
  const t = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const frac = t / CYCLE_MS; // 0..1
  if (frac < 1 / 8)  return { name: 'dawn',  tint: '#d4a437', alpha: 0.12, starAlpha: lerp(0.3, 0, frac / (1 / 8)) };
  if (frac < 5 / 8)  return { name: 'day',   tint: '#000000', alpha: 0.0,  starAlpha: 0 };
  if (frac < 6 / 8)  return { name: 'dusk',  tint: '#b04280', alpha: 0.18, starAlpha: lerp(0, 0.6, (frac - 5 / 8) / (1 / 8)) };
  return { name: 'night', tint: '#0a0a30', alpha: 0.45, starAlpha: lerp(0.6, 1, (frac - 6 / 8) / (2 / 8)) };
}

export function dayNumber(ms: number) { return Math.floor(ms / CYCLE_MS); }

// 0 at midday, 1 deep at night — drives campfire glow strength and audio ducking.
export function nightStrength(ms: number): number {
  const frac = (((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
  return (1 - Math.cos(frac * Math.PI * 2)) / 2;
}
