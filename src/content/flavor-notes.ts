// src/content/flavor-notes.ts
// Folded notes from wanderers who walked here before. Picked deterministically by tile.
export const NOTES = [
  "If you're reading this, you walked further than I did. Keep the bones. They're good company.",
  "Tried to count the grass. Gave up at a number with a name I forgot. Be well.",
  "The second sun lies. Walk toward the first.",
  "I left a chair somewhere east. If you find it, sit. You've earned it more than I did.",
  "Nobody is coming. This is not bad news. This is just the news.",
  "I loved someone once. The planet doesn't care, which is restful, actually.",
  "Found nothing for nine days, then a flower. Nine days was worth the flower.",
  "Don't dig where the grass is tall. Or do. I'm a note, not your mother.",
  "The ridge ahead is the same as the ridge behind. Pick a direction and mean it.",
  "I am probably still walking. We probably passed each other. Hello. Goodbye.",
  "Whoever you are: you are not the first, and the grass will let you pretend you are.",
  "I buried my name out here. Lighter now. Recommend it.",
];

export function noteFor(tx: number, ty: number): string {
  const i = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
  return NOTES[i % NOTES.length]!;
}
