# wanderlost

A browser-based pixel-art walking sim. You are dropped onto an endless alien plain with two
suns and no particular reason to be there. You walk. You wade through tall grass and it gives up
small things — bone shards, glass tears, the occasional folded note from someone who walked here
before you. There is no score. There is no winning. There is only the next ridge.

It is quietly multiplayer: **one** world, shared by everyone, all the time. You will see other
wanderers drifting across the same plain. Whatever you find, they cannot — the grass only has so
much to give, and it remembers who got there first.

> *"Whoever you are: you are not the first, and the grass will let you pretend you are."*

---

## What's in here

- **Full-viewport canvas** — no chrome, no menus in your way; the window *is* the world.
- **8-directional grid movement** — Pokémon / Zelda: Minish Cap style tile-to-tile sliding.
- **Four characters** — Doug (lost his ship, drifts more than walks), Red, Vix, and Pott.
- **One persistent shared world** — a single global Cloudflare Durable Object; everyone, everywhere, together.
- **Day / night cycle** — an 8-minute loop with a starfield, dusk tint, and music that hushes at night.
- **Deterministic procedural terrain** — every client generates the identical world from a shared seed; the network only carries *who moved* and *what's been found*.
- **Found things persist** — your position, character, specimens, and journal survive a reload (localStorage); revealed grass and opened chests survive for everyone (server-side).
- **Touch-friendly** — an on-screen d-pad appears on phones.

## Stack

| Layer        | Tech                                                              |
|--------------|-------------------------------------------------------------------|
| Runtime / PM | [Bun](https://bun.sh)                                             |
| Frontend     | Vite + Preact + TypeScript (strict)                               |
| Rendering    | Hand-rolled Canvas 2D engine (chunked tiles, fixed-step loop)     |
| UI overlays  | Preact (HUD, inventory, character select) — the game loop is plain Canvas |
| Multiplayer  | Cloudflare Worker hosting a single global `World` Durable Object over WebSockets |
| Audio        | Web Audio API (one ambient loop, crossfade + night ducking)       |
| Art          | Pixel art generated with [PixelLab](https://pixellab.ai)          |
| Hosting      | Cloudflare Pages (client) + Workers (realtime)                    |

The client is authoritative over its own movement (predicted, no rollback needed for a walking
sim). The server is authoritative over what the world gives up: grass reveals and chest opens are
global and first-come-wins.

## Develop

```bash
bun install
bun run fetch-assets   # pull characters, tilesets, and audio into public/assets
bun run dev            # http://localhost:5173
```

Run the realtime Worker alongside it (separate shell):

```bash
cd worker
bun install
bunx wrangler dev      # ws://localhost:8787/ws
```

Point the client at the local Worker by creating `.env.local`:

```
VITE_WS_URL=ws://localhost:8787/ws
```

## Test

```bash
bun test
```

Pure logic (RNG, world gen, input, movement tweens, grass reveal, day/night, persistence) is
covered with `bun test`; DOM-dependent tests use happy-dom, registered in `test-setup.ts`.

## Deploy

```bash
# realtime Worker first, capture its wss:// URL
cd worker && bunx wrangler deploy

# then the client (set VITE_WS_URL to the deployed Worker)
cd .. && bun run deploy
```

## Controls

| Action            | Keys                          |
|-------------------|-------------------------------|
| Walk (8-way)      | `WASD` / arrow keys / d-pad   |
| Interact / open   | `E` / `Space`                 |
| Inventory         | `I` / `Tab`                   |
| Mute              | `M`                           |

---

Made as a vibe project. Go find something. Leave a note for whoever's next.
