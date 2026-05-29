// src/game/engine.ts
import { World, TILE, CHUNK } from './world';
import { Player } from './doug';
import { Input, vecToDir } from './input';
import { render, type Camera, type PeerView, type SpriteResolver } from './render';
import { characterAssets, characterSources, preloadAll, loadImage, loadWangTileset } from './assets';
import type { Dir } from './assets';

export interface Game {
  world: World;
  player: Player;
  input: Input;
  cam: Camera;
  setCharacter(slug: string): void;
  peers: Map<string, PeerView>;
  stop(): void;
}

const WALK_FPS = 10;

export function startEngine(canvas: HTMLCanvasElement, seed = 1337): Game {
  const ctx = canvas.getContext('2d')!;
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  addEventListener('resize', resize);

  const world = new World(seed);
  const player = new Player(0, 0, 'doug');
  const input = new Input();
  input.attach();
  const cam: Camera = { x: player.px + TILE / 2 - canvas.width / 2, y: player.py + TILE / 2 - canvas.height / 2 };
  const peers = new Map<string, PeerView>();

  // load ground tilesets + initial character art
  loadWangTileset('soil').catch(() => {});
  loadWangTileset('red-barren').catch(() => {});
  preloadAll([...Array.from({ length: 16 }, (_, i) => `/assets/tilesets/bone-overlay/tile_${i}.png`)]);
  let loaded = new Set<string>();
  const loadCharacter = (slug: string) => {
    if (loaded.has(slug)) return;
    loaded.add(slug);
    preloadAll(characterSources(slug));
  };
  loadCharacter('doug');

  // walk-frame animation resolver: advances frames while moving, holds frame 0 while idle.
  let animClock = 0;
  const resolve: SpriteResolver = (character, facing, moving) => {
    const a = characterAssets(character);
    const frames = a.walk[facing as Dir];
    if (!frames || frames.length === 0) return null;
    if (!moving) return null; // use static rotation when standing
    const i = Math.floor(animClock * WALK_FPS) % frames.length;
    return frames[i] ?? null;
  };

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = now - last; last = now;
    animClock += dt / 1000;
    if (!player.sliding) {
      const { dx, dy } = input.intent();
      const dir = vecToDir(dx, dy);
      if (dir) player.startSlide(player.tx + dx, player.ty + dy, dir);
    }
    player.update(dt);
    world.evictOutside(Math.floor(player.tx / CHUNK), Math.floor(player.ty / CHUNK), 3);
    render(ctx, world, player, cam, [...peers.values()], resolve);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    world, player, input, cam, peers,
    setCharacter(slug: string) {
      loadCharacter(slug);
      player.character = slug;
      // ensure facing rotation exists
      loadImage(`/assets/characters/${slug}/rotations/${player.facing}.png`).catch(() => {});
    },
    stop() { cancelAnimationFrame(raf); },
  };
}
