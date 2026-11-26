# Changelog — Reused Ideas & Bug Fixes from SKY (`Skyhook Scramble`)

Only the server architecture concepts from `server/index.js` and the touch-control structure from `src/mobile.js` were carried forward into **Treasure Island**. All sky-island gameplay, toon shading, and capsule/sphere characters were removed.

## Fixes Applied to Reused `server/index.js` Concepts
1. **Binary 20 Hz Protocol & Anti-Cheat Validation:** Replaced verbose JSON position/snapshot spam with compact `DataView` binary `ArrayBuffer` frames (`0x01` input, `0x02` snapshot, `0x03` correction) and added finite-number, world-bounds, and max-speed teleport checks.
2. **Server-Side Cooldowns & Authoritative Gameplay:** Enforced server cooldowns for melee attacks and digs, server-owned hidden treasure coordinates, clue progression + clue stealing, dig-distance verification, chest delivery checks, and clothing loadout validation.
3. **Accurate High-Res Tick Timing:** Replaced fixed `dt = 0.05` inside `setInterval` with `performance.now()` delta measurement to prevent timer drift.
4. **Area-of-Interest (AOI) Filtering, `[BOT]` Fill & Rejoin Cleanup:** Filtered remote player snapshots by distance (`380m`), added `[BOT]` crew members when rooms have fewer than 9 humans, safely dropped the chest if a carrier disconnects, and added WebRTC proximity signaling.

## Fixes Applied to Reused `src/mobile.js` Touch Controls
1. **Cleared Stale Floating Anchor Coordinates:** Fixed `resetInputs()` to clear inline `left`/`top`/`bottom` styles so the dynamic joystick cleanly resets on release, resize, or orientation change.
2. **Multi-Touch ID Isolation & Zero-Radius Guard:** Scanned `changedTouches` for an unassigned touch ID so left-thumb joystick and right-thumb camera drag/buttons never collide, and guarded `joyMaxRadius`.
3. **Landscape-Only Ergonomics & Adjustable Sizing:** Added landscape orientation lock + blocking portrait rotate overlay, Fullscreen button, `>= 48px` buttons for Jump, Sprint, Dig/Interact, Attack, Shove, Map, Wardrobe, Emote, and adjustable button size + opacity.
