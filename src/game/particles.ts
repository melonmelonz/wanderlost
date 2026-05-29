// src/game/particles.ts
// Tiny transient particle pool. Used for footstep dust: a few motes kicked up on each tile
// arrival that drift, settle, and fade over a few hundred ms. Pure logic — render reads `items`.
export interface Particle {
  x: number; y: number;   // world px
  vx: number; vy: number; // px per ms
  life: number;           // ms elapsed
  max: number;            // ms lifespan
  size: number;
  rgb: string;            // "r,g,b" — alpha is derived from remaining life at draw time
}

export class Particles {
  private list: Particle[] = [];
  get items(): readonly Particle[] { return this.list; }

  // Kick up `count` motes from (x,y). rng is injectable so tests are deterministic.
  spawn(x: number, y: number, rgb: string, count = 5, rng: () => number = Math.random) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 0.012 + rng() * 0.03;
      this.list.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: -Math.abs(Math.sin(a) * sp) - 0.008, // bias upward so dust puffs, then settles
        life: 0,
        max: 320 + rng() * 260,
        size: 1 + rng() * 1.6,
        rgb,
      });
    }
  }

  update(dtMs: number) {
    for (const p of this.list) {
      p.life += dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.vy += 0.00005 * dtMs; // gentle gravity so motes arc and settle
    }
    this.list = this.list.filter(p => p.life < p.max);
  }
}
