// src/content/flavor-examine.test.ts
import { describe, it, expect } from 'bun:test';
import { EXAMINE, examineFor } from './flavor-examine';
import type { PropKind } from '../game/map-data';

describe('examine flavor', () => {
  it('has at least one non-empty line for every prop kind', () => {
    for (const [kind, lines] of Object.entries(EXAMINE)) {
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns the same line for the same tile (world feels remembered)', () => {
    expect(examineFor('statue', 12, 34)).toBe(examineFor('statue', 12, 34));
  });

  it('returns a line that belongs to the requested kind', () => {
    const kind: PropKind = 'jellyfish';
    expect(EXAMINE[kind]).toContain(examineFor(kind, 7, 9));
  });

  it('varies across tiles for kinds with multiple lines', () => {
    const seen = new Set<string>();
    for (let tx = 0; tx < 8; tx++) for (let ty = 0; ty < 8; ty++) seen.add(examineFor('tree', tx, ty));
    expect(seen.size).toBeGreaterThan(1);
  });
});
