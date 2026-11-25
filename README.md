# Skyhook Scramble

A fast, colorful 3D pirate party game for **8–9 friends**, built with **Three.js + Vite** and an authoritative **Node.js WebSocket (`ws`)** server.

## Quick Start (Local Play)

### 1. Offline Bot Match (Zero Server Needed)
```bash
npm install
npm run dev
```
Open the printed `localhost` URL in your browser and click **Set Sail! (Offline Bot Match)**.

### 2. Local Online Multiplayer (Testing / LAN)
Start the WebSocket server in one terminal:
```bash
npm run server
```
Start the Vite frontend in a second terminal:
```bash
npm run dev
```
In the game lobby, switch to the **Online Private Room** tab, keep `ws://localhost:8080`, click **Create Room**, and share the 6-character invite code with friends!

---

## Deploying to Vercel + WebSocket Server

Because Vercel serves static frontends (and serverless functions do not maintain persistent WebSocket game loops), deploy the two parts as follows:

1. **Frontend on Vercel:**
   - Connect this repository to Vercel (reads [vercel.json](file:///d:/SKY/vercel.json), runs `npm run build`, outputs `dist/`).
   - Set environment variable `VITE_WS_URL` in Vercel Project Settings to your hosted WebSocket server URL (e.g. `wss://your-skyhook-server.onrender.com`), **or** players can paste the `wss://` URL directly in the **Online Private Room** tab.
   - Even without a backend connected, the Vercel deployment remains immediately playable in **Offline Bot Match** mode.

2. **WebSocket Server (`server/index.js`) on Render / Railway / Fly.io / VPS:**
   - Start command: `npm run server` (reads `process.env.PORT`, defaults to `8080`).
   - Install dependencies (`npm install`) and expose the WebSocket port over TLS (`wss://`).

---

## Controls
- **Move:** `WASD` (or Gamepad Left Stick)
- **Jump / Ledge-Climb:** `Space` (Gamepad `A` / `Cross`)
- **Skyhook Grapple:** `Right Click` or `E` when the green reticle (`◎`) highlights a buoy or mast (Gamepad `LB` / `LT`)
- **Dash / Steal Core:** `Shift` or `Left Click` (when camera locked) (Gamepad `B` / `Circle`)
- **Gadget:** `Q` or `F` (Gamepad `X` / `Square`)
- **Emote:** `G` (Gamepad `Y` / `Triangle`)
- **Reset to Airship:** `R`
- **Lock Mouse Camera:** Click anywhere on the game canvas (`Esc` to unlock)
