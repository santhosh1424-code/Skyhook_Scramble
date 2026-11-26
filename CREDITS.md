# Asset Credits & Licences — Treasure Island

## Included Assets (Procedural / Generated — CC0)
All models, textures, and audio currently bundled in this repository were generated procedurally so the game runs offline with zero external network dependencies or licence ambiguity:
- **Rigged Humanoid & Modular Clothing GLBs (`/assets/models/*.glb`):** Generated binary glTF 2.0 (`GLB`) skinned meshes sharing a unified 22-bone humanoid skeleton (`Hips` → `Spine` → `Chest` → `Neck`/`Head`/arms/legs), UV-mapped by `scripts/generate-assets.mjs`. Licence: **CC0 / Public Domain**.
- **PBR Terrain, Water, Cloth, Leather & Metal Textures:** Procedurally synthesized in-memory `CanvasTexture` albedo, normal, and detail maps. Licence: **CC0 / Public Domain**.
- **Audio & Pirate Shanty:** Procedurally synthesized via Web Audio API. Licence: **CC0 / Public Domain**.

## Optional Real-Asset Drop-In Guide (Mixamo / Quaternius / Poly Haven)
1. **Characters & Animations (Mixamo or Quaternius Ultimate Pirate Pack — CC0):**
   - Export T-pose humanoid + modular clothing `.glb` (Draco-compressed via `gltfpack` / Blender) matching the 22 bone names in `scripts/generate-assets.mjs`, and place them in `/assets/models/pirate_base.glb` and `/assets/models/clothing_pack.glb`.
2. **PBR Textures & HDRI (Poly Haven — CC0):**
   - Download 1K/2K KTX2/WebP coastal textures (`sand_02`, `forest_leaves_02`, `rock_face_03`, `mud_01`) and tropical HDRI from https://polyhaven.com/ into `/assets/textures/` and `/assets/hdri/`.
3. **Audio (CC0 Freesound / OpenGameArt):**
   - Drop Ogg/AAC loops into `/assets/audio/` and wire lazy fetches in `client/src/audio/soundSystem.ts`.
