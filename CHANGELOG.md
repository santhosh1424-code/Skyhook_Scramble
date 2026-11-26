# Changelog — Reused Ideas & Bug Fixes from SKY (`Skyhook Scramble`)

Only the server architecture concepts from `server/index.js` and the touch-control structure from `src/mobile.js` were carried forward into **Treasure Isle**. All sky-island gameplay, toon shading, and capsule/sphere characters were replaced.

## Fixes Applied to Reused `server/index.js` Concepts
1. **Added Anti-Cheat Position & Speed Validation:** The old server blindly accepted `msg.pos` from clients (`boundPlayer.pos = msg.pos`) with no bounds, finite-number, or speed checks. The new server validates finite coordinates, terrain bounds, and max sprint/swim velocity deltas (clamping/correcting teleports).
2. **Enforced Server-Side Cooldowns & Authority:** Added server-tracked cooldowns for melee attacks, shoves, and digs, plus server-authoritative clue progression, dig-distance checks, chest pickup/drop/steal validation, and loadout catalogue validation.
3. **Replaced Fixed `dt = 0.05` Timer Drift:** Replaced fixed `0.05` decrement inside `setInterval` with high-resolution elapsed delta timing (`performance.now()`) so round timers and interpolation timestamps stay accurate under load.
4. **Added Area-of-Interest (AOI) Filtering & Host Settings Validation:** Remote player state snapshots are now distance-filtered around each player (while keeping global chest/score events intact), and host room settings (mode, time limit, seed, team mode) are sanitized server-side.
5. **Completed Bot Fill & Rejoin Cleanup:** Implemented `[BOT]` crew members in online rooms when `fillBots` is enabled, ensured disconnected carriers safely drop the treasure chest at ground height, and added WebRTC proximity voice signaling relay.

## Fixes Applied to Reused `src/mobile.js` Touch Controls
1. **Reset Floating Joystick Anchor on Release / Resize / Orientation Change:** The old `resetInputs()` left inline `left`/`top`/`bottom` styles from the previous drag on `#joystick-base`. Now `resetInputs()` clears inline positioning so the joystick cleanly returns to its safe-area CSS anchor.
2. **Prevented Multi-Touch Cross-Contamination:** Fixed `touchstart` handler to scan `e.changedTouches` for an unassigned touch ID rather than assuming `e.changedTouches[0]`, and guarded `joyMaxRadius > 0` to prevent division-by-zero edge cases.
3. **Expanded Controls for Open-World Pirate Gameplay:** Replaced skyhook grapple/dash buttons with thumb-friendly **Jump**, **Dig / Interact**, **Attack (Cutlass)**, **Sprint Toggle**, **Map**, **Wardrobe**, and **Emote** controls while keeping simultaneous left-joystick movement and right-side camera rotation.
