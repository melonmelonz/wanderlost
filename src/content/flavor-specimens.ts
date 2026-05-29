// src/content/flavor-specimens.ts
// Collectible types 1..7 — name + a one-line field note.
export const SPECIMEN_FLAVOR: Record<number, { name: string; note: string }> = {
  1: { name: 'bone shard',     note: 'Light. Hollow. Belonged to something that ran.' },
  2: { name: 'glass tear',     note: 'Sand that grieved hard enough to set.' },
  3: { name: 'cyan bloom',     note: 'It glows. It does not warm. Typical.' },
  4: { name: 'rust button',    note: 'From a coat. Not yours. Not anyone\'s anymore.' },
  5: { name: 'star fleck',     note: 'A chip of sky that fell and kept its shine.' },
  6: { name: 'dry seed',       note: 'It waits for a rain this planet doesn\'t do.' },
  7: { name: 'folded wire',    note: 'Bent into a shape. Almost a letter. Almost.' },
};

export function specimenName(type: number): string {
  return SPECIMEN_FLAVOR[type]?.name ?? `specimen #${type}`;
}
