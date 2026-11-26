# Treasure Island

A browser-based 3D open-world multiplayer pirate treasure-hunt game for up to **9 players**, built with **Three.js + Vite + TypeScript** and an authoritative **Node.js WebSocket (`ws`)** server.

## Quick Start (Local Development)

### 1. Install & Generate Assets
```bash
npm install
npm run gen:assets
```

### 2. Offline / Bot Expedition (Single Terminal)
```bash
npm run dev
```
Open `http://localhost:5173` and click **Set Sail! (Offline Expedition)**.

### 3. Online Multiplayer (Two Terminals)
Terminal 1 — start the authoritative WebSocket server (port `8080`):
```bash
npm run server
```
Terminal 2 — start the Vite frontend:
```bash
npm run dev
```
Switch to the **Online Private Room** tab, create a room, and share the 6-character invite code with up to 9 friends.

---

## Opening on a Phone or Tablet (Landscape-Only)
1. **Via Deployed HTTPS URL:** Open your Vercel/Netlify link in iOS Safari or Android Chrome (installable as a landscape-first PWA via `manifest.webmanifest` + `/sw.js`).
2. **Via Local Wi-Fi Dev Server:** Run `npx vite --host` in the project folder and open the printed `http://<your-PC-LAN-IP>:5173` URL on your phone.

Touch devices enforce **landscape-only play**: tapping **Fullscreen** or **Set Sail!** requests fullscreen + `screen.orientation.lock('landscape')`, and a full-screen **Rotate Your Phone** overlay pauses gameplay automatically in portrait mode. Touch controls include the left virtual joystick, right-side camera drag, and action buttons (**JUMP**, **DIG / E**, **SLASH**, **SHOVE**, **SPRINT**, **MAP**, **WARDROBE**, **EMOTE**). Adjust joystick size, touch button size (`>= 48px`), opacity, sensitivity, live FPS counter, and quality preset (`Auto` / `Low` / `Medium` / `High` / `Ultra`) in **Quality & Accessibility**.

---

## Production Build & Deployment

### Build Everything Locally
```bash
npm run build
```
This runs TypeScript type-checking (`tsc --noEmit`), builds the code-split static client bundle into `dist/`, and compiles the binary WebSocket server into `dist-server/`.

### Deploy Frontend (Vercel or Netlify)
- **Vercel:** Connect the GitHub repository; `vercel.json` sets immutable cache headers for `/assets/*` and `/models/*`, runs `tsc --noEmit && vite build`, and deploys `dist/`.
- **Netlify:** Build command `npm run build`, publish directory `dist`.
- Set environment variable `VITE_WS_URL` to your deployed `wss://` server URL (or players can paste the `wss://` URL directly in the **Online Private Room** tab).

### Deploy Server (Render / Railway / Fly.io / Docker)
Use the included `Dockerfile` or run directly:
- **Docker:**
  ```bash
  docker build -t treasure-island-server .
  docker run -p 8080:8080 treasure-island-server
  ```
- **Render / Railway / Fly.io:** Build command `npm ci && npx tsc -p tsconfig.server.json`, Start command `node dist-server/server/index.js`, expose port `8080` (`process.env.PORT`).

---

## Performance Diagnostics
Open DevTools during a match and call `window.__treasureBench()` to inspect live FPS, smoothed frame time (`avgFrameMs`), WebGL draw calls, triangles, active quality tier, dynamic resolution scale, and JS heap size.

## Controls
- **Move:** `WASD` (or Left Touch Joystick / Gamepad Left Stick)
- **Sprint:** `Shift` (or Mobile `SPRINT` toggle)
- **Jump / Ledge Climb:** `Space` (Gamepad `A`)
- **Dig / Inspect Clue:** `E` (Gamepad `X`)
- **Cutlass Swing / Shove:** `F` or Left Click / `X` (Gamepad `B` / `Y`, Mobile `SLASH` / `SHOVE`)
- **1st / 3rd Person Camera:** `V`
- **Map & Clue Journal:** `M`
- **Wardrobe (Near Ship Dock or Camp Chest):** `C`
- **Chat / Emote:** `T` or `Enter` / `G`
