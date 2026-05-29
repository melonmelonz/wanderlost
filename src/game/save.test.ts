// src/game/save.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { loadSave, writeSave, clearSave, type SaveData } from './save';

const sample: SaveData = {
  tx: 5, ty: -3, character: 'crab-head-v2',
  specimens: { 1: 2, 3: 1 },
  journal: [{ id: '1,2', text: 'a note', day: 4 }],
  clockMs: 12345, muted: true,
  revealed: [['1,2', 'note'], ['3,4', null], ['5,6', 7]],
  opened: ['9,9'],
};

describe('save', () => {
  beforeEach(() => clearSave());

  it('returns null when nothing is saved', () => {
    expect(loadSave()).toBe(null);
  });

  it('round-trips save data', () => {
    writeSave(sample);
    expect(loadSave()).toEqual(sample);
  });

  it('clearSave wipes state', () => {
    writeSave(sample);
    clearSave();
    expect(loadSave()).toBe(null);
  });

  it('tolerates corrupt data', () => {
    localStorage.setItem('wanderlost.save.v1', '{not json');
    expect(loadSave()).toBe(null);
  });
});
