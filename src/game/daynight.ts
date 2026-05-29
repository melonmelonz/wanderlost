// src/game/daynight.ts
export const CYCLE_MS = 8 * 60 * 1000; // 8 minutes
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

export interface Phase { name: PhaseName; tint: string; alpha: number; starAlpha: number; }

function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// Color/alpha/star keyframes around the cycle (frac 0..1). Values are interpolated continuously
// between adjacent keyframes so the tint never snaps — dawn warms in, day is clear, dusk reddens,
// night deepens, then sunrise blends night-blue back to dawn-gold across the 0.97->1.0 wrap.
interface Key { f: number; r: number; g: number; b: number; a: number; s: number; }
const KEYS: Key[] = [
  { f: 0.00, r: 212, g: 164, b: 55,  a: 0.12, s: 0.30 }, // dawn
  { f: 0.125, r: 0,  g: 0,   b: 0,   a: 0.00, s: 0.00 }, // full day
  { f: 0.55, r: 0,   g: 0,   b: 0,   a: 0.00, s: 0.00 }, // hold day
  { f: 0.625, r: 176, g: 66, b: 128, a: 0.10, s: 0.10 }, // dusk begins
  { f: 0.75, r: 176, g: 66,  b: 128, a: 0.20, s: 0.35 }, // dusk peak
  { f: 0.875, r: 10, g: 10,  b: 48,  a: 0.45, s: 0.85 }, // night
  { f: 0.97, r: 10,  g: 10,  b: 48,  a: 0.48, s: 1.00 }, // deep night
];

function phaseName(frac: number): PhaseName {
  if (frac < 1 / 8) return 'dawn';
  if (frac < 5 / 8) return 'day';
  if (frac < 6 / 8) return 'dusk';
  return 'night';
}

export function phaseAt(ms: number): Phase {
  const frac = (((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS; // 0..1
  // find the bracketing keyframe pair, wrapping the last back to the first (dawn) at frac 1.0
  let lo: Key = KEYS[KEYS.length - 1]!, hi: Key = KEYS[0]!;
  let span = 1 - lo.f + hi.f, local = ((frac - lo.f + 1) % 1) / span;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!, c = KEYS[i + 1]!;
    if (frac >= a.f && frac < c.f) {
      lo = a; hi = c; span = hi.f - lo.f; local = (frac - lo.f) / span; break;
    }
  }
  const r = Math.round(lerp(lo.r, hi.r, local));
  const g = Math.round(lerp(lo.g, hi.g, local));
  const b = Math.round(lerp(lo.b, hi.b, local));
  return {
    name: phaseName(frac),
    tint: `rgb(${r},${g},${b})`,
    alpha: lerp(lo.a, hi.a, local),
    starAlpha: lerp(lo.s, hi.s, local),
  };
}

export function dayNumber(ms: number) { return Math.floor(ms / CYCLE_MS); }

// 0 at midday, 1 deep at night — drives campfire glow strength and audio ducking.
export function nightStrength(ms: number): number {
  const frac = (((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
  return (1 - Math.cos(frac * Math.PI * 2)) / 2;
}
