// src/content/flavor-examine.ts
// What Doug notices when he stops and really looks at a thing. Same lonely-wanderer voice as the
// folded notes. Each prop kind has a few lines; the same tile always yields the same line so the
// world feels remembered rather than random.
import type { PropKind } from '../game/map-data';

export const EXAMINE: Record<PropKind, string[]> = {
  chest: [
    "Empty now. It held what it held. You were here for it.",
    "The lid still swings. Somebody packed this with hope, once.",
  ],
  campfire: [
    "Still warm. Either you tend it or someone just left. Hard to know which is sadder.",
    "Embers. You could sit a while. The dark will keep.",
  ],
  tree: [
    "Bark like old rope. It has outlasted everyone who named it.",
    "It leans the way the wind has asked it to, for a very long time.",
  ],
  stump: [
    "Rings you could count, if counting still meant anything out here.",
    "Something tall stood here. Now it's a place to rest a hand.",
  ],
  ruin: [
    "An arch to a building that forgot itself. You walk through anyway. It feels polite.",
    "Someone cut these stones square. That used to matter to someone.",
  ],
  antenna: [
    "It still points at the sky. Nothing answers. It keeps pointing.",
    "A dead tower listening for a voice that stopped a long time ago.",
  ],
  ship: [
    "It came down hard. Whoever flew it walked off, or didn't. No way to ask.",
    "The hull's gone cold. You rest a palm on it like it's a tired animal.",
  ],
  pod: [
    "Sealed. The glass is fogged from the inside. Best not to wonder by what.",
    "It hums, faintly. Something in here is still patient.",
  ],
  terminal: [
    "The screen wakes, shows you a cursor, asks nothing. Companionable, in its way.",
    "Lines of light scroll past. Maybe a log. Maybe a heartbeat. You can't read it.",
  ],
  jellyfish: [
    "It drifts where no water is. Glows soft. Doesn't seem to mind you watching.",
    "Weightless, lit from within. The closest thing to company in miles.",
  ],
  signpost: [
    "The lettering's worn to ghosts. It points four ways. All of them are out.",
    "A sign for a road that the grass took back. You read it anyway.",
  ],
  bench: [
    "Two planks and a promise of rest. You take the rest. Leave the promise.",
    "Someone built this to be sat on. You oblige them, late, but you oblige them.",
  ],
  bedroll: [
    "Still rolled out, like the sleeper means to come back. They don't.",
    "A flattened patch and an old blanket. You've slept in worse. You will again.",
  ],
  mushroom: [
    "It glows the colour of a sky you half-remember. Don't eat it. Probably.",
    "Cool light, no heat. It asks for nothing and gives a little anyway.",
  ],
  flower: [
    "One bloom, against all the odds and the soil. You leave it where it is.",
    "Improbable, small, alive. Nine empty days are worth one of these.",
  ],
  boulder: [
    "It has not moved in your lifetime and won't in the next. Restful, that.",
    "A rock the size of a decision. You walk around it, like everyone before.",
  ],
  skeleton: [
    "A traveller who stopped travelling. You straighten what you can. Keep walking.",
    "Bones, arranged the way a body settles. Someone got this far, too.",
  ],
  bones: [
    "Scattered, bleached, anonymous. The grass is good company to them now.",
    "Picked clean by time. You keep a couple. They make decent company.",
  ],
  statue: [
    "A figure carved facing the horizon. Patient. It's been looking longer than you.",
    "Whoever this honoured is gone. The stone kept looking out anyway.",
  ],
  scrap: [
    "Twisted metal, no use left in it. Something flew, once, and stopped.",
    "Sharp edges, soft rust. A machine's last argument with the ground.",
  ],
  gem: [
    "It catches the light like it has somewhere better to be. It doesn't.",
    "A bright hard thing in all this soft grey. You almost feel watched by it.",
  ],
};

export function examineFor(kind: PropKind, tx: number, ty: number): string {
  const lines = EXAMINE[kind];
  const i = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
  return lines[i % lines.length]!;
}
