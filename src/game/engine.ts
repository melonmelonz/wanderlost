// src/game/engine.ts
import { World, TILE } from './world';
import { canStep } from './collision';
import { GROUND_TILESETS } from './terrain';
import { Player } from './doug';
import { Input, vecToDir } from './input';
import { render, type Camera } from './render';
import { characterAssets, characterSources, preloadAll, loadImage, loadWangTileset } from './assets';
import type { Dir } from './assets';
import { GrassState, rollReveal } from './grass';
import { OpenState, allObjectSources } from './objects';
import { dayNumber, CYCLE_MS } from './daynight';
import { Net, tileKey } from './net';
import { Peers, dirIndex } from './peers';
import { startAudio, toggleMute, setDuck, isMuted } from './audio';
import { loadSave, writeSave, type SaveData } from './save';
import {
  addSpecimen, addJournal, showDayCard, showThought, setPeerCount, setMuted, setCharacter as hudSetCharacter,
  hydrateHud, toggleInventory, hudState,
} from './hud-bus';
import { THOUGHTS } from '../content/flavor-thoughts';
import { DAY_LINES } from '../content/flavor-days';
import { noteFor } from '../content/flavor-notes';
import { pick, mulberry32, xmur3 } from './rng';

const WALK_FPS = 10;

function voyagerName(): string {
  const hex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `Voyager ${hex}`;
}

export interface Game {
  input: Input;
  begin(): void;
  setCharacter(slug: string): void;
  savedCharacter?: string;
  hasSave: boolean;
  stop(): void;
}

export function startEngine(canvas: HTMLCanvasElement): Game {
  const ctx = canvas.getContext('2d')!;
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  addEventListener('resize', resize);

  const save = loadSave();
  let world = new World(1337); // default seed; the shared seed from net `welcome` overrides

  const player = new Player(save?.tx ?? world.spawn.tx, save?.ty ?? world.spawn.ty, save?.character ?? 'doug');
  const input = new Input();
  input.attach(); // register keyboard listeners (held set is read every frame via intent())
  input.paused = true; // gated until character chosen / begin()
  const cam: Camera = { x: player.px + TILE / 2 - canvas.width / 2, y: player.py + TILE / 2 - canvas.height / 2 };

  const grass = new GrassState();
  const open = new OpenState();
  const peers = new Peers();
  let clockMs = save?.clockMs ?? 0;
  let lastDay = dayNumber(clockMs);
  let identity = '';

  // restore HUD-visible state
  if (save) {
    hydrateHud({ specimens: save.specimens ?? {}, journal: save.journal ?? [], muted: !!save.muted, character: save.character });
    for (const [k, v] of save.revealed ?? []) grass.set(...(k.split(',').map(Number) as [number, number]), v);
    for (const k of save.opened ?? []) open.setOpen(...(k.split(',').map(Number) as [number, number]));
    if (save.muted) { /* audio starts muted via toggle on first gesture */ }
  }

  // assets
  for (const slug of GROUND_TILESETS) loadWangTileset(slug).catch(() => {});
  preloadAll([
    '/assets/grass/grass-sway.gif',
    '/assets/objects/campfire-flicker.gif',
    ...allObjectSources(),
  ]);
  const loadedChars = new Set<string>();
  const loadCharacter = (slug: string) => { if (!loadedChars.has(slug)) { loadedChars.add(slug); preloadAll(characterSources(slug)); } };
  loadCharacter(player.character);

  // sprite frame resolver
  let animClock = 0;
  const resolve = (character: string, facing: string, moving: boolean): string | null => {
    if (!moving) return null;
    const frames = characterAssets(character).walk[facing as Dir];
    if (!frames || frames.length === 0) return null;
    return frames[Math.floor(animClock * WALK_FPS) % frames.length] ?? null;
  };

  // networking
  const pendingReveals = new Set<string>();
  const net = new Net({
    onWelcome(seed) {
      if (world.seed !== seed) { world = new World(seed); } // adopt the shared world
    },
    onPeerJoin: p => { peers.join(p); setPeerCount(peers.map.size); },
    onPeerLeave: id => { peers.leave(id); setPeerCount(peers.map.size); },
    onPeerMove: (id, x, y, dir, moving) => peers.move(id, x, y, dir, moving),
    onPeerIdentity: (id, char, name) => peers.identity(id, char, name),
    onReveal: (key, kind, specimen, by) => {
      if (!grass.isRevealed(...(key.split(',').map(Number) as [number, number]))) {
        grass.set(...(key.split(',').map(Number) as [number, number]), kind === 'note' ? 'note' : (specimen ?? null));
      }
      // award only if it was our optimistic claim and we were first
      if (pendingReveals.has(key)) {
        pendingReveals.delete(key);
        if (by !== net.selfId && by !== '') {
          // someone beat us; no award (already applied optimistically — roll back not tracked for v1 simplicity)
        }
      }
    },
    onOpen: (key, taken, by) => {
      open.setOpen(...(key.split(',').map(Number) as [number, number]));
      if (taken && by !== net.selfId) { /* looted by another */ }
    },
  });

  // chest open / interact
  input.onAction = () => {
    startAudio();
    const [fdx, fdy] = facingVec(player.facing);
    const ctx2 = { tx: player.tx + fdx, ty: player.ty + fdy };
    const here = findChest(world, player.tx, player.ty) ?? findChest(world, ctx2.tx, ctx2.ty);
    if (!here) return;
    const key = tileKey(here.tx, here.ty);
    if (open.isOpen(here.tx, here.ty)) return;
    open.setOpen(here.tx, here.ty);
    net.open(key);
    // deterministic chest loot: 2-4 specimens
    const rng = mulberry32(xmur3(`chest|${world.seed}|${key}`)());
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) addSpecimen(1 + Math.floor(rng() * 7));
  };
  input.onToggleInventory = () => toggleInventory();
  input.onMute = () => { startAudio(); const m = toggleMute(); setMuted(m); };

  // game loop
  let raf = 0;
  let last = performance.now();
  let idleMs = 0;
  let lastThought = 0;
  const loop = (now: number) => {
    const dt = now - last; last = now;
    animClock += dt / 1000;
    if (!input.paused) clockMs += dt;

    if (!player.sliding && !input.paused) {
      const { dx, dy } = input.intent();
      const dir = vecToDir(dx, dy);
      if (dir && canStep(world, player.tx, player.ty, dx, dy)) {
        player.startSlide(player.tx + dx, player.ty + dy, dir);
        startAudio();
      }
    }

    const wasSliding = player.sliding;
    player.update(dt);
    if (wasSliding && !player.sliding) {
      // arrived on a tile
      net.move(player.tx * TILE, player.ty * TILE, dirIndex(player.facing), false);
      if (world.isGrass(player.tx, player.ty) && !grass.isRevealed(player.tx, player.ty)) {
        const key = tileKey(player.tx, player.ty);
        const result = rollReveal(world.seed, player.tx, player.ty);
        grass.set(player.tx, player.ty, result);
        if (typeof result === 'number') {
          pendingReveals.add(key); net.reveal(key, 'specimen', result); addSpecimen(result);
        } else if (result === 'note') {
          pendingReveals.add(key); net.reveal(key, 'note');
          const text = noteFor(player.tx, player.ty);
          addJournal({ id: key, text, day: dayNumber(clockMs) });
          showThought('a folded note. someone was here.');
        }
      }
    }

    // idle thoughts
    if (player.sliding || input.intent().dx || input.intent().dy) { idleMs = 0; }
    else idleMs += dt;
    if (idleMs > 12000 && now - lastThought > 6000 && Math.random() < 0.02) {
      showThought(pick(Math.random, THOUGHTS)); lastThought = now;
    }

    // day rollover
    const day = dayNumber(clockMs);
    if (day !== lastDay) { lastDay = day; showDayCard(pick(Math.random, DAY_LINES)(day)); }

    // audio ducking by phase
    updateDuck(clockMs);

    peers.update(dt);
    render(ctx, world, player, cam, { clockMs, grass, open, peers: peers.map, resolve });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // autosave
  const snapshot = (): SaveData => ({
    tx: player.tx, ty: player.ty, character: player.character,
    specimens: getHudSpecimens(), journal: getHudJournal(), clockMs, muted: isMuted(),
    revealed: [...grass.entries()], opened: [...open.keys()],
  });
  const saveTimer = setInterval(() => writeSave(snapshot()), 5000);
  const onHide = () => { if (document.visibilityState === 'hidden') writeSave(snapshot()); };
  addEventListener('visibilitychange', onHide);
  addEventListener('beforeunload', () => writeSave(snapshot()));

  return {
    input,
    savedCharacter: save?.character,
    hasSave: !!save,
    begin() {
      input.paused = false;
      identity = identity || voyagerName();
      // honor persisted mute (audio not yet started, so this just sets the flag for startAudio)
      if (save?.muted && !isMuted()) { setMuted(toggleMute()); }
      net.connect({ char: player.character, name: identity, x: player.tx * TILE, y: player.ty * TILE });
    },
    setCharacter(slug: string) {
      loadCharacter(slug);
      player.character = slug;
      hudSetCharacter(slug);
      loadImage(`/assets/characters/${slug}/rotations/${player.facing}.png`).catch(() => {});
      net.identity(slug, identity || voyagerName());
    },
    stop() {
      cancelAnimationFrame(raf);
      clearInterval(saveTimer);
      removeEventListener('visibilitychange', onHide);
    },
  };
}

// ---- helpers --------------------------------------------------------------------------------
function facingVec(d: Dir): [number, number] {
  const map: Record<Dir, [number, number]> = {
    south: [0, 1], 'south-east': [1, 1], east: [1, 0], 'north-east': [1, -1],
    north: [0, -1], 'north-west': [-1, -1], west: [-1, 0], 'south-west': [-1, 1],
  };
  return map[d];
}

function findChest(world: World, tx: number, ty: number) {
  return world.drawables().find(o => o.kind === 'chest' && o.tx === tx && o.ty === ty);
}

let duckPhase = '';
function updateDuck(clockMs: number) {
  const frac = ((clockMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS / CYCLE_MS;
  const phase = frac < 1 / 8 ? 'dawn' : frac < 5 / 8 ? 'day' : frac < 6 / 8 ? 'dusk' : 'night';
  if (phase === duckPhase) return;
  duckPhase = phase;
  setDuck(phase === 'night' ? 0.55 : phase === 'day' ? 1 : 0.8);
}

function getHudSpecimens(): Record<number, number> { return { ...hudState.specimens }; }
function getHudJournal() { return [...hudState.journal]; }
