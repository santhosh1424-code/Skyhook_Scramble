import { WebSocketServer, type WebSocket } from 'ws';
import crypto from 'node:crypto';
import {
  DEFAULT_LOADOUT,
  HALF_WORLD,
  MAX_PLAYERS,
  MOVE_SPEEDS,
  REJOIN_GRACE_MS,
  TICK_RATE_HZ,
  type ClothingLoadout,
  type GameMode,
  type TeamMode
} from '../shared/constants.js';
import { validateLoadout } from '../shared/catalog.js';
import { IslandTerrainData } from '../shared/terrain.js';
import { generateTreasureHunt, type TreasureHuntPlan } from '../shared/treasure.js';

const PORT = Number(process.env.PORT || 8080);
const AOI_RADIUS = 380;

interface ServerPlayer {
  id: string;
  token: string;
  ws: WebSocket | null;
  isBot: boolean;
  connected: boolean;
  disconnectedAt: number;
  name: string;
  teamId: number;
  berthIndex: number;
  loadout: ClothingLoadout;
  score: number;
  clueStage: number;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  animState: string;
  carryingChest: boolean;
  knockedDownTimer: number;
  attackCooldown: number;
  digCooldown: number;
  lastMoveCheckMs: number;
}

interface RoomSettings {
  mode: GameMode;
  teamMode: TeamMode;
  timeLimit: number;
  seed: number;
  fillBots: boolean;
}

interface RoomState {
  code: string;
  hostId: string;
  phase: 'lobby' | 'playing' | 'results';
  settings: RoomSettings;
  players: Map<string, ServerPlayer>;
  terrain: IslandTerrainData | null;
  hunt: TreasureHuntPlan | null;
  timeLeft: number;
  chestState: 'buried' | 'dropped' | 'carried' | 'delivered';
  chestPos: { x: number; y: number; z: number };
  carrierId: string | null;
  digProgress: number;
}

const rooms = new Map<string, RoomState>();

function genRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genRoomCode() : code;
}

function genToken(): string {
  return crypto.randomBytes(12).toString('hex');
}

function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
}

function dist3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function send(ws: WebSocket | null, msg: unknown): void {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room: RoomState, msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(raw);
    }
  }
}

function sanitizeRoomLobby(room: RoomState) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      teamId: p.teamId,
      berthIndex: p.berthIndex,
      loadout: p.loadout,
      score: p.score
    }))
  };
}

function sanitizeSettings(raw: unknown, fallback: RoomSettings): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RoomSettings>;
  const mode: GameMode = r.mode === 'coop' || r.mode === 'explore' ? r.mode : 'competitive';
  const teamMode: TeamMode = r.teamMode === 'teams' ? 'teams' : 'solo';
  const timeLimit =
    mode === 'explore'
      ? 0
      : typeof r.timeLimit === 'number' && Number.isFinite(r.timeLimit)
      ? Math.max(120, Math.min(3600, Math.round(r.timeLimit)))
      : fallback.timeLimit;
  const seed =
    typeof r.seed === 'number' && Number.isFinite(r.seed) && r.seed > 0
      ? (Math.floor(r.seed) >>> 0)
      : Math.floor(Math.random() * 899999 + 100000);
  return {
    mode,
    teamMode,
    timeLimit,
    seed,
    fillBots: r.fillBots !== false
  };
}

function startRoomMatch(room: RoomState): void {
  // Remove previous bots before refilling
  for (const [pid, p] of room.players.entries()) {
    if (p.isBot) room.players.delete(pid);
  }

  const seed = room.settings.seed || Math.floor(Math.random() * 899999 + 100000);
  room.terrain = new IslandTerrainData(seed);
  room.hunt = generateTreasureHunt(room.terrain);
  room.phase = 'playing';
  room.timeLeft = room.settings.mode === 'explore' ? 0 : room.settings.timeLimit;
  room.chestState = 'buried';
  room.chestPos = { ...room.hunt.treasurePos };
  room.carrierId = null;
  room.digProgress = 0;

  // Optionally fill remaining slots up to MAX_PLAYERS (9) with clearly tagged [BOT] pirates
  if (room.settings.fillBots) {
    const botNames = ['Barnacle [BOT]', 'Cutlass Kate [BOT]', 'Salty Sam [BOT]', 'Calico [BOT]', 'Reef Jack [BOT]', 'Vane [BOT]', 'Morgan [BOT]', 'Sparrow [BOT]'];
    let bi = 0;
    while (room.players.size < MAX_PLAYERS && bi < botNames.length) {
      const bid = `bot_${bi}_${crypto.randomBytes(2).toString('hex')}`;
      room.players.set(bid, {
        id: bid,
        token: '',
        ws: null,
        isBot: true,
        connected: true,
        disconnectedAt: 0,
        name: botNames[bi],
        teamId: 0,
        berthIndex: 0,
        loadout: structuredClone(DEFAULT_LOADOUT),
        score: 0,
        clueStage: 0,
        pos: { x: 0, y: 2, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        animState: 'idle',
        carryingChest: false,
        knockedDownTimer: 0,
        attackCooldown: 0,
        digCooldown: 0,
        lastMoveCheckMs: performance.now()
      });
      bi++;
    }
  }

  const berths = room.terrain.landmarks.filter((l) => l.kind === 'ship_berth');
  let idx = 0;
  for (const p of room.players.values()) {
    p.berthIndex = idx % MAX_PLAYERS;
    p.teamId = room.settings.mode === 'coop' ? 0 : room.settings.teamMode === 'teams' ? idx % 3 : idx;
    p.score = 0;
    p.clueStage = 0;
    p.carryingChest = false;
    p.knockedDownTimer = 0;
    const berth = berths[p.berthIndex] || { x: 0, z: 0 };
    const spawnY = room.terrain.getHeight(berth.x, berth.z) + 1.2;
    p.pos = { x: berth.x, y: Math.max(1.2, spawnY), z: berth.z };
    p.vel = { x: 0, y: 0, z: 0 };
    p.lastMoveCheckMs = performance.now();
    idx++;
  }

  // Only send the FIRST clue initially (never send treasurePos while buried!)
  const firstClue = room.hunt.clues[0];
  broadcast(room, {
    type: 'match_started',
    seed,
    firstClue,
    room: sanitizeRoomLobby(room)
  });
}

function endRoomMatch(room: RoomState, winnerName: string, reason: string): void {
  room.phase = 'results';
  const standings = Array.from(room.players.values())
    .map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, score: p.score, isBot: p.isBot }))
    .sort((a, b) => b.score - a.score);

  broadcast(room, {
    type: 'match_ended',
    winnerName,
    reason,
    standings,
    treasurePos: room.hunt?.treasurePos,
    room: sanitizeRoomLobby(room)
  });
}

// High-resolution delta simulation loop (~20 Hz)
let lastTickMs = performance.now();
setInterval(() => {
  const nowMs = performance.now();
  const dt = Math.min(0.25, Math.max(0.01, (nowMs - lastTickMs) / 1000));
  lastTickMs = nowMs;
  const wallNow = Date.now();

  for (const [code, room] of rooms.entries()) {
    // Cleanup disconnected humans past grace period
    let hasHuman = false;
    for (const [pid, p] of room.players.entries()) {
      if (!p.isBot) {
        if (p.connected) hasHuman = true;
        else if (wallNow - p.disconnectedAt > REJOIN_GRACE_MS) {
          room.players.delete(pid);
          broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${p.name} timed out.` });
          if (room.hostId === pid) {
            const nextHuman = Array.from(room.players.values()).find((x) => !x.isBot);
            if (nextHuman) room.hostId = nextHuman.id;
          }
          broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
        } else {
          hasHuman = true; // still in rejoin grace window
        }
      }
    }

    if (!hasHuman) {
      rooms.delete(code);
      continue;
    }

    if (room.phase !== 'playing' || !room.terrain || !room.hunt) continue;

    // Timer for competitive / coop
    if (room.settings.mode !== 'explore') {
      room.timeLeft = Math.max(0, room.timeLeft - dt);
      if (room.timeLeft <= 0) {
        endRoomMatch(room, room.settings.mode === 'coop' ? 'Time Expired!' : 'Draw at Sea', 'Time ran out!');
        continue;
      }
    }

    // Step server bots & timers
    const berths = room.terrain.landmarks.filter((l) => l.kind === 'ship_berth');
    for (const p of room.players.values()) {
      if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);
      if (p.digCooldown > 0) p.digCooldown = Math.max(0, p.digCooldown - dt);
      if (p.knockedDownTimer > 0) p.knockedDownTimer = Math.max(0, p.knockedDownTimer - dt);

      if (p.isBot && p.knockedDownTimer <= 0) {
        let target: { x: number; y: number; z: number } = room.hunt.clues[Math.min(p.clueStage, room.hunt.clues.length - 1)];
        if (p.carryingChest) {
          const b = berths[p.berthIndex] || { x: 0, y: 1, z: 0 };
          target = { x: b.x, y: 1, z: b.z };
        } else if (room.chestState === 'dropped') {
          target = room.chestPos;
        } else if (room.chestState === 'carried' && room.carrierId) {
          const carrier = room.players.get(room.carrierId);
          if (carrier && carrier.teamId !== p.teamId) target = carrier.pos;
        } else if (p.clueStage >= room.hunt.clues.length) {
          target = room.hunt.treasurePos;
        }

        const dx = target.x - p.pos.x;
        const dz = target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.2) {
          const spd = p.carryingChest ? MOVE_SPEEDS.run * MOVE_SPEEDS.carryMult : MOVE_SPEEDS.run;
          p.pos.x += (dx / d) * spd * dt;
          p.pos.z += (dz / d) * spd * dt;
          p.pos.y = Math.max(0, room.terrain.getHeight(p.pos.x, p.pos.z));
          p.yaw = Math.atan2(dx, dz);
          p.animState = p.carryingChest ? 'carry' : 'run';
        } else {
          p.animState = 'idle';
          if (p.carryingChest) {
            p.score += 1;
            endRoomMatch(room, p.name, 'Delivered the Treasure Chest to their ship!');
            break;
          } else if (p.clueStage < room.hunt.clues.length) {
            p.clueStage++;
          }
        }
      }
    }

    if (room.phase !== 'playing') continue;

    if (room.chestState === 'carried' && room.carrierId) {
      const carrier = room.players.get(room.carrierId);
      if (carrier) {
        room.chestPos = { ...carrier.pos, y: carrier.pos.y + 1.0 };
      } else {
        room.chestState = 'dropped';
        room.carrierId = null;
      }
    }

    // AOI-filtered 20 Hz snapshot per human client
    for (const recipient of room.players.values()) {
      if (recipient.isBot || !recipient.ws || recipient.ws.readyState !== 1) continue;
      const nearbyPlayers = [];
      for (const other of room.players.values()) {
        if (other.id === recipient.id) continue;
        if (other.id === room.carrierId || dist3(recipient.pos, other.pos) <= AOI_RADIUS) {
          nearbyPlayers.push({
            id: other.id,
            pos: other.pos,
            vel: other.vel,
            yaw: other.yaw,
            animState: other.animState,
            carryingChest: other.carryingChest,
            knockedDownTimer: other.knockedDownTimer
          });
        }
      }
      send(recipient.ws, {
        type: 'snapshot',
        serverTime: wallNow,
        timeLeft: room.timeLeft,
        chestState: room.chestState,
        chestPos: room.chestState === 'buried' ? null : room.chestPos,
        carrierId: room.carrierId,
        players: nearbyPlayers
      });
    }
  }
}, Math.round(1000 / TICK_RATE_HZ));

const wss = new WebSocketServer({ port: PORT });
console.log(`[Treasure Isle WS] Authoritative server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  let boundRoom: RoomState | null = null;
  let boundPlayer: ServerPlayer | null = null;

  ws.on('message', (raw) => {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'create_room') {
      const code = genRoomCode();
      const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
      const token = genToken();
      const loadout = validateLoadout(msg.loadout);

      const player: ServerPlayer = {
        id: playerId,
        token,
        ws,
        isBot: false,
        connected: true,
        disconnectedAt: 0,
        name: String(msg.name || 'Captain').trim().slice(0, 16) || 'Captain',
        teamId: 0,
        berthIndex: 0,
        loadout,
        score: 0,
        clueStage: 0,
        pos: { x: 0, y: 4, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        animState: 'idle',
        carryingChest: false,
        knockedDownTimer: 0,
        attackCooldown: 0,
        digCooldown: 0,
        lastMoveCheckMs: performance.now()
      };

      const defaultSettings: RoomSettings = {
        mode: 'competitive',
        teamMode: 'solo',
        timeLimit: 900,
        seed: Math.floor(Math.random() * 899999 + 100000),
        fillBots: true
      };

      const room: RoomState = {
        code,
        hostId: playerId,
        phase: 'lobby',
        settings: sanitizeSettings(msg.settings, defaultSettings),
        players: new Map([[playerId, player]]),
        terrain: null,
        hunt: null,
        timeLeft: 900,
        chestState: 'buried',
        chestPos: { x: 0, y: 0, z: 0 },
        carrierId: null,
        digProgress: 0
      };

      rooms.set(code, room);
      boundRoom = room;
      boundPlayer = player;
      send(ws, { type: 'joined_room', playerId, token, room: sanitizeRoomLobby(room) });
      return;
    }

    if (msg.type === 'join_room') {
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: `Room "${code}" not found.` });
        return;
      }

      if (typeof msg.token === 'string' && msg.token.length > 0) {
        for (const p of room.players.values()) {
          if (!p.isBot && p.token === msg.token) {
            p.ws = ws;
            p.connected = true;
            p.lastMoveCheckMs = performance.now();
            boundRoom = room;
            boundPlayer = p;
            send(ws, {
              type: 'joined_room',
              playerId: p.id,
              token: p.token,
              rejoined: true,
              seed: room.settings.seed,
              clueStage: p.clueStage,
              currentClue: room.hunt?.clues[Math.min(p.clueStage, (room.hunt?.clues.length || 1) - 1)],
              room: sanitizeRoomLobby(room)
            });
            broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${p.name} rejoined the island!` });
            broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
            return;
          }
        }
      }

      const humanCount = Array.from(room.players.values()).filter((p) => !p.isBot).length;
      if (humanCount >= MAX_PLAYERS) {
        send(ws, { type: 'error', message: 'Room is full (9/9 humans).' });
        return;
      }
      if (room.phase !== 'lobby') {
        send(ws, { type: 'error', message: 'Expedition already underway (use your rejoin token to reconnect).' });
        return;
      }

      const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
      const token = genToken();
      const player: ServerPlayer = {
        id: playerId,
        token,
        ws,
        isBot: false,
        connected: true,
        disconnectedAt: 0,
        name: String(msg.name || 'Sailor').trim().slice(0, 16) || 'Sailor',
        teamId: room.players.size % 3,
        berthIndex: room.players.size % MAX_PLAYERS,
        loadout: validateLoadout(msg.loadout),
        score: 0,
        clueStage: 0,
        pos: { x: 0, y: 4, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        animState: 'idle',
        carryingChest: false,
        knockedDownTimer: 0,
        attackCooldown: 0,
        digCooldown: 0,
        lastMoveCheckMs: performance.now()
      };

      room.players.set(playerId, player);
      boundRoom = room;
      boundPlayer = player;
      send(ws, { type: 'joined_room', playerId, token, room: sanitizeRoomLobby(room) });
      broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
      broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${player.name} dropped anchor in the crew!` });
      return;
    }

    if (!boundRoom || !boundPlayer) return;

    if (msg.type === 'update_loadout') {
      boundPlayer.loadout = validateLoadout(msg.loadout);
      broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
    } else if (msg.type === 'update_settings' && boundRoom.hostId === boundPlayer.id && boundRoom.phase === 'lobby') {
      boundRoom.settings = sanitizeSettings(msg.settings, boundRoom.settings);
      broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
    } else if (msg.type === 'start_match' && boundRoom.hostId === boundPlayer.id) {
      startRoomMatch(boundRoom);
    } else if (msg.type === 'input_state' && boundRoom.phase === 'playing') {
      if (!isFiniteVec3(msg.pos) || !isFiniteVec3(msg.vel)) return;
      const now = performance.now();
      const elapsedSec = Math.max(0.02, (now - boundPlayer.lastMoveCheckMs) / 1000);
      boundPlayer.lastMoveCheckMs = now;

      // Anti-cheat: clamp world bounds & reject extreme speed/teleport deltas
      const maxAllowedDist = MOVE_SPEEDS.sprint * 1.8 * elapsedSec + 2.5;
      const moveDist = dist3(boundPlayer.pos, msg.pos);
      const bound = HALF_WORLD + 170;
      if (moveDist > maxAllowedDist || Math.abs(msg.pos.x) > bound || Math.abs(msg.pos.z) > bound) {
        send(ws, { type: 'correct_pos', pos: boundPlayer.pos });
        return;
      }

      boundPlayer.pos = msg.pos;
      boundPlayer.vel = msg.vel;
      if (typeof msg.yaw === 'number' && Number.isFinite(msg.yaw)) boundPlayer.yaw = msg.yaw;
      if (typeof msg.animState === 'string') boundPlayer.animState = msg.animState.slice(0, 20);
    } else if (msg.type === 'claim_clue' && boundRoom.phase === 'playing' && boundRoom.hunt) {
      const stage = boundPlayer.clueStage;
      const clue = boundRoom.hunt.clues[stage];
      if (clue && dist3(boundPlayer.pos, clue) <= 7.0) {
        boundPlayer.clueStage += 1;
        const nextClue = boundRoom.hunt.clues[boundPlayer.clueStage] || null;
        send(ws, { type: 'clue_unlocked', clueStage: boundPlayer.clueStage, nextClue });
      }
    } else if (msg.type === 'dig' && boundRoom.phase === 'playing' && boundRoom.hunt) {
      if (boundPlayer.digCooldown > 0 || boundPlayer.knockedDownTimer > 0) return;
      boundPlayer.digCooldown = 0.9;

      if (boundRoom.chestState === 'dropped' && dist3(boundPlayer.pos, boundRoom.chestPos) <= 4.5) {
        boundRoom.chestState = 'carried';
        boundRoom.carrierId = boundPlayer.id;
        boundPlayer.carryingChest = true;
        broadcast(boundRoom, { type: 'event', kind: 'chest_picked', playerId: boundPlayer.id, name: boundPlayer.name });
        return;
      }

      if (boundRoom.chestState === 'buried') {
        const d = dist3(boundPlayer.pos, boundRoom.hunt.treasurePos);
        if (d <= 5.5) {
          boundRoom.digProgress += 1;
          broadcast(boundRoom, { type: 'event', kind: 'dig_mound', pos: boundPlayer.pos, progress: boundRoom.digProgress });
          if (boundRoom.digProgress >= 2) {
            boundRoom.chestState = 'carried';
            boundRoom.carrierId = boundPlayer.id;
            boundPlayer.carryingChest = true;
            broadcast(boundRoom, {
              type: 'event',
              kind: 'chest_unearthed',
              playerId: boundPlayer.id,
              name: boundPlayer.name,
              pos: boundRoom.hunt.treasurePos
            });
          } else {
            send(ws, { type: 'dig_feedback', message: 'You struck timber! Dig again!' });
          }
        } else {
          send(ws, { type: 'dig_feedback', message: d < 18 ? 'Warm! Soil feels disturbed nearby...' : 'Only sand and shells here.' });
        }
      }
    } else if (msg.type === 'attack' && boundRoom.phase === 'playing') {
      if (boundPlayer.attackCooldown > 0 || boundPlayer.knockedDownTimer > 0) return;
      boundPlayer.attackCooldown = 0.65;
      const kind = msg.kind === 'shove' ? 'shove' : 'slash';
      const targetId = String(msg.targetId || '');
      const target = boundRoom.players.get(targetId);
      if (target && target.id !== boundPlayer.id && target.teamId !== boundPlayer.teamId && dist3(boundPlayer.pos, target.pos) <= 4.2) {
        target.knockedDownTimer = kind === 'shove' || target.carryingChest ? 2.0 : 0.6;
        if (target.carryingChest) {
          target.carryingChest = false;
          boundRoom.chestState = 'dropped';
          boundRoom.carrierId = null;
          boundRoom.chestPos = { ...target.pos };
          broadcast(boundRoom, { type: 'event', kind: 'chest_dropped', pos: boundRoom.chestPos, thief: boundPlayer.name });
        }
        send(target.ws, { type: 'hit_received', kind, fromPos: boundPlayer.pos });
      }
    } else if (msg.type === 'deliver_chest' && boundRoom.phase === 'playing' && boundRoom.terrain) {
      if (!boundPlayer.carryingChest || boundRoom.carrierId !== boundPlayer.id) return;
      const berths = boundRoom.terrain.landmarks.filter((l) => l.kind === 'ship_berth');
      const berth = berths[boundPlayer.berthIndex];
      if (berth && Math.hypot(boundPlayer.pos.x - berth.x, boundPlayer.pos.z - berth.z) <= 10.5) {
        boundPlayer.score += 1;
        boundPlayer.carryingChest = false;
        boundRoom.chestState = 'delivered';
        endRoomMatch(boundRoom, boundPlayer.name, 'Delivered the buried treasure to their ship!');
      }
    } else if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 100);
      if (text) broadcast(boundRoom, { type: 'chat', sender: boundPlayer.name, text });
    } else if (msg.type === 'rtc_signal' && msg.targetId) {
      // Proximity WebRTC signaling relay (only within 48m)
      const target = boundRoom.players.get(String(msg.targetId));
      if (target && !target.isBot && dist3(boundPlayer.pos, target.pos) <= 48) {
        send(target.ws, { type: 'rtc_signal', fromId: boundPlayer.id, signal: msg.signal });
      }
    }
  });

  ws.on('close', () => {
    if (!boundRoom || !boundPlayer) return;
    boundPlayer.connected = false;
    boundPlayer.ws = null;
    boundPlayer.disconnectedAt = Date.now();

    if (boundPlayer.carryingChest) {
      boundPlayer.carryingChest = false;
      boundRoom.chestState = 'dropped';
      boundRoom.carrierId = null;
      boundRoom.chestPos = { ...boundPlayer.pos };
      broadcast(boundRoom, { type: 'event', kind: 'chest_dropped', pos: boundRoom.chestPos });
    }

    broadcast(boundRoom, { type: 'chat', sender: 'SYSTEM', text: `${boundPlayer.name} disconnected (spot held 60s).` });
    broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
  });
});
