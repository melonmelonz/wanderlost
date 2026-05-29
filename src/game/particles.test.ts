// src/game/particles.test.ts
import { describe, it, expect } from 'bun:test';
import { Particles } from './particles';

describe('Particles', () => {
  it('spawns the requested number of motes', () => {
    const p = new Particles();
    p.spawn(10, 20, '150,170,90', 5, () => 0.5);
    expect(p.items.length).toBe(5);
  });

  it('moves motes over time and ages them', () => {
    const p = new Particles();
    p.spawn(0, 0, '1,2,3', 1, () => 0.5);
    const before = { ...p.items[0]! };
    p.update(50);
    const after = p.items[0]!;
    expect(after.life).toBe(50);
    expect(after.y).not.toBe(before.y); // drifted
  });

  it('expires motes once past their lifespan', () => {
    const p = new Particles();
    p.spawn(0, 0, '1,2,3', 3, () => 0); // max = 320 with rng()=0
    p.update(319);
    expect(p.items.length).toBe(3);
    p.update(2); // now past 320
    expect(p.items.length).toBe(0);
  });
});
