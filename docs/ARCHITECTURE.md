# Treasure Island — Architecture Guide

## Directory Layout
- `/shared`: Pure TypeScript code shared by client and server:
  - `prng.ts`: Mulberry32 PRNG, 2D value noise, FBM, ridged noise.
  - `constants.ts`: World bounds (2000m × 2000m), chunk sizes, movement speeds, quality presets (`Auto`/`Low`/`Medium`/`High`/`Ultra`), body types, skin tones, loadout types.
  - `terrain.ts`: Deterministic `IslandTerrainData(seed)` generating a 513×513 bilinear `heightGrid` and `riverGrid` for O(1) runtime sampling, domain warping, erosion-like smoothing, volcano caldera, lagoon, swamp, cliff slopes, splat weights `[sand, grass, dirt, rock, mud]`, and 22 seeded landmarks (9 ship berths).
  - `spatialGrid.ts`: `SpatialCollisionGrid` hash grid for O(1) tree, boulder, and landmark XZ collision checks.
  - `protocol.ts`: Compact binary `ArrayBuffer`/`DataView` packet encoders & decoders (`PKT_INPUT = 0x01`, `PKT_SNAPSHOT = 0x02`, `PKT_CORRECT_POS = 0x03`).
  - `treasure.ts`: Deterministic 4-stage clue chain & buried treasure coordinate generator.
  - `catalog.ts`: Loads `/assets/catalog.json` and exposes `validateLoadout()`.
- `/client`: Vite + Three.js + TypeScript browser app:
  - `src/workers/terrainWorker.ts`: Web Worker generating terrain grids off the main thread and transferring `Float32Array` buffers zero-copy.
  - `src/assets/assetLoader.ts`: `GLTFLoader` + `DRACOLoader` + `KTX2Loader` loader & cache.
  - `src/world/`: `pbrTextures.ts` (procedural diffuse/normal + terrain `detailMap`), `terrainMesh.ts` (progressive chunk streaming + 256 LOD chunks + vertex-baked AO + wet shoreline sand), `waterAndSky.ts` (animated ocean, ship wake rings, drifting clouds, day/night sky, storms), `vegetation.ts` (instanced wind-swaying foliage + spatial colliders), `landmarks.ts`, `wildlife.ts`.
  - `src/character/`: `humanoidRig.ts` (22-bone shared skeleton, modular skinned clothing, quality-gated wetness/mud shader), `animationController.ts` (22 blended animations + slope foot IK), `playerController.ts` (60 Hz fixed-step physics + render interpolation + critically damped spring camera + O(1) heightmap camera collision), `wardrobePreview.ts`.
  - `src/gameplay/`: `treasureWorld.ts`, `combat.ts`, `botAi.ts`.
  - `src/net/`: `netClient.ts` (20 Hz binary WS + 100ms interpolation + rejoin token), `voiceChat.ts` (optional WebRTC proximity voice).
  - `src/render/postProcess.ts`: Adaptive renderer / `EffectComposer`, `UnrealBloomPass`, `SMAAPass`, color grading, optional `SSAOPass`.
  - `src/ui/`: `mapCanvas.ts` (minimap + full fog-of-war map), `mobile.ts` (landscape-only fullscreen lock, portrait block overlay, multi-touch controls >= 48px).
  - `src/main.ts`: Adaptive GPU quality detection, dynamic resolution scaling, fixed-step accumulator, Service Worker registration (`/sw.js`), and `window.__treasureBench()` telemetry hook.
- `/server`: Authoritative Node.js + `ws` server (`server/index.ts`) supporting binary state snapshots, 6-char rooms, rejoin tokens, anti-cheat bounds, clue stealing, and `[BOT]` fill.
- `/assets`: Generated binary `.glb` rigs (`pirate_base.glb`, `clothing_pack.glb`), `catalog.json`, `manifest.webmanifest` (`orientation: "landscape"`), and `sw.js`.
