# Wanderlost — Polish & Expansion Plan

> Doug-only single-player demo. Game loop is now solid and deployed. This plan tackles the
> remaining feedback: ambient life, a bigger/more-deliberate world, and travel in every direction.

**Goal:** Turn the working one-screen loop into a living, explorable world that feels intentional.

**Tech:** Bun + Vite + Preact + Canvas 2D. Authored finite map (`map-data.ts`), corner-Wang ground,
y-sorted prop renderer (`render.ts`). Build-time assets only.

---

## Status of feedback

**Shipped already:** movement fix (stale-save spawn), smooth linear movement + per-step bounce,
Doug-only boot, visible mute toggle, smooth day/night, removed fourth-wall "thought" popups,
default-on logging, readable HUD.

**This plan covers what's left:**
- C. Ambient animation: grass sway (visible), tree sway, glowing mushrooms — "subtle animations."
- A. WAY more world; explorable in every direction (not one single screen).
- B. Fix "haphazard" placement — deliberate, readable composition.
- D. Doug walk feel — bounce is in; tune amplitude/frame timing, revisit "Original Doug Walks (7)" only if needed.

---

## Phase 1 — Ambient animation (procedural, no new assets)

Procedural beats GIFs here: deterministic, controllable, cheap, and not reliant on detached-GIF
decoding (which is why grass "barely" moves now).

### Task 1.1: Per-prop sway for grass & trees
- **File:** `src/game/render.ts`
- A small `swayOffset(seed, timeMs)` helper: `Math.sin(timeMs/700 + seed) * amp`. Phase varies per
  tile/prop (seed from tx,ty) so the field ripples instead of moving in unison.
- Apply a horizontal skew to the top of grass-overlay tiles and tree sprites (translate top edge,
  pivot at base) so they appear to bend in a breeze. Amplitude: grass ~1.5px, trees ~2px.
- Drive from a continuously-advancing clock (pass `animMs` into `RenderCtx`, sourced from engine
  `animClock`), independent of the day clock.

### Task 1.2: Glowing mushrooms
- **File:** `src/game/render.ts`
- Reuse the additive radial-glow technique from the campfire pass, but small + cyan/violet, and
  **always on** (gently pulsing via sine), strongest at night. Scan `world.drawables()` for
  `kind === 'mushroom'`, draw a ~22px glow with `0.25 + 0.1*sin` alpha, scaled by `0.4 + 0.6*night`.

### Task 1.3: Tune & verify
- Hand-tune amplitudes/periods so it's "subtle." Confirm 60fps (glow passes are cheap; sway is a
  transform per visible prop).

## Phase 2 — Bigger, deliberate world

### Task 2.1: Grow the map and open the directions
- **File:** `src/game/map-data.ts`
- Enlarge from 64×64 to ~96×96 (still finite, still cliff+water belt). Spawn stays central.
- Carve four clear "spokes" of walkable terrain (N/E/S/W) off the spawn hub so every direction
  leads somewhere — the player should always have a place to go.

### Task 2.2: Deliberate regions (fix "haphazard")
- Replace scattered standalone props with **composed regions** placed along the spokes, each with a
  coherent palette and a landmark:
  - North: grassland + grove cluster (trees, mushrooms, flowers) → a pond.
  - East: red-barren wastes → ruin-field + crash-site (existing scenes, spaced out).
  - South: bone-bed flats → ossuary landmark + chest.
  - West: stone-path settlement → rest-stop (campfire), benches, signposts.
- Rule: props read as arrangements (rows, clusters, framing a focal point), never single random
  drops on open ground. Keep density moderate; negative space is good.

### Task 2.3: Spawn-hub readability
- A small stone-path plaza at spawn with a central signpost, so the player orients immediately.

## Phase 3 — Verify & ship
- `bun test`, `bunx tsc --noEmit`, `bun run build` all clean.
- Manual loop trace: walk each spoke to its landmark, confirm collision + reveals + chest.
- Deploy to Pages (production branch), push branch + master, report URLs.

---

## Out of scope (deferred, per "Doug-only for now")
- Character select / other characters
- Multiplayer (net stays dormant — no `VITE_WS_URL`)
- New PixelLab asset generation unless an arrangement truly needs a prop we lack
