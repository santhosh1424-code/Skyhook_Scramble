# Treasure Isle — Engineering & Milestone Plan

## Architecture Overview
- **`/shared`**: Deterministic seeded PRNG, 2 km × 2 km island heightmap & biome generator, landmark placement, clue/treasure seed solver, clothing catalogue schema & validator, shared game constants & protocol types.
- **`/client`**: Three.js + Vite + TypeScript client (`GLTFLoader` with `DRACOLoader`/`KTX2Loader`, chunked LOD terrain with splat-mapped PBR textures, realistic water, dynamic sky/day-night/weather, skinned humanoid rig + animation state machine + foot IK, modular clothing/wardrobe, post-processing, spatial Web Audio, full HUD/map/journal/mobile/gamepad).
- **`/server`**: Authoritative Node.js + `ws` server (6-char private rooms, 20 Hz tick, max 9 players, bot fill `[BOT]`, reconnect tokens, server-owned treasure/clues/digging/scoring, anti-cheat speed/distance checks, AOI filtering, WebRTC proximity voice signaling).
- **`/assets`**: Generated rigged humanoid & modular clothing `.glb` models + item catalogue JSON (with drop-in paths for Mixamo/Quaternius/Poly Haven replacements).
- **`/docs`**: Architecture, asset replacement guide, and deployment instructions.

---

## Milestones
1. **Milestone 1 — Terrain + Water + Sky**
   - Deterministic 2 km × 2 km (`2000m × 2000m`) heightmap (`shared/terrain.ts`) using multi-octave simplex/value noise, domain warping, island falloff, river/lagoon carving, volcano peak, swamp basin, and terraced cliffs.
   - Chunked terrain mesh with 3 LOD levels, frustum culling, splat-mapped PBR textures (sand, grass, dirt, rock, mud) with procedural normal/roughness maps.
   - Realistic ocean & lagoon water (animated dual-normal waves, depth tint, shoreline foam, underwater tint & swimming/wading transitions).
   - Atmospheric sky shader, moving sun, day/night cycle, directional soft shadows, distance fog, sunrise god-ray glow, occasional rain/storm weather.
   - Verify: `npm run build` + terrain height/biome deterministic unit test.

2. **Milestone 2 — Rigged Humanoid Character + Animation + Camera**
   - Binary GLB generator script producing rigged, UV-mapped humanoid base body GLBs (4 body types: Male Athletic, Female Athletic, Slim Scout, Stocky Buccaneer) + shared 22-bone skeleton (`assets/models/`), loaded via `GLTFLoader` + `DRACOLoader` + `KTX2Loader`.
   - Procedural/retargeted animation clip set & state machine with crossfade blending (`idle`, `walk`, `run`, `sprint`, `jump`, `fall`, `land`, `swim`, `wade`, `climb`, `dig`, `slash`, `carry`, `open_chest`, `victory`, 4 emotes, `hit`, `knockdown`, `getup`) + slope foot IK.
   - Movement controller (walk, run, sprint, jump, low-ledge climb, swim, wade) + third-person collision camera + optional first-person toggle (`V`).
   - Verify: `npm run build` + GLB skeleton/loading check.

3. **Milestone 3 — Vegetation + Landmarks + Wildlife**
   - Terrain-snapped instanced vegetation (curved palm trees, jungle ferns, bushes, swaying grass blades, boulders, driftwood, coconuts) with wind vertex animation and density scaling per quality preset.
   - Major seeded landmarks snapped cleanly to terrain: Port Village, 9 spread-out Player Ship Berths/Docks, Ruined Pirate Fort, Ancient Temple Ruins, Caves with flickering torches, Shipwrecks, Waterfalls, Volcano crater.
   - Ambient wildlife (circling seabirds, beach crabs, lagoon fish, jungle butterflies).
   - Verify: `npm run build` + landmark/snap validation.

4. **Milestone 4 — Modular Clothing & Customization System**
   - Data-driven `/assets/catalog.json` with 8 preset outfits and 3+ variations per slot (`hat`, `hair`, `faceItem`, `coat`, `shirt`, `pants`, `boots`, `belt`, `gloves`, `backItem`, `heldItem`), skin tone picker, facial hair, and color tints.
   - Runtime skinned-mesh attachment to the shared skeleton + PBR cloth/leather/metal normal maps + wetness & mud shader overlay that dries over time.
   - Live rotatable 3D preview in Lobby + in-game Wardrobe (`C` at ship or camp chests) + local persistence & server validation.
   - Verify: `npm run build`.

5. **Milestone 5 — Treasure Hunt, Clues, Digging & Pirate Combat**
   - Seeded hidden underground treasure (`X` spot never shown on map) + multi-stage clue chain (torn map pieces in caves/ruins/shipwrecks/camps, riddle notes, clue-pointing compass, carved X rocks).
   - Shovel digging mechanics (terrain dig mound + chest reveal + carry slowdown + ship/dock delivery win), plus Co-op vs Timer and Free Explore modes.
   - Non-gory pirate melee (cutlass swing, kick, shove, knockdown, chest steal).
   - Verify: `npm run build` + clue chain & dig distance test.

6. **Milestone 6 — Authoritative Multiplayer (9 Players + Bots + Voice Signaling)**
   - Rewritten `/server/index.js` reusing the core concepts from the old `server/index.js` while fixing all audited bugs (anti-cheat speed/NaN/bounds checks, server cooldowns, true `hrtime` tick, shared deterministic seed, server-owned clues/dig/chest/score, AOI filtering, `[BOT]` fill, reconnect tokens, WebRTC proximity voice relay).
   - Client prediction + ~100ms remote player interpolation + clothing catalogue sync.
   - Verify: `npm run build` + multi-client Node WebSocket integration test.

7. **Milestone 7 — UI, Audio, Mobile Touch, Post-Processing & Optimization**
   - Cinematic menu flyover, loading screen with progress, WebGL fallback, minimap + full fog-of-war map (`M`), compass, clue journal, inventory, objective tracker, scoreboard.
   - Spatial Web Audio (ocean, wind, birds, surface footsteps, shovel dig, chest creak, cutlass clash, procedural pirate shanty).
   - Upgraded `mobile.ts` touch controls + gamepad + accessibility (subtitles, remappable keys, colorblind markers, reduced motion).
   - Post-processing (`EffectComposer`, `SMAAPass`, `UnrealBloomPass`, color grading, optional `SSAOPass` on Ultra) + Quality presets (`Low`, `Medium`, `High`, `Ultra`) + `README.md` + `Dockerfile`.
   - Verify: `npm run build` + server integration test + browser verification.
