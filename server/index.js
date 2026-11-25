import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const MAX_PLAYERS = 9;
const REJOIN_GRACE_MS = 60_000;

const CORE_MUTATIONS = [
  { id: 'standard', name: 'Standard Storm Core', icon: '💎' },
  { id: 'floaty', name: 'Floaty Helium Aura', icon: '🎈' },
  { id: 'bouncy', name: 'Super Bouncy Core', icon: '🏀' },
  { id: 'lightning', name: 'Lightning Magnet', icon: '⚡' },
  { id: 'decoy', name: 'Decoy Split', icon: '🎭' }
];

const LAYOUTS = ['ring', 'peaks', 'gauntlet', 'caldera'];
const MODIFIERS = ['normal', 'gale', 'thunderhead', 'fragile'];

const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genRoomCode() : code;
}

function genToken() {
  return crypto.randomBytes(12).toString('hex');
}

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function broadcast(room, msg) {
  const raw = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(raw);
    }
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function sanitizeRoomLobby(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      teamId: p.teamId,
      hatType: p.hatType,
      emoteStyle: p.emoteStyle,
      gadgetId: p.gadgetId,
      accentHex: p.accentHex,
      score: p.score
    }))
  };
}

function startRoomMatch(room) {
  room.phase = 'playing';
  room.seed = Math.floor(Math.random() * 999999);
  room.resolvedLayout =
    room.settings.layout === 'random'
      ? LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)]
      : room.settings.layout;
  room.resolvedModifier =
    room.settings.modifier === 'random'
      ? MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)]
      : room.settings.modifier;

  room.roundTimeLeft = Number(room.settings.duration || 420);
  room.countdown = 3.0;
  room.isOvertime = false;
  room.mutationIndex = 0;
  room.pendingMutationIndex = null;
  room.mutationWarningTimer = 0;
  room.mutationCycleTimer = 28;

  room.core = {
    pos: { x: 0, y: 5.9, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    carrierId: null,
    pickupCooldown: 0.5
  };

  let idx = 0;
  for (const p of room.players.values()) {
    p.score = 0;
    p.teamId = room.settings.mode === 'team' ? idx % 3 : idx;
    p.shieldTimer = 0;
    p.stunTimer = 0;
    idx++;
  }

  broadcast(room, {
    type: 'match_started',
    seed: room.seed,
    layout: room.resolvedLayout,
    modifier: room.resolvedModifier,
    countdown: room.countdown,
    room: sanitizeRoomLobby(room)
  });
}

function computeStandings(room) {
  if (room.settings.mode === 'team') {
    const teamScores = [0, 0, 0];
    for (const p of room.players.values()) {
      teamScores[p.teamId % 3] += p.score;
    }
    return teamScores
      .map((score, id) => ({ id, score }))
      .sort((a, b) => b.score - a.score);
  }
  return Array.from(room.players.values())
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function endRoomMatch(room) {
  room.phase = 'results';
  broadcast(room, {
    type: 'match_ended',
    isOvertime: room.isOvertime,
    standings: computeStandings(room),
    room: sanitizeRoomLobby(room)
  });
}

// 20 Hz simulation tick for active rooms
setInterval(() => {
  const dt = 0.05;
  const now = Date.now();

  for (const [code, room] of rooms.entries()) {
    // Cleanup disconnected players past grace window
    for (const [pid, p] of room.players.entries()) {
      if (!p.connected && now - p.disconnectedAt > REJOIN_GRACE_MS) {
        room.players.delete(pid);
        broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${p.name} timed out.` });
        if (room.hostId === pid && room.players.size > 0) {
          room.hostId = room.players.keys().next().value;
        }
        broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
      }
    }

    if (room.players.size === 0) {
      rooms.delete(code);
      continue;
    }

    if (room.phase !== 'playing') continue;

    if (room.countdown > 0) {
      room.countdown = Math.max(0, room.countdown - dt);
    } else {
      // Round timer & Overtime
      if (!room.isOvertime) {
        room.roundTimeLeft = Math.max(0, room.roundTimeLeft - dt);
        if (room.roundTimeLeft <= 0) {
          const st = computeStandings(room);
          if (st.length >= 2 && st[0].score === st[1].score) {
            room.isOvertime = true;
            broadcast(room, { type: 'event', kind: 'overtime' });
          } else {
            endRoomMatch(room);
            continue;
          }
        }
      }

      // Mutation schedule
      room.mutationCycleTimer -= dt;
      if (room.mutationCycleTimer <= 0 && room.pendingMutationIndex === null) {
        let next = Math.floor(Math.random() * CORE_MUTATIONS.length);
        if (next === room.mutationIndex) next = (next + 1) % CORE_MUTATIONS.length;
        room.pendingMutationIndex = next;
        room.mutationWarningTimer = 5.0;
        broadcast(room, { type: 'event', kind: 'mutation_warning', mutationIndex: next });
      }
      if (room.pendingMutationIndex !== null) {
        room.mutationWarningTimer -= dt;
        if (room.mutationWarningTimer <= 0) {
          room.mutationIndex = room.pendingMutationIndex;
          room.pendingMutationIndex = null;
          room.mutationCycleTimer = 30;
          broadcast(room, { type: 'event', kind: 'mutation_active', mutationIndex: room.mutationIndex });
        }
      }
    }

    // Core tracking
    if (room.core.pickupCooldown > 0) {
      room.core.pickupCooldown = Math.max(0, room.core.pickupCooldown - dt);
    }
    if (room.core.carrierId) {
      const carrier = room.players.get(room.core.carrierId);
      if (carrier) {
        room.core.pos = { x: carrier.pos.x, y: carrier.pos.y + 2.85, z: carrier.pos.z };
      } else {
        room.core.carrierId = null;
        room.core.pos = { x: 0, y: 5.9, z: 0 };
      }
    }

    for (const p of room.players.values()) {
      if (p.shieldTimer > 0) p.shieldTimer = Math.max(0, p.shieldTimer - dt);
      if (p.stunTimer > 0) p.stunTimer = Math.max(0, p.stunTimer - dt);
    }

    // Broadcast 20 Hz authoritative state snapshot
    broadcast(room, {
      type: 'snapshot',
      countdown: room.countdown,
      roundTimeLeft: room.roundTimeLeft,
      isOvertime: room.isOvertime,
      mutationIndex: room.mutationIndex,
      core: room.core,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id,
        pos: p.pos,
        vel: p.vel,
        yaw: p.yaw,
        grappleActive: p.grappleActive,
        grappleTarget: p.grappleTarget,
        shieldTimer: p.shieldTimer,
        emoteTimer: p.emoteTimer,
        score: p.score
      }))
    });
  }
}, 50);

const wss = new WebSocketServer({ port: PORT });
console.log(`[Skyhook Scramble WS] Authoritative server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  let boundRoom = null;
  let boundPlayer = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'create_room') {
      const code = genRoomCode();
      const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
      const token = genToken();
      const player = {
        id: playerId,
        token,
        ws,
        connected: true,
        disconnectedAt: 0,
        name: String(msg.name || "Cap'n Spark").slice(0, 16),
        hatType: msg.hatType || 'tricorn',
        emoteStyle: msg.emoteStyle || 'spin',
        gadgetId: msg.gadgetId || 'smoke',
        accentHex: msg.accentHex || 0x2ec4ff,
        teamId: 0,
        score: 0,
        pos: { x: 0, y: 6, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        grappleActive: false,
        grappleTarget: { x: 0, y: 0, z: 0 },
        shieldTimer: 0,
        stunTimer: 0,
        emoteTimer: 0
      };

      const room = {
        code,
        hostId: playerId,
        phase: 'lobby',
        settings: {
          mode: msg.settings?.mode || 'team',
          layout: msg.settings?.layout || 'random',
          modifier: msg.settings?.modifier || 'random',
          duration: Number(msg.settings?.duration || 420),
          fillBots: msg.settings?.fillBots !== false
        },
        players: new Map([[playerId, player]]),
        core: { pos: { x: 0, y: 5.9, z: 0 }, vel: { x: 0, y: 0, z: 0 }, carrierId: null, pickupCooldown: 0 }
      };
      rooms.set(code, room);
      boundRoom = room;
      boundPlayer = player;

      send(ws, {
        type: 'joined_room',
        playerId,
        token,
        room: sanitizeRoomLobby(room)
      });
      return;
    }

    if (msg.type === 'join_room') {
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: `Room "${code}" not found.` });
        return;
      }

      // Check token rejoin first
      if (msg.token) {
        for (const p of room.players.values()) {
          if (p.token === msg.token) {
            p.ws = ws;
            p.connected = true;
            boundRoom = room;
            boundPlayer = p;
            send(ws, {
              type: 'joined_room',
              playerId: p.id,
              token: p.token,
              rejoined: true,
              seed: room.seed,
              layout: room.resolvedLayout,
              modifier: room.resolvedModifier,
              room: sanitizeRoomLobby(room)
            });
            broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${p.name} rejoined the match!` });
            broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
            return;
          }
        }
      }

      if (room.players.size >= MAX_PLAYERS) {
        send(ws, { type: 'error', message: 'Room is full (9/9 pirates).' });
        return;
      }
      if (room.phase !== 'lobby') {
        send(ws, { type: 'error', message: 'Match already in progress (use your original rejoin token to reconnect).' });
        return;
      }

      const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
      const token = genToken();
      const player = {
        id: playerId,
        token,
        ws,
        connected: true,
        disconnectedAt: 0,
        name: String(msg.name || 'Sky Pirate').slice(0, 16),
        hatType: msg.hatType || 'tricorn',
        emoteStyle: msg.emoteStyle || 'spin',
        gadgetId: msg.gadgetId || 'smoke',
        accentHex: msg.accentHex || 0x2ec4ff,
        teamId: room.players.size % 3,
        score: 0,
        pos: { x: 0, y: 6, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        grappleActive: false,
        grappleTarget: { x: 0, y: 0, z: 0 },
        shieldTimer: 0,
        stunTimer: 0,
        emoteTimer: 0
      };
      room.players.set(playerId, player);
      boundRoom = room;
      boundPlayer = player;

      send(ws, { type: 'joined_room', playerId, token, room: sanitizeRoomLobby(room) });
      broadcast(room, { type: 'room_update', room: sanitizeRoomLobby(room) });
      broadcast(room, { type: 'chat', sender: 'SYSTEM', text: `${player.name} boarded the crew!` });
      return;
    }

    if (!boundRoom || !boundPlayer) return;

    if (msg.type === 'update_settings' && boundRoom.hostId === boundPlayer.id && boundRoom.phase === 'lobby') {
      boundRoom.settings = { ...boundRoom.settings, ...msg.settings };
      broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
    } else if (msg.type === 'start_match' && boundRoom.hostId === boundPlayer.id) {
      startRoomMatch(boundRoom);
    } else if (msg.type === 'back_to_lobby' && boundRoom.hostId === boundPlayer.id) {
      boundRoom.phase = 'lobby';
      broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
    } else if (msg.type === 'input_state') {
      if (msg.pos) boundPlayer.pos = msg.pos;
      if (msg.vel) boundPlayer.vel = msg.vel;
      if (typeof msg.yaw === 'number') boundPlayer.yaw = msg.yaw;
      boundPlayer.grappleActive = !!msg.grappleActive;
      if (msg.grappleTarget) boundPlayer.grappleTarget = msg.grappleTarget;
      if (typeof msg.emoteTimer === 'number') boundPlayer.emoteTimer = msg.emoteTimer;
    } else if (msg.type === 'claim_core' && boundRoom.phase === 'playing' && boundRoom.countdown <= 0) {
      if (!boundRoom.core.carrierId && boundRoom.core.pickupCooldown <= 0 && boundPlayer.stunTimer <= 0) {
        if (dist3(boundPlayer.pos, boundRoom.core.pos) <= 4.2) {
          boundRoom.core.carrierId = boundPlayer.id;
          broadcast(boundRoom, { type: 'event', kind: 'core_pickup', playerId: boundPlayer.id });
        }
      }
    } else if (msg.type === 'drop_core' && boundRoom.core.carrierId === boundPlayer.id) {
      boundRoom.core.carrierId = null;
      boundRoom.core.pickupCooldown = 0.8;
      boundRoom.core.pos = msg.resetToCenter ? { x: 0, y: 5.9, z: 0 } : { ...boundPlayer.pos, y: boundPlayer.pos.y + 2 };
      broadcast(boundRoom, { type: 'event', kind: 'core_dropped', pos: boundRoom.core.pos });
    } else if (msg.type === 'steal_core' && boundRoom.core.carrierId) {
      const carrier = boundRoom.players.get(boundRoom.core.carrierId);
      if (carrier && carrier.id !== boundPlayer.id && carrier.teamId !== boundPlayer.teamId && carrier.shieldTimer <= 0) {
        if (dist3(boundPlayer.pos, carrier.pos) <= 4.0) {
          boundRoom.core.carrierId = null;
          boundRoom.core.pickupCooldown = 1.05;
          boundRoom.core.pos = { x: carrier.pos.x, y: carrier.pos.y + 2.4, z: carrier.pos.z };
          carrier.stunTimer = 0.6;
          broadcast(boundRoom, {
            type: 'event',
            kind: 'core_stolen',
            thiefId: boundPlayer.id,
            carrierId: carrier.id,
            pos: boundRoom.core.pos
          });
        }
      }
    } else if (msg.type === 'deliver_core' && boundRoom.core.carrierId === boundPlayer.id) {
      boundPlayer.score += 1;
      boundRoom.core.carrierId = null;
      boundRoom.core.pickupCooldown = 0.6;
      boundRoom.core.pos = { x: 0, y: 5.9, z: 0 };
      broadcast(boundRoom, {
        type: 'event',
        kind: 'core_delivered',
        playerId: boundPlayer.id,
        teamId: boundPlayer.teamId,
        score: boundPlayer.score
      });
      if (boundRoom.isOvertime) {
        endRoomMatch(boundRoom);
      }
    } else if (msg.type === 'use_gadget') {
      if (boundPlayer.gadgetId === 'shield') boundPlayer.shieldTimer = 3.5;
      broadcast(boundRoom, {
        type: 'event',
        kind: 'gadget_used',
        playerId: boundPlayer.id,
        gadgetId: boundPlayer.gadgetId,
        pos: boundPlayer.pos
      });
    } else if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 80);
      if (text) {
        broadcast(boundRoom, { type: 'chat', sender: boundPlayer.name, text });
      }
    }
  });

  ws.on('close', () => {
    if (!boundRoom || !boundPlayer) return;
    boundPlayer.connected = false;
    boundPlayer.ws = null;
    boundPlayer.disconnectedAt = Date.now();

    if (boundRoom.core.carrierId === boundPlayer.id) {
      boundRoom.core.carrierId = null;
      boundRoom.core.pickupCooldown = 0.6;
      boundRoom.core.pos = { ...boundPlayer.pos, y: Math.max(3, boundPlayer.pos.y + 1.5) };
    }

    broadcast(boundRoom, {
      type: 'chat',
      sender: 'SYSTEM',
      text: `${boundPlayer.name} disconnected (spot reserved for 60s).`
    });
    broadcast(boundRoom, { type: 'room_update', room: sanitizeRoomLobby(boundRoom) });
  });
});
