# Animation / asset decisions

Decision (2026-05-29): **download existing art, do not generate.** All four characters already
have complete walk animations in the PixelLab account, so `fetch-assets.mjs` downloads them
rather than spending generations. Nothing is fetched at runtime — everything lives in
`public/assets/` and is bundled into `dist/`.

## Characters (downloaded via PixelLab character zip → normalized)
| slug            | PixelLab id                          | rotations | walk (8dir x 6f) | special                    |
|-----------------|--------------------------------------|-----------|------------------|----------------------------|
| doug            | 5871ce77-b00c-4051-8868-ea0eb0ae5108 | yes       | yes (fallback)   | zero-g-float (8dir x 9f), death — from local mute-game; **canonical movement = zero-g-float** |
| crab-head-v2    | 19a81f05-f60c-4a7a-a582-194505d48a88 | yes       | yes              | —                          |
| green-alien-v2  | d9f23604-f47b-4c13-8802-30585cd70a20 | yes       | yes              | —                          |
| red-hair-v2     | e0e0dba8-2feb-45ce-9865-b934db108a11 | yes       | yes              | —                          |

## Tilesets / decoration
- soil (398d7604…) Wang, 16x16 tiles → image.png + metadata.json
- red-barren (df8064b8…) Wang, 32x32 tiles → image.png + metadata.json
- bone-overlay (e2b02fa7…) 16 standalone 32x32 decoration tiles (bones, mushrooms, debris, crystals, puddle, flowers)

## Environmental
- grass/grass-sway.gif, objects/campfire-flicker.gif (from mute-pixel)
- objects/mute/* and tilesets/mute/* (from local mute-game — chests etc.)

## Intentionally NOT generated (using fallbacks to stay lean)
- grass rustle on step → reuse grass-sway frames
- chest open → scale/tint the static chest sprite
- specimen sparkle → drawn procedurally on canvas
- Doug sit-by-fire → reuse Doug idle/zero-g-float
- ambient audio → **synthesized at runtime in Web Audio** (no audio file shipped)
