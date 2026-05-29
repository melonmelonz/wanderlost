// src/game/engine.ts
import { World, TILE, GroundType } from './world';
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
import { startAudio, toggleMute, setDuck, isMuted, footstep, chime } from './audio';
import { Particles } from './particles';
import { loadSave, writeSave, type SaveData } from './save';
import { resolveStart } from './spawn';
import {
  addSpecimen, addJournal, showDayCard, showInteract, setPeerCount, setMuted, setCharacter as hudSetCharacter,
  hydrateHud, toggleInventory, hudState,
} from './hud-bus';
import { DAY_LINES } from '../content/flavor-days';
import { noteFor } from '../content/flavor-notes';
import { examineFor } from '../content/flavor-examine';
import { pick, mulberry32, xmur3 } from './rng';
import { makeLogger, debugEnabled } from './debug';

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

  const log = makeLogger(debugEnabled());
  const save = loadSave();
  let world = new World(1337); // default seed; the shared seed from net `welcome` overrides
  log('engine-start', { seed: world.seed, spawn: world.spawn });

  const start = resolveStart(world, save); // ignore stale/out-of-bounds saved tiles
  const player = new Player(start.tx, start.ty, 'doug'); // Doug-only demo: ignore any saved character
  const input = new Input();
  input.attach(); // register keyboard listeners (held set is read every frame via intent())
  input.paused = true; // gated until character chosen / begin()
  const cam: Camera = { x: player.px + TILE / 2 - canvas.width / 2, y: player.py + TILE / 2 - canvas.height / 2 };

  const grass = new GrassState();
  const open = new OpenState();
  const peers = new Peers();
  const dust = new Particles();
  let stepCount = 0; // throttles footfalls to every other tile so walking doesn't machine-gun
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
      log('welcome', { seed });
      if (world.seed !== seed) { world = new World(seed); } // adopt the shared world
    },
    onPeerJoin: p => { log('peer-join'); peers.join(p); setPeerCount(peers.map.size); },
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

  // interact (space / E): loot an unopened chest, otherwise examine whatever prop we stand on or face
  input.onAction = () => {
    startAudio();
    const [fdx, fdy] = facingVec(player.facing);
    const ftx = player.tx + fdx, fty = player.ty + fdy;

    // unopened chest at our tile or the tile we face -> loot it
    const chest = findChest(world, player.tx, player.ty) ?? findChest(world, ftx, fty);
    if (chest && !open.isOpen(chest.tx, chest.ty)) {
      const key = tileKey(chest.tx, chest.ty);
      open.setOpen(chest.tx, chest.ty);
      net.open(key);
      // deterministic chest loot: 2-4 specimens
      const rng = mulberry32(xmur3(`chest|${world.seed}|${key}`)());
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) addSpecimen(1 + Math.floor(rng() * 7));
      showInteract(`You ease the lid open. ${n} specimen${n === 1 ? '' : 's'} inside. It creaks like it's glad to be useful.`);
      chime(7); // brighter ring for a find
      return;
    }

    // otherwise: examine whatever prop is on the tile we face, then the tile we stand on
    const prop = findProp(world, ftx, fty) ?? findProp(world, player.tx, player.ty);
    if (prop) { showInteract(examineFor(prop.kind, prop.tx, prop.ty)); chime(0); }
  };
  input.onToggleInventory = () => toggleInventory();
  input.onMute = () => { startAudio(); const m = toggleMute(); setMuted(m); };

  // game loop
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = now - last; last = now;
    animClock += dt / 1000;
    if (!input.paused) clockMs += dt;

    const wasSliding = player.sliding;
    player.update(dt);
    const justArrived = wasSliding && !player.sliding;
    if (justArrived) {
      // arrived on a tile
      log('arrive', { tx: player.tx, ty: player.ty });
      net.move(player.tx * TILE, player.ty * TILE, dirIndex(player.facing), false);
      // footfall: kick up ground-tinted dust and tick a soft step sound every other tile
      dust.spawn(player.tx * TILE + TILE / 2, player.ty * TILE + TILE - 4, dustColor(world.groundAt(player.tx, player.ty)));
      if ((stepCount++ & 1) === 0) footstep();
      if (world.isGrass(player.tx, player.ty) && !grass.isRevealed(player.tx, player.ty)) {
        const key = tileKey(player.tx, player.ty);
        const result = rollReveal(world.seed, player.tx, player.ty);
        log('reveal', { key, result });
        grass.set(player.tx, player.ty, result);
        if (typeof result === 'number') {
          pendingReveals.add(key); net.reveal(key, 'specimen', result); addSpecimen(result); chime(4);
        } else if (result === 'note') {
          pendingReveals.add(key); net.reveal(key, 'note');
          const text = noteFor(player.tx, player.ty);
          addJournal({ id: key, text, day: dayNumber(clockMs) });
        }
      }
    }

    // Begin or chain the next step AFTER updating, so a step that just finished rolls straight
    // into the next this same frame (consuming the leftover time). This removes the one-frame
    // dead stop at every tile boundary that read as movement jitter.
    if (!player.sliding && !input.paused) {
      const { dx, dy } = input.intent();
      const dir = vecToDir(dx, dy);
      if (dir && canStep(world, player.tx, player.ty, dx, dy)) {
        log('slide', { tx: player.tx + dx, ty: player.ty + dy, dir });
        player.startSlide(player.tx + dx, player.ty + dy, dir);
        startAudio();
        if (justArrived) { const carry = player.takeOvershoot(); if (carry > 0) player.update(carry); }
      } else if (dir) {
        log('blocked', { tx: player.tx + dx, ty: player.ty + dy });
      }
    }

    // day rollover
    const day = dayNumber(clockMs);
    if (day !== lastDay) { lastDay = day; showDayCard(pick(Math.random, DAY_LINES)(day)); }

    // audio ducking by phase
    updateDuck(clockMs);

    peers.update(dt);
    dust.update(dt);
    render(ctx, world, player, cam, { clockMs, grass, open, peers: peers.map, resolve, particles: dust });
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
      log('net-connect');
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

function findProp(world: World, tx: number, ty: number) {
  return world.drawables().find(o => o.tx === tx && o.ty === ty);
}

// Footstep dust tinted to the ground underfoot, so grass puffs green and barren kicks up rust.
function dustColor(g: GroundType): string {
  switch (g) {
    case GroundType.Grass:     return '150,170,90';
    case GroundType.RedBarren: return '170,90,60';
    case GroundType.StonePath: return '170,165,150';
    case GroundType.BoneBed:   return '200,195,170';
    case GroundType.Water:     return '120,180,210';
    case GroundType.Cliff:     return '120,120,130';
    default:                   return '120,95,70'; // soil
  }
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
