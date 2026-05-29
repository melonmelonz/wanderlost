// src/game/daynight.ts
export const CYCLE_MS = 8 * 60 * 1000; // 8 minutes
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

export interface Phase { name: PhaseName; tint: string; alpha: number; starAlpha: number; }

function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// Color/alpha/star/night keyframes around the cycle (frac 0..1). Values are interpolated
// continuously between adjacent keyframes so the tint never snaps. The world lives mostly under
// night: dawn warms in, daylight is a brief clear interlude (~frac 0.03..0.085), dusk reddens,
// then night settles and HOLDS across the long 0.20..0.97 stretch before sunrise blends the
// night-blue back to dawn-gold over the 0.97->1.0 wrap. `n` is the night strength used for glow
// and audio ducking, kept in this same table so it always tracks the tint.
interface Key { f: number; r: number; g: number; b: number; a: number; s: number; n: number; }
const KEYS: Key[] = [
  { f: 0.00, r: 212, g: 164, b: 55,  a: 0.12, s: 0.25, n: 0.15 }, // dawn (brief)
  { f: 0.03, r: 0,   g: 0,   b: 0,   a: 0.00, s: 0.00, n: 0.00 }, // full day
  { f: 0.06, r: 0,   g: 0,   b: 0,   a: 0.00, s: 0.00, n: 0.00 }, // hold day
  { f: 0.085, r: 176, g: 66, b: 128, a: 0.10, s: 0.10, n: 0.25 }, // dusk begins
  { f: 0.12, r: 176, g: 66,  b: 128, a: 0.22, s: 0.40, n: 0.55 }, // dusk peak
  { f: 0.20, r: 10,  g: 10,  b: 48,  a: 0.48, s: 0.90, n: 0.95 }, // night settles
  { f: 0.97, r: 10,  g: 10,  b: 48,  a: 0.50, s: 1.00, n: 1.00 }, // deep night (holds)
];

function phaseName(frac: number): PhaseName {
  if (frac < 0.03) return 'dawn';
  if (frac < 0.085) return 'day';
  if (frac < 0.20) return 'dusk';
  return 'night';
}

// Find the bracketing keyframe pair for a fraction, wrapping the last back to the first at 1.0,
// and return how far between them (0..1) we are.
function bracket(frac: number): { lo: Key; hi: Key; local: number } {
  let lo: Key = KEYS[KEYS.length - 1]!, hi: Key = KEYS[0]!;
  let span = 1 - lo.f + hi.f, local = ((frac - lo.f + 1) % 1) / span;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!, c = KEYS[i + 1]!;
    if (frac >= a.f && frac < c.f) { lo = a; hi = c; local = (frac - lo.f) / (hi.f - lo.f); break; }
  }
  return { lo, hi, local };
}

function fracOf(ms: number) { return (((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS; }

export function phaseAt(ms: number): Phase {
  const frac = fracOf(ms);
  const { lo, hi, local } = bracket(frac);
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

// 0 in full daylight, 1 deep at night — drives campfire glow strength and audio ducking. Tracks
// the same keyframe table as the tint so glow/sky effects always agree with the sky colour.
export function nightStrength(ms: number): number {
  const { lo, hi, local } = bracket(fracOf(ms));
  return lerp(lo.n, hi.n, local);
}
