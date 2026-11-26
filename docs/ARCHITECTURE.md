# Treasure Isle — Architecture Guide

## Directory Layout
- `/shared`: Pure TypeScript code shared by client and server:
  - `prng.ts`: Mulberry32 PRNG, 2D value noise, FBM, ridged noise.
  - `constants.ts`: World bounds (2000m × 2000m), chunk sizes, movement speeds, quality presets (`Low`/`Medium`/`High`/`Ultra`), body types, skin tones, loadout types.
  - `terrain.ts`: Deterministic `IslandTerrainData(seed)` with domain warping, erosion-like smoothing, volcano caldera, river/lagoon, swamp, cliff slopes, splat weights `[sand, grass, dirt, rock, mud]`, and 22 seeded landmarks (including 9 spread-out player ship berths).
  - `treasure.ts`: Deterministic 4-stage clue chain & buried treasure coordinate generator.
  - `catalog.ts`: Loads `/assets/catalog.json` and exposes `validateLoadout()`.
- `/client`: Vite + Three.js + TypeScript browser app:
  - `src/assets/assetLoader.ts`: `GLTFLoader` + `DRACOLoader` + `KTX2Loader` loader & cache.
  - `src/world/`: `pbrTextures.ts`, `terrainMesh.ts` (256 LOD chunks + frustum culling + custom 5-texture splat shader), `waterAndSky.ts` (animated normal ocean, shore foam, day/night sky, god rays, rain/storms), `vegetation.ts` (instanced wind-swaying foliage), `landmarks.ts`, `wildlife.ts`.
  - `src/character/`: `humanoidRig.ts` (22-bone shared skeleton, modular skinned clothing, wetness/mud shader), `animationController.ts` (22 blended animations + slope foot IK), `playerController.ts` (walk/run/sprint/jump/climb/wade/swim + collision 3rd-person & 1st-person camera), `wardrobePreview.ts`.
  - `src/gameplay/`: `treasureWorld.ts`, `combat.ts`, `botAi.ts`.
  - `src/net/`: `netClient.ts` (20 Hz WS + 100ms interpolation + rejoin token), `voiceChat.ts` (optional WebRTC proximity voice).
  - `src/render/postProcess.ts`: `EffectComposer`, `UnrealBloomPass`, `SMAAPass`, color grading, optional `SSAOPass`.
  - `src/ui/`: `mapCanvas.ts` (minimap + full fog-of-war map), `mobile.ts` (touch controls).
- `/server`: Authoritative Node.js + `ws` server (`server/index.ts`) compiled via `tsconfig.server.json`.
- `/assets`: Generated binary `.glb` rigs (`pirate_base.glb`, `clothing_pack.glb`) and `catalog.json`.
