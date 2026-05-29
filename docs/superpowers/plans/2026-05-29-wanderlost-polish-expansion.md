# Wanderlost — Polish & Expansion (consolidated, do-everything)

> Doug-only single-player demo. Game loop is solid and deployed. This pass tackles ALL outstanding
> feedback at once — no phases. Then verify, deploy, push.

**Goal:** A bigger, livelier, more rewarding world that reads as intentional and animates visibly.

**Tech:** Bun + Vite + Preact + Canvas 2D. Authored finite map (`map-data.ts`), corner-Wang ground,
y-sorted prop renderer (`render.ts`). Build-time assets only.

---

## Outstanding feedback (all addressed here)

1. **Movement** — "movement is better but I don't like the bouncing; smooth it a tad more."
2. **Ambient animation** — "I still see no breadth/animation on grass, trees, etc."
3. **World size** — "first level still too sparse; need a bigger world for sure."
4. **Artifacts** — "make artifacts easier to pop up — I have yet to find one."

## Work items

### 1. Movement (`src/game/render.ts`)
- Remove the per-step sine hop entirely (player no longer bounces).
- Soften camera follow (`0.15 → 0.12`) for a calmer glide. Keep linear per-tile interpolation.

### 2. Visible ambient animation (`src/game/render.ts`)
- Grass: top-pinned wave (shear pivoted at the tile base) with a clearly visible amplitude, up from
  the barely-visible 1.5px shift.
- Trees: increase shear amplitude `0.03 → 0.07`, keep per-prop phase offset.
- Mushroom glow already added (cyan/violet additive pulse, brighter at night) — keep.

### 3. Bigger, denser, deliberate world (`src/game/map-data.ts`)
- Grow 64×64 → **128×128**. Spawn central (64,64), stone plaza hub, central signpost (reblocked).
- Four stone-path spokes (N/E/S/W) from the hub to a composed region each:
  - **North:** large grassland + two flanking groves framing a pond focal point.
  - **East:** red-barren wastes → ruin-field + crash-site, spaced out.
  - **South:** bone-bed flats → two ossuary clusters (chest inside) + statue landmark.
  - **West:** stone-path settlement → rest-stop (campfire), benches, signposts, bedroll.
- Mid-spoke detail clusters so the journey isn't empty soil.
- **Spawn apron:** grass right beside the plaza + an early chest, so collectibles appear immediately.
- `clearWalk` safety net keeps plaza + spokes walkable (rectangles contain no water).

### 4. Artifacts easier to find (`src/game/grass.ts`)
- Reveal odds: collectible `~12% → ~22%`, note `~1/800 → ~1/400`.
- Combined with the spawn grass apron + huge north field, specimens appear within a few steps.

### 5. Verify & ship
- Update `map-data.test.ts` (64 → 128).
- `bun test`, `bunx tsc --noEmit`, `bun run build` all clean.
- Deploy to Pages production (`--branch=master`), push branch + master, report URLs.

## Out of scope (unchanged)
- Character select / other characters; multiplayer (net dormant); new PixelLab asset generation.
