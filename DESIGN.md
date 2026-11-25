# Skyhook Scramble — Game Design Document (Concise)

## 1. High-Level Concept
**Skyhook Scramble** is a fast, playful, chaotic 3D multiplayer party game for **8–9 friends** playing as tiny sky pirates racing across shifting floating islands to steal a magical **Storm Core** and deliver it to their airship before the **7-minute** round ends.

- **Tone & Visuals:** Colorful, readable cartoon 3D (chunky silhouettes, warm sunlit clouds, expressive pirate hats/scarves, clear hazard telegraphs, upbeat Web Audio SFX).
- **Modes:**
  - **Solo Scuffle (8–9 Free-for-All):** Every pirate has their own docked skiff/airship berth (or shared rotating capture skiffs) and scores individually.
  - **Team Armada (3v3v3 or 4v4):** Teams share a grand airship, pass/escort the carrier, and coordinate rescues and steals.

## 2. Core Round Loop (7 Minutes + Sudden-Death Overtime)
1. **Spawn & Scramble:** Pirates launch from their airships toward the **Central Storm Island** where the Storm Core spawns on an elevated shrine.
2. **Traverse & Grapple:** Run, jump, ledge-climb onto island rims, and fire a **Skyhook Grappling Hook** at floating buoys, palm trunks, or island cliffs to swing and zip across gaps.
3. **Carry & Mutate:** Picking up the Storm Core makes the carrier glow with a tall sky-beam and activates a **Core Mutation** (telegraphed 5 seconds before shifting):
   - *Standard:* Heavy core (slight speed penalty, high visibility).
   - *Floaty Aura:* Carrier floats higher with low gravity (easy to jump far, easy to get knocked away by wind!).
   - *Super Bouncy:* Carrier and core bounce wildly on impact!
   - *Lightning Magnet:* Periodic lightning strikes telegraph around the carrier.
   - *Decoy Split:* Spawns 2 fake cores alongside the real one for bluffing and confusion.
4. **Score & Reset:** Reach your airship's glowing delivery ring to score **+1** (2s celebration, then a fresh core spawns centrally with a randomized island/weather twist).
5. **Sudden-Death Overtime:** If tied at `0:00`, the round enters **Sudden Death** — lightning intensifies, wind picks up, and the **next delivery wins immediately**.

## 3. Dynamic Round Modifiers (Replayability)
Each round randomly combines:
- **Island Layouts:** *Archipelago Ring*, *Twin Peaks*, or *Sky Gauntlet*.
- **Moving Bridges:** Oscillating timber-and-balloon walkways linking islands.
- **Wind Gusts:** Visible swirling updrafts and crosswinds that launch pirates or disrupt jumps.
- **Collapsing Platforms:** Cracked stone tiles that shake before dropping into the clouds (respawn after 6s).
- **Lightning Zones:** Telegraphed sky-circles that zap and knock back pirates after a 2s warning.

## 4. Gadgets (1 Per Player, Balanced & Readable)
- **Smoke Bomb:** Drops a dense cartoon cloud that hides the carrier/bluff direction and grants a quick getaway hop.
- **Spring Mine:** Deploys an armed bounce pad that launches unsuspecting chasers skyward.
- **Shield Bubble:** 3.5s protective dome blocking knockback, lightning stuns, and short-range pulls.
- **Short-Range Pull:** Fires a magnetic bolo/mini-hook at nearby rivals to yank them backward or dislodge the core.

## 5. Fair Cosmetics & Social Fun
- **Zero Pay-to-Win:** All progression unlocks purely cosmetic **hats** (Tricorn, Captain, Bandana, Crown), **color palettes**, **trails**, and **victory emotes/poses**.
- **Party Features:** 6-character Private Room Invite Codes, Solo/Team toggle, text chat & push-to-talk/voice status indicators with per-player mute, disconnect grace window & rejoin token, and bot backfill clearly tagged `[BOT]`.
- **Accessibility:** Live **Subtitles** for audio cues, **Color-friendly team shapes** (`▲`, `●`, `■`, `◆`), **Remappable controls**, **Camera sensitivity slider**, **Reduced Motion** (disables screen shake & softens camera/bobbing), and full **Keyboard/Mouse + Gamepad** support.

---

## 6. Recommended Engine & Networking Architecture (8–9 Players)

### Prototype Stack (Implemented Here)
- **Three.js + Vite + Vanilla ES Modules:** Instant zero-install browser playability, rapid iteration for 3D movement, grapple physics, procedural islands, and Web Audio synthesis.

### Recommended Production Engine & Multiplayer Stack
For a shipped 8–9 player friend party game:
1. **Engine Choice:**
   - **Option A (Best Cross-Platform Indie / Steam + Web):** **Godot 4** (C#/GDScript, built-in `MultiplayerSynchronizer` / `ENet` or `WebRTC` for browser/desktop) or **Unity** with **Fish-Networking / Netcode for GameObjects**.
   - **Option B (Instant Browser Link — Zero Friction for 8–9 Friends):** **Three.js / Babylon.js + Rapier3D (WASM physics)** on the client, paired with a lightweight authoritative **Node.js / TypeScript server using Colyseus or Geckos.io (WebRTC UDP-like data channels)**.
2. **Networking Topology (8–9 Players):**
   - **Authoritative Host / Dedicated Relay Server (20–30 Hz tick rate):** Never trust clients with core ownership, position teleportation, or delivery scoring.
   - **Client-Side Prediction + Reconciliation:** Local player movement, jumping, and grappling feel instant (60+ FPS), reconciled against server snapshots.
   - **Entity Interpolation:** Remote pirates, moving bridges, and the Storm Core interpolate smoothly over a ~80–100 ms buffer.
   - **Invite Codes & Rejoin:** Short 6-char room code mapped to a room ID on a lightweight matchmaking/signaling API; each player receives a session token in `localStorage` so refreshing or dropping Wi-Fi lets them reclaim their pirate and score within a grace window (while a bot temporarily holds their spot or pauses safely).
   - **Voice Chat:** **WebRTC mesh or SFU (LiveKit)** integrated directly with room state for low-latency 8–9 player proximity/party voice with individual mute toggles.
