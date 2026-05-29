// src/game/debug.test.ts
import { describe, it, expect } from 'bun:test';
import { makeLogger } from './debug';

describe('debug logger', () => {
  it('is a no-op when disabled', () => {
    let called = 0;
    const log = makeLogger(false, () => { called++; });
    log('move', { x: 1 });
    expect(called).toBe(0);
  });

  it('emits when enabled', () => {
    const lines: string[] = [];
    const log = makeLogger(true, (m) => lines.push(m));
    log('move', { x: 1 });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('move');
  });
});
