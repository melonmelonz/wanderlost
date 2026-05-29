# wanderlost — design spec

**Date:** 2026-05-29
**Status:** Draft, awaiting user review
**Repo (planned):** `melonmelonz/wanderlost`
**Local path (planned):** `~/dev/wanderlost`
**Deploy targets:** Cloudflare Pages (frontend) + Cloudflare Worker with Durable Object (realtime)
**Budget:** ~10 hours, single session

## 1. Concept

A full-viewport pixel-art walking sim. You play one of four castaways — Doug, Red Hair V2, Green Alien V2, or Crab Head V2 — wandering an infinite alien plain. Walk through tall grass to disturb fossils and small glowing things. Open the occasional treasure chest. Sit by a campfire when you need to. Other voyagers are walking too. You can see them, but you don't talk. Everyone shares the world.

No goal. No combat. No score beyond "specimens collected." The point is the wander.

The reference vibe: Pokemon Crystal grass tiles meets Minish Cap overland meets the empty parts of A Short Hike. Aesthetic backbone is lifted from the existing `mute.` showcase site: black background, gold accents, cyan rare-event flashes, animated starfield, Space Mono.

## 2. Tone & writing

Melancholic and grim, with levity that lands sideways. Never quippy, never Marvel. The world is empty in a way that becomes funny if you sit with it.

Concrete places the tone shows up:

- **Specimen flavor names.** The 7 collectible sprites get names from a pool of ~30 entries. Examples:
  - "Tooth of someone who mattered once."
  - "Vertebra with visible regret."
  - "Calcified hope."
  - "A small bright thing. Probably worth something to someone."
  - "Bone fragment. Maybe yours, eventually."
  - "A jewel. Or a tear. Hard to tell out here."
  - "A coin. The face is worn off. So is yours, a little."
- **Doug's idle thoughts.** When stationary >12s (and *not* sitting by a campfire — sitting suppresses thoughts so the moment stays clean), ~25% chance to surface a brief thought bubble (1.5s, then fades). Pool of ~40 entries. Examples:
  - "Did I leave the airlock open."
  - "If a tree falls on an alien planet..."
  - "The stars look the same here. Probably aren't."
  - "I should have called her back."
  - "Hungry. Always."
- **Day-change title cards.** When the day/night cycle ticks over to a new day (real-time, every 8 minutes), a sparse one-liner fades in at top-center for 3s. Pool of ~20 entries. Examples:
  - "Day 4. The light came back. It always does. So far."
  - "Day 17. Today, the same as yesterday."
  - "Day 31. He has stopped counting, but the counter has not."
- **The "days alone" counter** in the journal tab increments daily and is never reset by encountering other players. Doug, in-fiction, does not register them. The joke lands quietly: the screen shows three other voyagers and a counter that says `days alone: 47`.
- **Voyager name prefixes** are drawn from `["Voyager","Pilgrim","Castaway","Hermit","Drifter","Stowaway","Sleepwalker"]` + 4-hex suffix. Other players' names hover on cursor-over only.
- **Rare event: the folded note.** ~1 in 800 grass tiles, instead of a collectible, reveals a "folded note." Pool of ~15 short diary-fragment entries from previous voyagers. Adds to a separate journal section, not to specimen count.

The tone is the product. Spend writing time on this.

## 3. Mechanics

### 3.1 Movement

- 8-directional, grid-locked. Tile size 32px. Doug sprite 48x48, anchored bottom-center, overhangs allowed.
- Cardinal slide: 140ms. Diagonal slide: ~198ms (√2 ratio) so speed feels constant.
- Input buffered during slide so holding a key feels continuous.
- Sprite state: static rotation when idle, animated cycle when sliding. **Doug uses `zero-g-float-{dir}.gif` for all 8 directions** (low-grav float, his canonical movement). V2 characters use generated walk cycles. If a V2 walk hasn't been generated yet at runtime, fall back to that character's idle rotation (no anim, just slides).
- Per memory `feedback_pwg_ai_caution`: arrival-time off-by-one matters for tile-locked motion; arrival happens at end of slide tween, not start.

### 3.2 Grass interaction

- When player arrives at a grass tile, send `{t:"reveal", tx, ty}` to server. Server is authoritative.
- Server checks `reveals` map. If never revealed: roll PRNG seeded by `(tx, ty, worldSeed)`. ~12% chance of a collectible (one of 7 types weighted), ~1% rare-find (cyan flash), <0.2% folded-note. Otherwise null.
- Server records result in DO storage, broadcasts `{t:"reveal", tx, ty, collectible|null, by:clientId}` to all clients.
- Client receiving its own reveal with `collectible != null`: spawn pickup sprite, arc into HUD counter, +1 to local specimen tally for that type.
- Client receiving someone else's reveal: animate grass-rustle on the tile, set tile opacity to "searched" (60%). No counter change.
- Re-stepping a searched tile: no-op (server returns nothing because it's already in `reveals`).

### 3.3 Chests

- Chests spawn deterministically: PRNG seeded by chunk coords picks 0 or 1 chest per chunk at probability ~0.4. Variant is one of `treasure-chest-1..7`.
- **UX note:** grass auto-interacts on step (Pokemon-style), chests require a key press. The asymmetry is intentional — chests feel like a chosen ritual, grass is just walking.
- On step-adjacent + facing-toward + action key (`E` or `Space`): send `{t:"open", tx, ty}`.
- Server checks `opens` set. If new: drops 2-4 collectibles. Broadcast.
- Open animation runs locally on receipt. Searched chests stay "open" visually.

### 3.4 Day/night cycle

- 8-minute full cycle, 4 phases: dawn (0-1min), day (1-5min), dusk (5-6min), night (6-8min).
- Client-side and per-user (each player has their own time-of-day). Reads more like "personal vibe" than synced rave.
- Implemented as a tinted overlay over the world canvas, before HUD:
  - dawn: warm orange #d4a437 at 12% alpha
  - day: clear
  - dusk: magenta #b04280 at 18% alpha
  - night: deep indigo #0a0a30 at 45% alpha
- Starfield fades in dusk→night, out night→dawn.
- Campfires emit a radial gold light that's invisible at noon, full at midnight.
- Day-change title card fires on dawn-start.
- "days alone" counter increments on dawn-start.

### 3.5 Campfires

- Spawn rarely (~1 per 10 chunks). Always animate (existing pixellab campfire animation, fall back to a 4-frame loop if missing).
- If Doug stands still within 1 tile of a campfire for 5s: trigger "sit by fire" pose. Camera eases slightly closer. Music ducks 30%. Other players can see this pose.
- Move to break out.

### 3.6 Inventory & journal overlay

Open with `I` or `Tab`. Pauses local time-of-day clock and Doug's controls (other players keep moving in the background, slightly dimmed). Three tabs:

1. **specimens** — grid of 7 collectible icons with counts; greyed if 0. Each has its flavor name on hover.
2. **journal** — five sparse stats: `days alone`, `distance walked`, `chests opened`, `specimens collected`, `current biome`. Plus the running list of folded-note fragments found. World seed displayed with copy button.
3. **settings** — music volume, day/night speed slider, character swap, voyager rename, "new world" (confirm modal — wipes localStorage, does NOT reset shared world).

Style: black backdrop blur, thin cyan border, Space Mono, gold section headers. Matches the `mute.` site visual language exactly.

### 3.7 Persistence

**Durable Object storage (global, shared):**
- `worldSeed: number` — fixed forever from first init
- `reveals: Map<"tx,ty", collectibleType | "note" | null>` — sparse
- `opens: Set<"tx,ty">`

**localStorage (per-browser, `wanderlost:v1`):**
- `clientId: UUID` — stable identity
- `name: string`, `character: "doug"|"red-hair-v2"|"green-alien-v2"|"crab-head-v2"`
- `x, y, facing` — last position, for reload-where-you-left
- `specimensByType: Record<1..7, number>` — local tally
- `notesFound: string[]` — note IDs collected
- `distanceWalked: number` (tiles)
- `daysAlone: number`, `cyclePhaseMs: number` (0 to 480000, where 480000ms = full 8min cycle) — time of day persistence
- `chestsOpenedLocal: number`
- `audioMuted: boolean`, `audioVolume: number`
- `dayNightSpeedMult: number` (0.5x to 2x)

Save every 5s + on `beforeunload`. Versioned key so schema bumps invalidate cleanly.

## 4. Multiplayer architecture

### 4.1 Cloudflare layout

- **Pages project** `wanderlost` — static frontend at `wanderlost.pages.dev`. Direct `wrangler pages deploy dist` per memory `feedback_cf_pages_direct_deploy`.
- **Worker** `wanderlost-realtime` — sibling, deployed separately via `wrangler deploy` from `worker/`. Hosts the `World` Durable Object class. Per memory `feedback_cf_pages_durable_objects`: Pages cannot declare DOs inline; sibling Worker pattern is required.
- Pages config (`wrangler.toml` or Dashboard binding) declares the DO binding via `script_name = "wanderlost-realtime"`, `class_name = "World"`.
- Per memory `feedback_cf_pages_commit_msg`: keep deploy commit messages ASCII-only.

### 4.2 WebSocket protocol

Endpoint: `wss://wanderlost-realtime.<account>.workers.dev/ws` (or proxied through Pages — decision: direct, simpler).

Client → server:
- `{t:"join", clientId, name, character}` on connect
- `{t:"move", x, y, facing}` throttled 10Hz max
- `{t:"reveal", tx, ty}` when stepping on grass tile
- `{t:"open", tx, ty}` when opening chest
- `{t:"identity", name, character}` when renaming or swapping character
- `{t:"ping"}` 30s heartbeat

Server → client:
- `{t:"welcome", worldSeed, you:{clientId}, players:[...], reveals:[...], opens:[...]}` on join. v1 sends the full sparse maps in one message. See §4.4 for sizing rationale and v1.1 windowing path.
- `{t:"presence", players:[...]}` on join/leave/identity-change
- `{t:"move", clientId, x, y, facing}` rebroadcast (excluding sender)
- `{t:"reveal", tx, ty, collectible|null|"note", by:clientId}`
- `{t:"open", tx, ty, by:clientId}`
- `{t:"pong"}`

### 4.3 Authoritative state

In-memory in DO instance:
- `players: Map<clientId, {ws, name, character, x, y, facing, lastSeen}>`

Persistent in DO storage:
- `worldSeed`
- `reveals` (sparse)
- `opens`

### 4.4 Latency model

- Client-side prediction: Doug moves immediately on keypress. No server round-trip needed for movement.
- Reveal is server-authoritative — local grass tile shows "rustling" state while waiting; client sees its own reveal result via the broadcast.
- Other players interpolate over 100ms toward last received `(x, y)`. No prediction for peers.
- **World state on join:** server sends the full `reveals` map + `opens` set in the welcome message. Sparse maps remain small enough at expected scale (low hundreds of voyagers, thousands of reveals over time). If the map grows past 10k entries we add windowing in v1.1; for v1 it's a flat snapshot.

### 4.5 Client-server world rendering split

To keep the wire payload small, the client and server share the same `worldSeed` and PRNG. From that, the client generates **everything visual**: tile placement, grass scatter, chest spawn locations, tree placement, biome blending. The server only sends *state deltas*: which grass tiles have been searched, which chests have been opened, what was found.

This means a fresh client on a stable network sees the same world layout as everyone else, instantly, with no per-tile data transferred. The server is small and authoritative on the things that matter (who found what, in what order).

### 4.6 Resolution rules

- Grass reveal is **global**: first-to-step gets the collectible. Others see "searched." Encourages exploration further out.
- Chest opens **global**: first-to-open wins; others see it open.
- No conflict cases at the protocol level — server is authoritative on reveal/open ordering.

## 5. World generation

### 5.1 Chunks & seeding

- Chunk = 16×16 tiles. Chunk key = `(cx, cy)`. PRNG = mulberry32, seeded by `xmur3(worldSeed + "|" + cx + "|" + cy)`.
- Active set = chunks in a 5×5 window around Doug's chunk. Evict outside.
- Determinism: same seed + same chunk coords → same grass placement, same chests, same biome blend. So revisiting an area looks identical (except for shared reveals).

### 5.2 Biomes & terrain blending

Two base biomes blended via two-octave value noise on chunk coords, with a third "ossuary" overlay applied on top of either base:

- **Soil** (default, ~60%) — pixellab tileset `398d7604-a3b6-4a60-aec9-6189893b9466` (`dark alien soil bare ground`)
- **Red barren** (~40%) — pixellab tileset `df8064b8-65cc-47a7-87f4-086a6273d857` (`dark barren alien red-orange rocky terrain`)
- **Ossuary patches** — overlay only, ~15% of all tiles. Renders as the bone-fragment tile `e2b02fa7-12bc-46b7-a128-a80c81932f3d` (tiles_pro, 32px, 16var) drawn *on top of* whichever base biome the tile belongs to. No Wang chaining for the overlay — direct tile replacement.

Soft transitions between the two base biomes via chainable Wang format (`base_tile_id` chaining of soil → red-barren). We fetch both Wang tilesets via pixellab API and download PNG + JSON.

Ossuary patches: higher grass density (+50%), higher folded-note probability (+3x), slight desaturation in the day/night tint pass.

Fallback if chained Wang doesn't work cleanly: render the two biomes side-by-side with a 1-tile alpha-gradient mask along boundary, computed in canvas at draw time. Uglier but ships.

### 5.3 Grass placement

Per chunk, Poisson-disk-ish scatter (or just hashed-random with min-distance check) targeting 10-15% tile coverage. Ossuary biome: 18-22%. Each grass tile uses one of the alien-grass sprite variants (already on disk as `tileset-alien-grass.png` — needs slicing).

### 5.4 Object placement

Per chunk, very sparse:
- Chest: 0.4 probability, random tile, biome-weighted variant
- Campfire: 0.1 probability
- Alien tree: 0.5 probability, 1-3 trees if rolled
- Ruin archway: 0.05 probability
- Antenna tower: 0.02 probability
- Crashed ship: 0.01 probability
- Cyan pod: 0.05 probability
- Data terminal: 0.03 probability
- Jellyfish (floating, decorative): 0.05 probability, in ossuary biome only

All placements deterministic from chunk seed → revisits show the same world.

## 6. Asset inventory

### 6.1 Already on disk (`~/dev/mute-game/assets/`, local)

- **Doug character:** spritesheet, 8 static rotations (`rotations/*.png`), 15 animated GIFs (`gifs/death-*.gif`, `gifs/zero-g-float-*.gif`), nested `animations/death/{dir}/` + `animations/zero-g-float/{dir}/` frame folders
- **Tilesets (single-image sheets):** `alien-grass.png`, `red-wasteland.png`, `station-interior.png`, `void-cliff.png`, plus `outerworld/tilesets/red-wasteland-cyan-veins.png`, `void-cliff-redgrass.png`
- **Objects:** 4 alien tree variants, 7 chests, 7 collectibles, 4 jellyfish, 3 cyan pods, 2 planets, 2 ruin archways, 2 crashed ships, 5 data terminals, antenna tower, iso-obelisk, iso-crashed-hull
- **Concept art:** `concept/main-cast-concept.png`, `concept/space_traveler_concept.png` (reference for character art direction)

### 6.2 Canonical character + animation set

**Doug — canonical source:** "Doug — 8 Directions" (static rotations) + "Generated Animations" (death + zero-g-float, 8 dirs each). Both already on local disk at `~/dev/mute-game/assets/space-traveler/`. **Doug does not get a walk cycle.** His movement uses `zero-g-float-{dir}.gif` — the floaty low-grav animation reads as a tonal feature: Doug is the spaceman, he floats while the others walk. (The "Original Doug Animations" set with cardinal walks is non-canonical; ignored.)

**Crab Head V2, Green Alien V2, Red Hair V2 — canonical source:** "Characters V2 (NEW)" section on the live mute showcase site. 24 PNG sprites total, 3 characters × 8 directions. Generated with Doug as style reference so cohesion is built-in. NOT yet on local disk — fetch via `curl`:
- `https://mute-pixel.pages.dev/assets/display/crab-head-v2-{south,south-east,east,north-east,north,north-west,west,south-west}.png`
- `https://mute-pixel.pages.dev/assets/display/green-alien-v2-{dir}.png`
- `https://mute-pixel.pages.dev/assets/display/red-hair-v2-{dir}.png`

**Animated environmental GIFs from "Generated Animations" — canonical:**
- `https://mute-pixel.pages.dev/assets/gifs/campfire-flicker.gif`
- `https://mute-pixel.pages.dev/assets/gifs/grass-sway.gif`

**Save-point + campfire variants from the "Save Points & Campfires" showcase section:** `…/assets/display/iso-campfire.png` and the 3 `campfire-save-{hash}.png` variants. We use these as decorative placement for the campfire object alongside the animated flicker GIF; pick 1-2 for v1.

**12 "game-ready" Wang tilesets** are listed on the showcase site (filenames not enumerated yet — implementation step is to re-fetch and pick the alien-soil / red-barren / bone-fragment ones if they exist there; falls back to pulling from pixellab directly per §6.3).

Source all of these by `curl`-ing into `wanderlost/public/assets/...` at project setup. Document attribution in `public/assets/CREDITS.md`.

### 6.3 Pulling from pixellab into the new repo (fills the gaps)

| Asset | Pixellab ID / source | Notes |
|---|---|---|
| Bone fragments overlay tile | `e2b02fa7-12bc-46b7-a128-a80c81932f3d` | tiles_pro, 32px, 16var. Used as ossuary overlay (§5.2). |
| Soil Wang tileset | `398d7604-a3b6-4a60-aec9-6189893b9466` | chainable topdown, base biome |
| Red-barren Wang tileset | `df8064b8-65cc-47a7-87f4-086a6273d857` | chainable topdown, secondary biome |

Wang tilesets export as PNG + JSON via `/mcp/topdown-tilesets/{id}/image` and `/metadata`. (We skip pixellab character pulls — the V2 set from §6.2 supersedes the older 16-character roster in pixellab's `list_characters`.)

### 6.4 Animations to generate via pixellab (in priority order)

V2 character sprites are static rotations only. Doug already has 8-dir zero-g-float (his canonical movement). So generation work is focused on the V2 trio + supporting effects:

1. **V2 character walk cycles** for Crab Head V2, Green Alien V2, Red Hair V2 — 8 dirs × 4-6 frames each. Use V2 static rotations as `animate_character` reference. Highest priority.
2. **Grass rustle** — distinct trigger anim, separate from `grass-sway.gif` idle loop. ~6 frames. `animate_object` on the existing grass sway as reference.
3. **Treasure chest open** — 6-8 frames. `animate_object` on one of the chest PNGs from local `~/dev/mute-game/assets/objects/treasure-chest-*.png`.
4. **Specimen sparkle** on pickup. Small particle, 4-6 frames.
5. **Doug "sit by fire" idle pose** — static, 1 frame. Other 3 characters skip the sit pose for v1 (they stand still by the fire using their idle sprite).

Already-good-enough assets (skip generation, use as-is):
- Doug movement: `zero-g-float-{8dir}.gif` (local disk)
- Doug death (easter egg / future use): `death-{7dir}.gif` (local disk)
- Campfire: `campfire-flicker.gif` (curl from mute-pixel)
- Grass idle sway: `grass-sway.gif` (curl from mute-pixel)

Generation runs in parallel with implementation; if any V2 walk cycle isn't done by deploy, that character falls back to zero-g-float-style placeholder animation borrowed from Doug (visually less right, but ships).

### 6.5 Audio

- 1× CC0/CC-BY ambient pad loop, ~2-4 minutes. Source from freesound.org (pre-filtered for CC0). Document license in `public/assets/audio/CREDITS.md`.

## 7. Tech stack

- **Build:** Vite, TypeScript strict
- **Frontend framework:** Preact (satisfies the "react requirement" with a tiny footprint; HUD/inventory only — game loop is plain Canvas)
- **Game:** Canvas 2D, no game framework. Hand-rolled chunk renderer, sprite atlas, RAF loop with fixed-step physics-ish updates.
- **Worker runtime:** Cloudflare Workers + Durable Objects. TypeScript. `wrangler` for deploy. Hibernation API for WebSockets to keep DO costs low.
- **Audio:** Web Audio API (volume, crossfade, mute)
- **Persistence client:** localStorage with versioned key

No state library (Preact context for HUD is enough). No bundler tricks. No SSR.

## 8. Repo layout

```
wanderlost/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml                  (Pages project, DO binding)
├── public/
│   └── assets/
│       ├── characters/
│       │   ├── doug/              (8 rotations + 4 cardinal walks + 4 generated diagonals + sit pose)
│       │   ├── red-hair-v2/       (8 rotations + generated 8 walk dirs)
│       │   ├── green-alien-v2/
│       │   └── crab-head-v2/
│       ├── tilesets/              (2 Wang tilesets + bone-fragment overlay tile, PNG + JSON)
│       ├── grass/                 (grass-sway.gif idle + generated rustle frames)
│       ├── objects/               (chests, collectibles, trees, ruins, campfire-flicker.gif, save-beacons)
│       ├── audio/
│       │   ├── ambient.ogg
│       │   └── CREDITS.md
│       └── CREDITS.md             (full attribution for sourced + pixellab-generated assets)
├── src/
│   ├── main.tsx                   (Preact mount; root component)
│   ├── App.tsx                    (overlay layout, character-select gate)
│   ├── HUD.tsx                    (specimens counter, thought bubble, day-title)
│   ├── Inventory.tsx              (3-tab overlay)
│   ├── CharacterSelect.tsx        (first-visit modal)
│   ├── style.css                  (full-viewport, starfield, pixelated)
│   ├── content/
│   │   ├── flavor-specimens.ts    (~30 specimen flavor names)
│   │   ├── flavor-thoughts.ts     (~40 Doug idle thoughts)
│   │   ├── flavor-days.ts         (~20 day-change one-liners)
│   │   └── flavor-notes.ts        (~15 folded-note diary fragments)
│   └── game/
│       ├── engine.ts              (RAF loop, fixed-step update, render)
│       ├── input.ts               (WASD/arrows/touch dpad, buffered)
│       ├── render.ts              (camera, draw order, y-sort)
│       ├── assets.ts              (image preloader, sprite atlas, slicing)
│       ├── rng.ts                 (mulberry32 + xmur3)
│       ├── world.ts               (chunked gen, biome noise, eviction)
│       ├── doug.ts                (local player state, 8-dir slide tween, anim selector)
│       ├── peers.ts               (other-player tracking + interpolation)
│       ├── grass.ts               (interaction, reveal queue, opacity state)
│       ├── objects.ts             (chests, campfires, trees, ruins placement + draw)
│       ├── daynight.ts            (cycle clock, tint overlay, starfield, day-card)
│       ├── audio.ts               (Web Audio, loop, volume, mute, duck for fire)
│       ├── save.ts                (versioned localStorage snapshot, autosave)
│       └── net.ts                 (WebSocket client, predict/reconcile, reconnect)
└── worker/
    ├── wrangler.toml
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts               (fetch handler, WS upgrade, route to DO)
        └── world.ts               (`World` DO class, broadcast, storage)
```

## 9. Deploy

Two Cloudflare deploys, both direct (no Git provider):

1. From repo root: `pnpm build && pnpm exec wrangler pages deploy dist --project-name=wanderlost`
2. From `worker/`: `pnpm exec wrangler deploy`

Pages binds the DO via Dashboard binding or `wrangler.toml`:
```toml
[[durable_objects.bindings]]
name = "WORLD"
class_name = "World"
script_name = "wanderlost-realtime"
```

Per memory `feedback_cf_pages_commit_msg`: ASCII-only commit messages. Per memory `feedback_goolz_deploy_target_dirs`: nothing target-dir-shaped to stash here, but watch the deploy bundle size.

Per memory `feedback_never_push_upstream`: this is a new Penn-owned repo, `git remote -v` will be `melonmelonz/wanderlost` — safe to push.

## 10. v1 explicit cuts

To stay in 10-hour budget:

- No chat, no emotes, no auth
- No anti-cheat
- No mobile polish beyond a basic touch dpad
- No music beyond one ambient track
- No achievements
- No per-server-restart resets (world is forever)
- No friends list / per-user persistence beyond localStorage
- No procedural quests, NPCs, or combat

## 11. Risk register

- **Pixellab generation latency.** Walk cycles for 4 characters may not all complete in session. Mitigation: fallback to zero-g-float GIFs and static rotations; walk cycle is a polish add, not a blocker.
- **Durable Object cold start under burst connect.** Realistic load is a handful of concurrent voyagers. Hibernation API keeps things cheap. Not a v1 risk.
- **localStorage divergence from DO.** If a client claims specimens it didn't earn, no one notices because counts are display-only. Acceptable for vibe project.
- **WebSocket reconnect storms.** Add exponential backoff in `net.ts` from the start (1s → 2s → 4s → max 30s). Cheap to do right.
- **Pixellab tilesets not actually chainable in a useful way for our biome blend.** Mitigation: v1 falls back to single tileset with edge-blending done in canvas (alpha gradient masks at biome boundaries) — uglier but ships.

## 12. Open questions

These are resolved-as-defaults but flagged so the user can override during review:

- **Spec file location:** lives at `~/docs/superpowers/specs/2026-05-29-wanderlost-design.md` per existing pattern (matches `2026-05-15-peek-game-design.md` neighbor). Will be copied into the new repo at `docs/superpowers/specs/` once it exists.
- **Worker subdomain:** default `wanderlost-realtime.<account>.workers.dev`, no custom domain needed for v1.
- **Package manager:** assumed `pnpm` to match other Penn projects. Easy swap to `npm`/`bun` if preferred.
- **Repo name:** `wanderlost`. Final?
- **First chest unlock UX:** v1 just opens on E/Space when adjacent + facing. Should the very first chest be discoverable (with a hint) or pure discovery? Default: pure discovery, no tutorial.
