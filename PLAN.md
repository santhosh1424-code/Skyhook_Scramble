# Treasure Island — Milestone Plan

1. **Milestone 1 — Fast-Loading Terrain + Water + Sky**
   - Precomputed 513×513 `Float32Array` heightmap with O(1) bilinear interpolation, generated in a Web Worker (`terrainWorker.ts`), streaming spawn chunks first and remaining chunks via time-slicing.
   - Chunked terrain (LOD + frustum culling) with vertex-baked Ambient Occlusion, 6-material splat shader (sand, wet sand, grass, dirt, rock, mud) + detail texture.
   - Animated normal-mapped ocean/lagoon with shore foam, depth color, sky reflections, underwater tint, and gentle wave rings around ships; dynamic sky with clouds, moving sun, day/night cycle, god rays, and storms.
2. **Milestone 2 — Rigged Humanoid + Animations + Fixed-Step Physics & Damped Camera**
   - Shared 22-bone humanoid GLBs (`pirate_base.glb`, `clothing_pack.glb`) loaded via `GLTFLoader` + `DRACOLoader` + `KTX2Loader`.
   - Decoupled fixed-step (`1/60s`) physics loop with interpolation, critically damped smooth 3rd-person collision camera (O(1) heightmap check) + optional 1st-person toggle (`V`), and spatial grid collision for trees/rocks.
   - Blended animation state machine with desktop-only slope foot IK.
3. **Milestone 3 — Mobile Landscape-Only Controls & Layout**
   - Web manifest (`orientation: "landscape"`), Fullscreen + `screen.orientation.lock('landscape')`, and full-screen blocking "Rotate your phone" pause overlay in portrait.
   - Dynamic left virtual joystick, `>= 48px` right action buttons (Jump, Sprint, Dig/Interact, Attack, Shove, Wardrobe, Map, Emote), right-side camera drag, safe-area insets, `dvh`/`visualViewport` handling, and adjustable button size & opacity.
4. **Milestone 4 — Vegetation, Landmarks, Wildlife & Graphics Polish**
   - Instanced palms, ferns, bushes, grass, flowers, rocks, driftwood, coconuts, shells, barrels/crates, distant tree LODs/billboards, detailed weathered landmarks, circling birds, crabs, fish, butterflies.
5. **Milestone 5 — Modular Clothing & Wardrobe**
   - Data-driven `catalog.json`, 8 presets, 11 skinned slots (3+ variations + tints), 4 body types, skin tones, face/beard, PBR cloth/leather/metal, wetness/mud shaders (disabled on Low), live 3D Lobby & In-Game Wardrobe (`C`).
6. **Milestone 6 — Clues, Clue Stealing, Digging & Combat**
   - Server-seeded buried treasure (never on map), 4-stage clue chain, clue stealing on rival melee hits, shovel digging, chest carry/delivery, Co-op & Free Explore modes, cutlass/kick/shove/knockdown.
7. **Milestone 7 — Binary Authoritative Multiplayer**
   - Node.js + `ws` server with binary `ArrayBuffer` 20 Hz state snapshots & inputs, 6-char room codes, session rejoin tokens, AOI filtering, anti-cheat checks, `[BOT]` fill, WebRTC proximity voice signaling.
8. **Milestone 8 — UI, Audio, PWA, Dynamic Resolution & Performance Benchmark**
   - Vite manual-chunk code splitting, Service Worker (`sw.js`), long-lived cache headers, `Auto/Low/Medium/High/Ultra` presets, dynamic resolution scaling, FPS counter, built-in `window.__treasureBench()`, and High/Ultra-only post-processing.
