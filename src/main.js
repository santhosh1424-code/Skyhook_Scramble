import * as THREE from 'three';
import {
  GADGETS,
  ROUND_MODIFIERS,
  COSMETIC_COLORS,
  TEAMS,
  SOLO_COLORS,
  CORE_MUTATIONS,
  BOT_NAMES,
  DEFAULT_KEYBINDS,
  COSMETIC_REWARDS
} from './config.js';
import { SoundManager } from './audio.js';
import { ParticleSystem } from './particles.js';
import { SkyWorld } from './world.js';
import {
  Pirate,
  StormCore,
  GadgetManager,
  stepPiratePhysics,
  findBestGrapplePoint
} from './entities.js';
import { computeBotInput } from './ai.js';
import { NetClient } from './net.js';

// --- DOM REFERENCES ---
const canvas = document.getElementById('game-canvas');
const lobbyScreen = document.getElementById('lobby-screen');
const hud = document.getElementById('hud');
const resultsScreen = document.getElementById('results-screen');
const tutorialModal = document.getElementById('tutorial-modal');
const settingsModal = document.getElementById('settings-modal');
const disconnectModal = document.getElementById('disconnect-modal');

const scoreboardEl = document.getElementById('scoreboard');
const timerEl = document.getElementById('round-timer');
const modePillEl = document.getElementById('mode-pill');
const countdownEl = document.getElementById('countdown-overlay');
const bannerAlertEl = document.getElementById('banner-alert');
const bannerIconEl = document.getElementById('banner-icon');
const bannerTitleEl = document.getElementById('banner-title');
const bannerDescEl = document.getElementById('banner-desc');
const coreStatusTextEl = document.getElementById('core-status-text');
const markersLayer = document.getElementById('markers-layer');
const grappleReticleEl = document.getElementById('grapple-reticle');
const grapplePromptEl = document.getElementById('grapple-prompt');
const climbPromptEl = document.getElementById('climb-prompt');
const hudGadgetIconEl = document.getElementById('hud-gadget-icon');
const hudGadgetNameEl = document.getElementById('hud-gadget-name');
const hudGadgetCdEl = document.getElementById('hud-gadget-cd');
const hudDashCdEl = document.getElementById('hud-dash-cd');
const chatLogEl = document.getElementById('chat-log');
const chatInputEl = document.getElementById('chat-input');
const subtitleBoxEl = document.getElementById('subtitle-box');

// --- RENDERER, SCENE, LIGHTING ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6fd0ff);
scene.fog = new THREE.FogExp2(0x9ce2ff, 0.0042);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 340);

const hemiLight = new THREE.HemisphereLight(0xfffbe8, 0x2f6a96, 1.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff0c4, 1.45);
sunLight.position.set(42, 72, 34);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 175;
const dShadow = 62;
sunLight.shadow.camera.left = -dShadow;
sunLight.shadow.camera.right = dShadow;
sunLight.shadow.camera.top = dShadow;
sunLight.shadow.camera.bottom = -dShadow;
scene.add(sunLight);

const sound = new SoundManager();
sound.attachSubtitleEl(subtitleBoxEl);
const particles = new ParticleSystem(scene, 240);
const world = new SkyWorld(scene, particles);
const gadgetMgr = new GadgetManager(scene, particles);
const net = new NetClient();

// --- STATE ---
let keybinds = loadKeybinds();
let settings = {
  quality: 'medium',
  reducedEffects: false,
  reducedMotion: false,
  subtitles: true,
  colorblind: false,
  sensitivity: 1.0,
  volume: 0.7
};

let selectedGadget = 'smoke';
let selectedColorHex = COSMETIC_COLORS[0].hex;
let lobbyTab = 'offline'; // 'offline' | 'online'
let isOnlineMatch = false;
let matchActive = false;
let matchPaused = false;
let isTeamMode = true;
let players = [];
let localPlayer = null;
let stormCore = null;
let roundTimeLeft = 420;
let roundCountdown = 0;
let isOvertime = false;
let activeMutation = CORE_MUTATIONS[0];
let pendingMutation = null;
let mutationWarningTimer = 0;
let mutationCycleTimer = 30;
let activeModifier = ROUND_MODIFIERS[0];
let shakeIntensity = 0;
let camYaw = 0;
let camPitch = 0.36;
let elapsed = 0;
let netSendTimer = 0;
let rebindingAction = null;

const keysDown = new Set();
let jumpQueued = false;
let grappleQueued = false;
let dashQueued = false;
let gadgetQueued = false;
let emoteQueued = false;

function loadKeybinds() {
  try {
    const saved = JSON.parse(localStorage.getItem('skyhook_keybinds') || 'null');
    return saved ? { ...DEFAULT_KEYBINDS, ...saved } : { ...DEFAULT_KEYBINDS };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

function saveKeybinds() {
  localStorage.setItem('skyhook_keybinds', JSON.stringify(keybinds));
}

function formatKeyCode(code) {
  return code.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Shift');
}

function applyQuality(q) {
  settings.quality = q;
  if (q === 'low') {
    renderer.shadowMap.enabled = false;
    sunLight.castShadow = false;
    renderer.setPixelRatio(1);
  } else if (q === 'medium') {
    renderer.shadowMap.enabled = true;
    sunLight.castShadow = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  } else {
    renderer.shadowMap.enabled = true;
    sunLight.castShadow = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}

// --- LOBBY & ONLINE ROOM UI ---
function initLobbyUI() {
  const defaultWs = import.meta.env?.VITE_WS_URL || (location.protocol === 'https:' ? '' : 'ws://localhost:8080');
  const wsInput = document.getElementById('ws-url-input');
  wsInput.value = defaultWs;

  const tabOffline = document.getElementById('tab-offline');
  const tabOnline = document.getElementById('tab-online');
  const onlinePanel = document.getElementById('online-panel');
  const startBtn = document.getElementById('btn-start-match');

  tabOffline.addEventListener('click', () => {
    lobbyTab = 'offline';
    tabOffline.classList.add('active');
    tabOnline.classList.remove('active');
    onlinePanel.classList.add('hidden');
    startBtn.classList.remove('hidden');
  });

  tabOnline.addEventListener('click', () => {
    lobbyTab = 'online';
    tabOnline.classList.add('active');
    tabOffline.classList.remove('active');
    onlinePanel.classList.remove('hidden');
    startBtn.classList.add('hidden');
  });

  // Check if a saved session token exists for quick rejoin
  try {
    const saved = JSON.parse(sessionStorage.getItem('skyhook_session') || 'null');
    if (saved?.roomCode && saved?.token) {
      document.getElementById('btn-rejoin-saved').classList.remove('hidden');
      document.getElementById('join-code-input').value = saved.roomCode;
    }
  } catch {}

  const picker = document.getElementById('gadget-picker');
  picker.innerHTML = '';
  Object.values(GADGETS).forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `gadget-choice ${g.id === selectedGadget ? 'selected' : ''}`;
    btn.innerHTML = `<div class="g-head"><span>${g.icon}</span><span>${g.name}</span></div><div class="g-desc">${g.desc}</div>`;
    btn.addEventListener('click', () => {
      selectedGadget = g.id;
      picker.querySelectorAll('.gadget-choice').forEach((el) => el.classList.remove('selected'));
      btn.classList.add('selected');
    });
    picker.appendChild(btn);
  });

  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = '';
  COSMETIC_COLORS.forEach((c, idx) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = `swatch ${idx === 0 ? 'selected' : ''}`;
    sw.style.background = c.hex;
    sw.title = c.name;
    sw.addEventListener('click', () => {
      selectedColorHex = c.hex;
      swatches.querySelectorAll('.swatch').forEach((el) => el.classList.remove('selected'));
      sw.classList.add('selected');
    });
    swatches.appendChild(sw);
  });

  document.getElementById('btn-start-match').addEventListener('click', () => {
    sound.ensureContext();
    startOfflineMatch();
  });

  // Online Room Buttons
  const getLocalMeta = () => ({
    name: document.getElementById('player-name').value.trim() || "Cap'n Spark",
    hatType: document.getElementById('cosmetic-hat').value,
    emoteStyle: document.getElementById('cosmetic-emote').value,
    gadgetId: selectedGadget,
    accentHex: parseInt(selectedColorHex.replace('#', ''), 16),
    settings: {
      mode: document.getElementById('game-mode').value,
      layout: document.getElementById('island-layout').value,
      modifier: document.getElementById('round-modifier').value,
      duration: parseInt(document.getElementById('round-duration').value, 10)
    }
  });

  async function ensureWsConnected() {
    const url = wsInput.value.trim();
    if (!url) {
      updateWsStatus('NOT CONNECTED — Enter ws:// or wss:// server URL', false);
      throw new Error('Missing WS URL');
    }
    if (net.status === 'connected') return;
    updateWsStatus('CONNECTING...', false);
    await net.connect(url);
    updateWsStatus('CONNECTED', true);
  }

  document.getElementById('btn-create-room').addEventListener('click', async () => {
    sound.ensureContext();
    try {
      await ensureWsConnected();
      net.send({ type: 'create_room', ...getLocalMeta() });
    } catch (err) {
      updateWsStatus('NOT CONNECTED', false);
      document.getElementById('online-helper-text').textContent = `${err.message} Start server with "npm run server" or deploy server/index.js.`;
    }
  });

  document.getElementById('btn-join-room').addEventListener('click', async () => {
    sound.ensureContext();
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) return;
    try {
      await ensureWsConnected();
      net.send({ type: 'join_room', roomCode: code, ...getLocalMeta() });
    } catch (err) {
      updateWsStatus('NOT CONNECTED', false);
      document.getElementById('online-helper-text').textContent = err.message;
    }
  });

  document.getElementById('btn-rejoin-saved').addEventListener('click', async () => {
    sound.ensureContext();
    try {
      const saved = JSON.parse(sessionStorage.getItem('skyhook_session') || 'null');
      if (!saved) return;
      await ensureWsConnected();
      net.send({ type: 'join_room', roomCode: saved.roomCode, token: saved.token, ...getLocalMeta() });
    } catch (err) {
      updateWsStatus('NOT CONNECTED', false);
      document.getElementById('online-helper-text').textContent = err.message;
    }
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('active-room-code').textContent;
    navigator.clipboard?.writeText(code).catch(() => {});
    const btn = document.getElementById('btn-copy-code');
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = 'Copy'), 1200);
  });

  document.getElementById('btn-online-start').addEventListener('click', () => {
    net.send({
      type: 'update_settings',
      settings: getLocalMeta().settings
    });
    net.send({ type: 'start_match' });
  });

  // Modals & HUD buttons
  document.getElementById('btn-open-tutorial').addEventListener('click', () => tutorialModal.classList.remove('hidden'));
  document.getElementById('btn-close-tutorial').addEventListener('click', () => tutorialModal.classList.add('hidden'));
  document.getElementById('btn-hud-help').addEventListener('click', () => tutorialModal.classList.remove('hidden'));

  document.getElementById('btn-open-settings').addEventListener('click', openSettings);
  document.getElementById('btn-hud-settings').addEventListener('click', openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('btn-hud-disconnect').addEventListener('click', () => {
    matchPaused = true;
    document.exitPointerLock?.();
    document.getElementById('disconnect-title').textContent = isOnlineMatch ? 'Online Match Paused' : 'Match Paused';
    document.getElementById('disconnect-desc').textContent = isOnlineMatch
      ? `Connected to room ${net.room?.code || ''}. Your seat is held for 60s if you disconnect.`
      : 'Resume your bot match or return to the lobby.';
    disconnectModal.classList.remove('hidden');
  });
  document.getElementById('btn-rejoin-match').addEventListener('click', () => {
    disconnectModal.classList.add('hidden');
    matchPaused = false;
  });
  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    disconnectModal.classList.add('hidden');
    if (isOnlineMatch) net.close();
    returnToLobby();
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    resultsScreen.classList.add('hidden');
    if (isOnlineMatch) {
      if (net.room?.hostId === net.playerId) {
        net.send({ type: 'start_match' });
      } else {
        returnToLobby();
      }
    } else {
      startOfflineMatch();
    }
  });
  document.getElementById('btn-back-lobby').addEventListener('click', returnToLobby);

  const btnSfx = document.getElementById('btn-sfx-toggle');
  btnSfx.addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    btnSfx.textContent = sound.enabled ? '🎵 SFX: On' : '🔇 SFX: Off';
    btnSfx.classList.toggle('muted', !sound.enabled);
  });

  document.getElementById('btn-emote-now').addEventListener('click', () => {
    if (localPlayer) localPlayer.triggerEmote();
  });

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = chatInputEl.value.trim();
    if (txt && localPlayer) {
      if (isOnlineMatch) {
        net.send({ type: 'chat', text: txt });
      } else {
        addChatMessage(localPlayer.name, txt);
      }
      chatInputEl.value = '';
    }
    chatInputEl.blur();
  });

  initSettingsBindings();
  initNetHandlers();
}

function updateWsStatus(text, ok) {
  const badge = document.getElementById('ws-status-badge');
  badge.textContent = text;
  badge.classList.toggle('ok', ok);
}

function renderOnlineRoster(room) {
  if (!room) return;
  document.getElementById('online-room-roster').classList.remove('hidden');
  document.getElementById('active-room-code').textContent = room.code;
  const list = document.getElementById('roster-list');
  list.innerHTML = '';
  room.players.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'roster-chip';
    const hostTag = p.id === room.hostId ? '👑 ' : '';
    const connTag = p.connected ? '' : ' (Reconnecting...)';
    chip.textContent = `${hostTag}${p.name}${connTag}`;
    list.appendChild(chip);
  });
  const startBtn = document.getElementById('btn-online-start');
  startBtn.classList.toggle('hidden', room.hostId !== net.playerId);
}

function initNetHandlers() {
  net.on('error', (msg) => {
    document.getElementById('online-helper-text').textContent = msg.message || 'Server error.';
  });

  net.on('joined_room', (msg) => {
    renderOnlineRoster(msg.room);
    document.getElementById('online-helper-text').textContent = `Joined room ${msg.room.code}! Share the invite code with up to 9 friends.`;
    if (msg.rejoined && msg.room.phase === 'playing') {
      startOnlineMatch(msg);
    }
  });

  net.on('room_update', (msg) => {
    renderOnlineRoster(msg.room);
  });

  net.on('match_started', (msg) => {
    startOnlineMatch(msg);
  });

  net.on('chat', (msg) => {
    addChatMessage(msg.sender, msg.text);
  });

  net.on('event', (msg) => {
    if (!matchActive || !isOnlineMatch) return;
    if (msg.kind === 'overtime') {
      isOvertime = true;
      sound.warning();
      showBanner('🔥', 'SUDDEN-DEATH OVERTIME!', 'Tied at 0:00 — NEXT CORE DELIVERY WINS!', 5);
    } else if (msg.kind === 'mutation_warning') {
      const m = CORE_MUTATIONS[msg.mutationIndex] || CORE_MUTATIONS[0];
      sound.warning();
      showBanner(m.icon, `MUTATION IN 5s: ${m.name}`, m.desc, 4.8);
    } else if (msg.kind === 'mutation_active') {
      activeMutation = CORE_MUTATIONS[msg.mutationIndex] || CORE_MUTATIONS[0];
      showBanner(activeMutation.icon, `${activeMutation.name} ACTIVE!`, activeMutation.desc, 3.2);
    } else if (msg.kind === 'core_pickup') {
      const p = players.find((pl) => pl.id === msg.playerId);
      if (p) {
        players.forEach((pl) => (pl.hasCore = pl.id === p.id));
        stormCore.carrier = p;
        sound.pickupCore();
        particles.emitCorePickup(p.pos);
      }
    } else if (msg.kind === 'core_dropped' || msg.kind === 'core_stolen') {
      players.forEach((pl) => (pl.hasCore = false));
      stormCore.carrier = null;
      if (msg.pos) stormCore.pos.set(msg.pos.x, msg.pos.y, msg.pos.z);
      if (msg.kind === 'core_stolen') sound.bounce();
    } else if (msg.kind === 'core_delivered') {
      const p = players.find((pl) => pl.id === msg.playerId);
      if (p) {
        p.score = msg.score;
        p.hasCore = false;
        p.triggerEmote();
        particles.emitScoreConfetti(p.pos, p.teamColorHex);
        addChatMessage('SCORE!', `${p.name} delivered the Storm Core!`);
        showBanner('🏆', 'CORE DELIVERED!', `${p.name} scored +1 point!`, 3.0);
      }
      stormCore.carrier = null;
      stormCore.pos.copy(world.coreSpawnPos);
      sound.scoreFanfare();
      updateScoreboardUI();
    } else if (msg.kind === 'gadget_used') {
      const user = players.find((pl) => pl.id === msg.playerId);
      if (user && user.id !== localPlayer?.id) {
        gadgetMgr.useGadget(user, players, stormCore, sound, false);
      }
    }
  });

  net.on('snapshot', (snap) => {
    if (!matchActive || !isOnlineMatch) return;
    roundCountdown = snap.countdown || 0;
    roundTimeLeft = snap.roundTimeLeft;
    isOvertime = snap.isOvertime;
    activeMutation = CORE_MUTATIONS[snap.mutationIndex] || activeMutation;

    if (snap.core) {
      if (snap.core.carrierId) {
        const c = players.find((p) => p.id === snap.core.carrierId);
        if (c) {
          stormCore.carrier = c;
          players.forEach((p) => (p.hasCore = p.id === c.id));
        }
      } else {
        stormCore.carrier = null;
        players.forEach((p) => (p.hasCore = false));
        stormCore.pos.set(snap.core.pos.x, snap.core.pos.y, snap.core.pos.z);
      }
    }

    snap.players.forEach((sp) => {
      const pl = players.find((p) => p.id === sp.id);
      if (!pl) return;
      pl.score = sp.score;
      if (pl.id !== localPlayer?.id) {
        pl.targetNetPos.set(sp.pos.x, sp.pos.y, sp.pos.z);
        pl.vel.set(sp.vel.x, sp.vel.y, sp.vel.z);
        pl.targetNetYaw = sp.yaw;
        pl.grappleActive = sp.grappleActive;
        if (sp.grappleTarget) pl.grappleTarget.set(sp.grappleTarget.x, sp.grappleTarget.y, sp.grappleTarget.z);
        pl.shieldTimer = sp.shieldTimer;
        pl.emoteTimer = sp.emoteTimer;
      }
    });
    updateScoreboardUI();
  });

  net.on('match_ended', (msg) => {
    if (!isOnlineMatch) return;
    isOvertime = msg.isOvertime;
    finishMatch();
  });

  net.on('disconnected', () => {
    updateWsStatus('DISCONNECTED', false);
    if (isOnlineMatch && matchActive) {
      addChatMessage('SYSTEM', 'Lost connection to server! Use Rejoin in the lobby with the same tab.');
    }
  });
}

function initSettingsBindings() {
  const optQuality = document.getElementById('opt-quality');
  const optReducedFx = document.getElementById('opt-reduced-effects');
  const optSub = document.getElementById('opt-subtitles');
  const optCb = document.getElementById('opt-colorblind');
  const optRm = document.getElementById('opt-reduced-motion');
  const optSens = document.getElementById('opt-sensitivity');
  const optVol = document.getElementById('opt-volume');

  optQuality.addEventListener('change', () => applyQuality(optQuality.value));
  optReducedFx.addEventListener('change', () => {
    settings.reducedEffects = optReducedFx.checked;
    particles.setReducedEffects(optReducedFx.checked);
  });
  optSub.addEventListener('change', () => {
    settings.subtitles = optSub.checked;
    sound.subtitlesEnabled = optSub.checked;
  });
  optCb.addEventListener('change', () => {
    settings.colorblind = optCb.checked;
    document.body.classList.toggle('colorblind-mode', optCb.checked);
    updateScoreboardUI();
  });
  optRm.addEventListener('change', () => {
    settings.reducedMotion = optRm.checked;
    document.body.classList.toggle('reduced-motion', optRm.checked);
  });
  optSens.addEventListener('input', () => {
    settings.sensitivity = parseFloat(optSens.value);
    document.getElementById('sens-val').textContent = `${settings.sensitivity.toFixed(1)}x`;
  });
  optVol.addEventListener('input', () => {
    settings.volume = parseFloat(optVol.value);
    sound.volume = settings.volume;
    document.getElementById('vol-val').textContent = `${Math.round(settings.volume * 100)}%`;
  });

  document.getElementById('btn-reset-keys').addEventListener('click', () => {
    keybinds = { ...DEFAULT_KEYBINDS };
    saveKeybinds();
    renderKeybindList();
  });
}

function openSettings() {
  document.exitPointerLock?.();
  renderKeybindList();
  settingsModal.classList.remove('hidden');
}

function renderKeybindList() {
  const list = document.getElementById('keybind-list');
  list.innerHTML = '';
  const labels = {
    forward: 'Move Forward',
    backward: 'Move Back',
    left: 'Move Left',
    right: 'Move Right',
    jump: 'Jump / Climb',
    grapple: 'Skyhook Grapple',
    dash: 'Dash / Steal',
    gadget: 'Use Gadget',
    emote: 'Emote Pose',
    respawn: 'Reset to Ship'
  };

  Object.entries(labels).forEach(([action, label]) => {
    const row = document.createElement('div');
    row.className = 'keybind-item';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keybind-btn';
    btn.textContent = rebindingAction === action ? 'Press Key...' : formatKeyCode(keybinds[action]);
    btn.addEventListener('click', () => {
      rebindingAction = action;
      renderKeybindList();
    });
    row.innerHTML = `<span>${label}</span>`;
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function addChatMessage(sender, text) {
  const line = document.createElement('div');
  line.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
  chatLogEl.appendChild(line);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  while (chatLogEl.children.length > 25) {
    chatLogEl.removeChild(chatLogEl.firstChild);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- MATCH LAUNCHERS ---
function startOfflineMatch() {
  cleanupMatch();
  isOnlineMatch = false;

  const playerName = document.getElementById('player-name').value.trim() || "Cap'n Spark";
  isTeamMode = document.getElementById('game-mode').value === 'team';
  const count = parseInt(document.getElementById('player-count').value, 10);
  const layoutChoice = document.getElementById('island-layout').value;
  const modChoice = document.getElementById('round-modifier').value;
  activeModifier =
    modChoice === 'random'
      ? ROUND_MODIFIERS[Math.floor(Math.random() * ROUND_MODIFIERS.length)]
      : ROUND_MODIFIERS.find((m) => m.id === modChoice) || ROUND_MODIFIERS[0];

  roundTimeLeft = parseInt(document.getElementById('round-duration').value, 10);
  roundCountdown = 3.0;
  const hatType = document.getElementById('cosmetic-hat').value;
  const emoteStyle = document.getElementById('cosmetic-emote').value;

  const gadgetKeys = Object.keys(GADGETS);
  const hats = ['tricorn', 'bandana', 'crown', 'plume'];

  const participantMeta = [];
  for (let i = 0; i < count; i++) {
    const isHuman = i === 0;
    const teamIdx = isTeamMode ? i % 3 : i;
    const teamInfo = isTeamMode ? TEAMS[teamIdx] : SOLO_COLORS[i % SOLO_COLORS.length];

    participantMeta.push({
      id: `p_${i}`,
      name: isHuman ? playerName : BOT_NAMES[i - 1],
      isBot: !isHuman,
      isRemote: false,
      teamId: teamIdx,
      teamName: isTeamMode ? teamInfo.name : (isHuman ? playerName : BOT_NAMES[i - 1]),
      teamColor: teamInfo.color,
      teamColorHex: teamInfo.hexNum,
      shape: teamInfo.shape,
      accentHex: isHuman ? parseInt(selectedColorHex.replace('#', ''), 16) : teamInfo.hexNum,
      hatType: isHuman ? hatType : hats[i % hats.length],
      emoteStyle: isHuman ? emoteStyle : 'cheer',
      gadgetId: isHuman ? selectedGadget : gadgetKeys[i % gadgetKeys.length]
    });
  }

  world.build(layoutChoice, participantMeta, isTeamMode, { modifierId: activeModifier.id });

  players = participantMeta.map((meta) => {
    const ship = isTeamMode
      ? world.airships.find((a) => a.teamId === meta.teamId)
      : world.airships.find((a) => a.ownerId === meta.id);
    return new Pirate(scene, { ...meta, homePos: ship.pos });
  });

  localPlayer = players[0];
  setupMatchCommon(`OFFLINE BOT MATCH • ${isTeamMode ? 'TEAM ARMADA' : 'SOLO SCUFFLE'} • ${world.layoutName.toUpperCase()} (${activeModifier.icon} ${activeModifier.name})`);
  addChatMessage('SYSTEM', `Offline Bot Match: ${world.layoutName.toUpperCase()} | Twist: ${activeModifier.name}`);
}

function startOnlineMatch(msg) {
  cleanupMatch();
  isOnlineMatch = true;
  const room = msg.room;
  isTeamMode = room.settings.mode === 'team';
  roundTimeLeft = Number(room.settings.duration || 420);
  roundCountdown = msg.countdown ?? 3.0;
  activeModifier = ROUND_MODIFIERS.find((m) => m.id === msg.modifier) || ROUND_MODIFIERS[0];

  const participantMeta = room.players.map((rp, idx) => {
    const teamIdx = isTeamMode ? rp.teamId % 3 : idx;
    const teamInfo = isTeamMode ? TEAMS[teamIdx] : SOLO_COLORS[idx % SOLO_COLORS.length];
    return {
      id: rp.id,
      name: rp.name,
      isBot: false,
      isRemote: rp.id !== net.playerId,
      teamId: teamIdx,
      teamName: isTeamMode ? teamInfo.name : rp.name,
      teamColor: teamInfo.color,
      teamColorHex: teamInfo.hexNum,
      shape: teamInfo.shape,
      accentHex: rp.accentHex || teamInfo.hexNum,
      hatType: rp.hatType,
      emoteStyle: rp.emoteStyle,
      gadgetId: rp.gadgetId
    };
  });

  world.build(msg.layout || 'ring', participantMeta, isTeamMode, {
    seed: msg.seed,
    modifierId: activeModifier.id
  });

  players = participantMeta.map((meta) => {
    const ship = isTeamMode
      ? world.airships.find((a) => a.teamId === meta.teamId)
      : world.airships.find((a) => a.ownerId === meta.id);
    return new Pirate(scene, { ...meta, homePos: ship.pos });
  });

  localPlayer = players.find((p) => p.id === net.playerId) || players[0];
  setupMatchCommon(`ONLINE ROOM ${room.code} • ${isTeamMode ? 'TEAM ARMADA' : 'SOLO SCUFFLE'} • ${world.layoutName.toUpperCase()}`);
  addChatMessage('SYSTEM', `Online Match Started in Room ${room.code}!`);
}

function setupMatchCommon(modeLabel) {
  stormCore = new StormCore(scene, particles);
  stormCore.reset(world.coreSpawnPos);
  activeMutation = CORE_MUTATIONS[0];
  pendingMutation = null;
  mutationWarningTimer = 0;
  mutationCycleTimer = 28;
  isOvertime = false;
  matchActive = true;
  matchPaused = false;

  const toCenter = new THREE.Vector3(0, 0, 0).sub(localPlayer.pos);
  camYaw = Math.atan2(-toCenter.x, -toCenter.z);

  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  modePillEl.textContent = modeLabel;
  const gDef = GADGETS[localPlayer.gadgetId];
  hudGadgetIconEl.textContent = gDef.icon;
  hudGadgetNameEl.textContent = gDef.name;

  chatLogEl.innerHTML = '';
  updateScoreboardUI();
  showBanner(activeModifier.icon, `${activeModifier.name.toUpperCase()}`, activeModifier.desc, 3.8);
}

function cleanupMatch() {
  players.forEach((p) => p.dispose());
  players = [];
  if (stormCore) {
    stormCore.dispose();
    stormCore = null;
  }
  gadgetMgr.clear();
  particles.clear();
  markersLayer.innerHTML = '';
  grappleReticleEl.classList.add('hidden');
}

function returnToLobby() {
  matchActive = false;
  document.exitPointerLock?.();
  cleanupMatch();
  hud.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
}

function showBanner(icon, title, desc, duration = 3.5) {
  bannerIconEl.textContent = icon;
  bannerTitleEl.textContent = title;
  bannerDescEl.textContent = desc;
  bannerAlertEl.classList.remove('hidden');
  clearTimeout(bannerAlertEl._hideTimer);
  bannerAlertEl._hideTimer = setTimeout(() => {
    bannerAlertEl.classList.add('hidden');
  }, duration * 1000);
}

// --- SCORING & RESULTS ---
function getStandings() {
  if (isTeamMode) {
    const map = new Map();
    TEAMS.forEach((t) => map.set(t.id, { id: t.id, name: t.name, color: t.color, shape: t.shape, score: 0 }));
    players.forEach((p) => {
      const entry = map.get(p.teamId);
      if (entry) entry.score += p.score;
    });
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }
  return [...players]
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.teamColor,
      shape: p.shape,
      score: p.score,
      isMe: p.id === localPlayer?.id
    }))
    .sort((a, b) => b.score - a.score);
}

function updateScoreboardUI() {
  const standings = getStandings();
  scoreboardEl.innerHTML = '';
  const maxShow = isTeamMode ? 3 : 5;
  const shown = standings.slice(0, maxShow);
  if (!isTeamMode && localPlayer && !shown.some((s) => s.isMe)) {
    const me = standings.find((s) => s.isMe);
    if (me) shown.push(me);
  }
  shown.forEach((s) => {
    const chip = document.createElement('div');
    chip.className = `score-chip ${s.isMe || (isTeamMode && s.id === localPlayer?.teamId) ? 'me' : ''}`;
    const badge = settings.colorblind ? `${s.shape} ` : '';
    chip.innerHTML = `<span class="score-dot" style="background:${s.color}"></span><span>${badge}${escapeHtml(s.name)}: ${s.score}</span>`;
    scoreboardEl.appendChild(chip);
  });
}

function finishMatch() {
  matchActive = false;
  document.exitPointerLock?.();
  sound.victory();

  const standings = getStandings();
  const top = standings[0];
  document.getElementById('results-badge').textContent = isOnlineMatch ? 'ONLINE ROUND COMPLETE' : 'BOT MATCH COMPLETE';
  document.getElementById('results-winner-title').textContent = `${top.name.toUpperCase()} WINS!`;
  document.getElementById('results-subtitle').textContent = isOvertime
    ? 'Sudden-Death Overtime Victory!'
    : 'Skyhook Scramble Final Standings';

  const podium = document.getElementById('results-podium');
  podium.innerHTML = '';
  standings.slice(0, 4).forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = `podium-card ${idx === 0 ? 'winner' : ''}`;
    card.innerHTML = `<div style="font-size:1.4rem;font-weight:900;color:${s.color}">#${idx + 1} ${s.shape}</div><div style="font-weight:800;margin:4px 0">${escapeHtml(s.name)}</div><div style="font-size:1.1rem;font-weight:900">${s.score} Core${s.score === 1 ? '' : 's'}</div>`;
    podium.appendChild(card);
  });

  const reward = COSMETIC_REWARDS[Math.floor(Math.random() * COSMETIC_REWARDS.length)];
  document.getElementById('results-cosmetic-reward').textContent = `🎁 Free Cosmetic Reward: ${reward} (Zero pay-to-win!)`;

  hud.classList.add('hidden');
  resultsScreen.classList.remove('hidden');
}

// --- INPUTS ---
window.addEventListener('keydown', (e) => {
  if (rebindingAction) {
    e.preventDefault();
    keybinds[rebindingAction] = e.code;
    rebindingAction = null;
    saveKeybinds();
    renderKeybindList();
    return;
  }

  if (document.activeElement === chatInputEl || document.activeElement.tagName === 'INPUT') {
    return;
  }

  if (e.code === 'Enter' && matchActive) {
    chatInputEl.focus();
    return;
  }

  if (!keysDown.has(e.code)) {
    if (e.code === keybinds.jump) jumpQueued = true;
    if (e.code === keybinds.grapple) grappleQueued = true;
    if (e.code === keybinds.dash) dashQueued = true;
    if (e.code === keybinds.gadget || (e.code === 'KeyF' && !Object.values(keybinds).includes('KeyF'))) gadgetQueued = true;
    if (e.code === keybinds.emote) emoteQueued = true;
    if (e.code === keybinds.respawn && localPlayer) localPlayer.respawn(particles);
  }
  keysDown.add(e.code);
});

window.addEventListener('keyup', (e) => keysDown.delete(e.code));

canvas.addEventListener('click', () => {
  if (matchActive && !matchPaused && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (!matchActive || matchPaused) return;
  if (e.button === 2) grappleQueued = true;
  if (e.button === 0 && document.pointerLockElement === canvas) dashQueued = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && matchActive && !matchPaused) {
    camYaw -= e.movementX * 0.0026 * settings.sensitivity;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0022 * settings.sensitivity, -0.25, 1.15);
  }
});

let prevGpButtons = {};
function pollGamepad(dt) {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps[0];
  if (!gp) return null;

  const lx = Math.abs(gp.axes[0]) > 0.16 ? gp.axes[0] : 0;
  const ly = Math.abs(gp.axes[1]) > 0.16 ? gp.axes[1] : 0;
  const rx = Math.abs(gp.axes[2]) > 0.18 ? gp.axes[2] : 0;
  const ry = Math.abs(gp.axes[3]) > 0.18 ? gp.axes[3] : 0;

  camYaw -= rx * 2.4 * settings.sensitivity * dt;
  camPitch = THREE.MathUtils.clamp(camPitch + ry * 1.6 * settings.sensitivity * dt, -0.25, 1.15);

  const justPressed = (idx) => {
    const down = !!gp.buttons[idx]?.pressed;
    const was = !!prevGpButtons[idx];
    prevGpButtons[idx] = down;
    return down && !was;
  };

  if (justPressed(0)) jumpQueued = true;
  if (justPressed(4) || justPressed(6)) grappleQueued = true;
  if (justPressed(1)) dashQueued = true;
  if (justPressed(2)) gadgetQueued = true;
  if (justPressed(3)) emoteQueued = true;

  return { lx, ly };
}

// --- 3D -> 2D MARKERS & GRAPPLE RETICLE ---
function updateMarkers(grappleTarget) {
  markersLayer.innerHTML = '';
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (grappleTarget && !localPlayer.grappleActive) {
    const gp = grappleTarget.pos.clone().project(camera);
    if (gp.z <= 1) {
      grappleReticleEl.style.left = `${(gp.x * 0.5 + 0.5) * w}px`;
      grappleReticleEl.style.top = `${(-gp.y * 0.5 + 0.5) * h}px`;
      grappleReticleEl.classList.remove('hidden');
    } else {
      grappleReticleEl.classList.add('hidden');
    }
  } else {
    grappleReticleEl.classList.add('hidden');
  }

  const placeMarker = (worldPos, label, className, borderColor) => {
    const p = worldPos.clone().project(camera);
    if (p.z > 1) return;
    const sx = THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * w, 46, w - 46);
    const sy = THREE.MathUtils.clamp((-p.y * 0.5 + 0.5) * h, 52, h - 40);
    const el = document.createElement('div');
    el.className = `world-marker ${className}`;
    if (borderColor) el.style.borderColor = borderColor;
    el.textContent = label;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    markersLayer.appendChild(el);
  };

  if (stormCore) {
    const dist = Math.round(localPlayer.pos.distanceTo(stormCore.pos));
    placeMarker(stormCore.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), `⚡ CORE (${dist}m)`, 'core-marker');
  }

  const homeShip = isTeamMode
    ? world.airships.find((a) => a.teamId === localPlayer.teamId)
    : world.airships.find((a) => a.ownerId === localPlayer.id);
  if (homeShip) {
    const d = Math.round(localPlayer.pos.distanceTo(homeShip.pos));
    const txt = localPlayer.hasCore ? `★ DELIVER HERE (${d}m)` : `⚓ YOUR SHIP (${d}m)`;
    placeMarker(homeShip.pos.clone().add(new THREE.Vector3(0, 4.4, 0)), txt, 'ship-marker', localPlayer.teamColor);
  }

  players.forEach((pl) => {
    if (pl.id === localPlayer.id) return;
    if (pl.pos.distanceTo(localPlayer.pos) > 36 && !pl.hasCore) return;
    const prefix = settings.colorblind ? `${pl.shape} ` : '';
    const crown = pl.hasCore ? '👑 ' : '';
    placeMarker(pl.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), `${crown}${prefix}${pl.name}`, '', pl.teamColor);
  });
}

// --- MAIN LOOP ---
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;

  if (matchActive && !matchPaused) {
    updateMatch(dt);
  } else {
    camera.position.set(Math.cos(elapsed * 0.14) * 44, 22, Math.sin(elapsed * 0.14) * 44);
    camera.lookAt(0, 4, 0);
  }

  particles.update(dt);
  renderer.render(scene, camera);
}

function updateMatch(dt) {
  // 3-2-1 Countdown
  if (roundCountdown > 0) {
    if (!isOnlineMatch) roundCountdown = Math.max(0, roundCountdown - dt);
    const num = Math.ceil(roundCountdown);
    countdownEl.textContent = num > 0 ? String(num) : 'SCRAMBLE!';
    countdownEl.classList.remove('hidden');
  } else {
    countdownEl.classList.add('hidden');
  }

  // Offline Timer & Mutation Scheduling (Online uses server snapshot)
  if (!isOnlineMatch && roundCountdown <= 0) {
    if (!isOvertime) {
      roundTimeLeft = Math.max(0, roundTimeLeft - dt);
      if (roundTimeLeft <= 0) {
        const standings = getStandings();
        if (standings.length >= 2 && standings[0].score === standings[1].score) {
          isOvertime = true;
          sound.warning();
          showBanner('🔥', 'SUDDEN-DEATH OVERTIME!', 'Tied at 0:00 — NEXT CORE DELIVERY WINS!', 5);
          addChatMessage('SYSTEM', 'SUDDEN-DEATH OVERTIME! Next delivery wins!');
        } else {
          finishMatch();
          return;
        }
      }
    }

    mutationCycleTimer -= dt;
    if (mutationCycleTimer <= 0 && !pendingMutation) {
      const candidates = CORE_MUTATIONS.filter((m) => m.id !== activeMutation.id);
      pendingMutation = candidates[Math.floor(Math.random() * candidates.length)];
      mutationWarningTimer = 5.0;
      sound.warning();
      showBanner(pendingMutation.icon, `MUTATION IN 5s: ${pendingMutation.name}`, pendingMutation.desc, 4.8);
      sound.showSubtitle(`[Warning: Core mutating to ${pendingMutation.name} in 5s!]`);
    }

    if (pendingMutation) {
      mutationWarningTimer -= dt;
      if (mutationWarningTimer <= 0) {
        activeMutation = pendingMutation;
        pendingMutation = null;
        mutationCycleTimer = 30;
        showBanner(activeMutation.icon, `${activeMutation.name} ACTIVE!`, activeMutation.desc, 3.2);
      }
    }
  }

  if (isOvertime) {
    timerEl.textContent = 'OVERTIME';
    timerEl.classList.add('overtime');
  } else {
    timerEl.classList.remove('overtime');
    const mins = Math.floor(roundTimeLeft / 60);
    const secs = Math.floor(roundTimeLeft % 60);
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // World updates & Lightning strikes
  world.update(dt, elapsed, players, stormCore.pos, activeMutation, isOvertime, (strikePos, radius) => {
    sound.thunder();
    if (!settings.reducedMotion) shakeIntensity = 0.48;
    players.forEach((pl) => {
      if (pl.isRemote) return;
      if (pl.pos.distanceTo(strikePos) <= radius && pl.shieldTimer <= 0) {
        const push = pl.pos.clone().sub(strikePos).setY(0).normalize().multiplyScalar(14);
        pl.vel.add(push);
        pl.vel.y = 12;
        pl.stunTimer = 0.65;
        if (pl.hasCore) {
          if (isOnlineMatch) net.send({ type: 'drop_core', resetToCenter: false });
          else stormCore.dropFromCarrier();
        }
      }
    });
  });

  // Camera forward vector for smart grapple aiming
  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);

  const canMove = roundCountdown <= 0;
  const gpMove = pollGamepad(dt);
  if (keysDown.has('ArrowLeft')) camYaw += 2.0 * settings.sensitivity * dt;
  if (keysDown.has('ArrowRight')) camYaw -= 2.0 * settings.sensitivity * dt;

  let moveX = 0;
  let moveZ = 0;
  if (canMove) {
    if (keysDown.has(keybinds.forward)) moveZ -= 1;
    if (keysDown.has(keybinds.backward)) moveZ += 1;
    if (keysDown.has(keybinds.left)) moveX -= 1;
    if (keysDown.has(keybinds.right)) moveX += 1;
    if (gpMove) {
      moveX += gpMove.lx;
      moveZ += gpMove.ly;
    }
  }

  const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  const localMoveVec = new THREE.Vector3()
    .addScaledVector(forward, -moveZ)
    .addScaledVector(right, moveX);
  if (localMoveVec.lengthSq() > 1) localMoveVec.normalize();

  if (canMove && gadgetQueued) {
    const used = gadgetMgr.useGadget(localPlayer, players, stormCore, sound, !isOnlineMatch);
    if (used && isOnlineMatch) net.send({ type: 'use_gadget' });
  }
  if (emoteQueued) {
    localPlayer.triggerEmote();
  }

  const localRes = stepPiratePhysics(
    localPlayer,
    localMoveVec,
    canMove && jumpQueued,
    canMove && grappleQueued,
    canMove && dashQueued,
    world,
    activeMutation,
    dt,
    sound,
    particles,
    true,
    camForward
  );
  if (localRes === 'fell' && localPlayer.hasCore) {
    if (isOnlineMatch) net.send({ type: 'drop_core', resetToCenter: true });
    else stormCore.reset(world.coreSpawnPos);
  }

  jumpQueued = false;
  grappleQueued = false;
  dashQueued = false;
  gadgetQueued = false;
  emoteQueued = false;

  // Step Bot Pirates (offline)
  if (!isOnlineMatch && canMove) {
    for (let i = 1; i < players.length; i++) {
      const bot = players[i];
      const ai = computeBotInput(bot, world, stormCore, players, dt);
      if (ai.wantsGadget) gadgetMgr.useGadget(bot, players, stormCore, sound, true);
      const botRes = stepPiratePhysics(
        bot,
        ai.moveVec,
        ai.wantsJump,
        ai.wantsGrapple,
        ai.wantsDash,
        world,
        activeMutation,
        dt,
        sound,
        particles,
        false
      );
      if (botRes === 'fell' && bot.hasCore) {
        stormCore.reset(world.coreSpawnPos);
      }
    }
  }

  // Steals & Pickups & Delivery
  if (!isOnlineMatch) {
    if (stormCore.carrier && stormCore.carrier.shieldTimer <= 0) {
      const carrier = stormCore.carrier;
      for (const pl of players) {
        if (pl.id === carrier.id || pl.teamId === carrier.teamId || pl.stunTimer > 0) continue;
        const stealRange = pl.dashTimer > 0 ? 2.1 : 1.4;
        if (pl.pos.distanceTo(carrier.pos) < stealRange) {
          const knock = carrier.pos.clone().sub(pl.pos).setY(0).normalize();
          carrier.vel.addScaledVector(knock, 14);
          carrier.vel.y = 8;
          carrier.stunTimer = 0.6;
          stormCore.dropFromCarrier(knock.multiplyScalar(6).add(new THREE.Vector3(0, 10, 0)));
          particles.emitBurst(carrier.pos, 12, { color: 0xff5d73, speed: 7, upSpeed: 5 });
          sound.bounce();
          addChatMessage('EVENT', `${pl.name} knocked the Storm Core loose from ${carrier.name}!`);
          break;
        }
      }
    }

    stormCore.update(dt, elapsed, world, players, activeMutation, sound, true);

    if (stormCore.carrier) {
      const c = stormCore.carrier;
      const targetShip = isTeamMode
        ? world.airships.find((a) => a.teamId === c.teamId)
        : world.airships.find((a) => a.ownerId === c.id);
      if (targetShip && c.pos.distanceTo(targetShip.pos) <= targetShip.deliveryRadius + 0.85) {
        c.score += 1;
        c.triggerEmote();
        sound.scoreFanfare();
        particles.emitScoreConfetti(targetShip.pos, targetShip.color);
        updateScoreboardUI();
        addChatMessage('SCORE!', `${c.name} delivered the Storm Core to ${targetShip.label}!`);
        showBanner('🏆', 'CORE DELIVERED!', `${c.name} scored +1 point!`, 3.0);

        if (isOvertime) {
          finishMatch();
          return;
        }
        stormCore.reset(world.coreSpawnPos);
      }
    }
  } else {
    // Online mode: update visuals + report local claim/steal/delivery intents to authoritative server
    stormCore.update(dt, elapsed, world, players, activeMutation, sound, false);

    if (canMove && !stormCore.carrier && localPlayer.stunTimer <= 0 && localPlayer.pos.distanceTo(stormCore.pos) < 2.2) {
      net.send({ type: 'claim_core' });
    }
    if (canMove && stormCore.carrier && stormCore.carrier.id !== localPlayer.id && stormCore.carrier.teamId !== localPlayer.teamId) {
      const stealRange = localPlayer.dashTimer > 0 ? 2.2 : 1.5;
      if (localPlayer.pos.distanceTo(stormCore.carrier.pos) < stealRange) {
        net.send({ type: 'steal_core' });
      }
    }
    if (localPlayer.hasCore) {
      const targetShip = isTeamMode
        ? world.airships.find((a) => a.teamId === localPlayer.teamId)
        : world.airships.find((a) => a.ownerId === localPlayer.id);
      if (targetShip && localPlayer.pos.distanceTo(targetShip.pos) <= targetShip.deliveryRadius + 0.85) {
        net.send({ type: 'deliver_core' });
      }
    }

    netSendTimer -= dt;
    if (netSendTimer <= 0) {
      netSendTimer = 0.05; // 20 Hz
      net.send({
        type: 'input_state',
        pos: { x: localPlayer.pos.x, y: localPlayer.pos.y, z: localPlayer.pos.z },
        vel: { x: localPlayer.vel.x, y: localPlayer.vel.y, z: localPlayer.vel.z },
        yaw: localPlayer.yaw,
        grappleActive: localPlayer.grappleActive,
        grappleTarget: { x: localPlayer.grappleTarget.x, y: localPlayer.grappleTarget.y, z: localPlayer.grappleTarget.z },
        emoteTimer: localPlayer.emoteTimer
      });
    }
  }

  gadgetMgr.update(dt, players, sound);
  players.forEach((p) => p.updateVisuals(dt, elapsed, settings.reducedMotion, world));

  // Camera follow + subtle dynamic FOV boost when grappling/dashing
  const targetFov = !settings.reducedMotion && (localPlayer.grappleActive || localPlayer.dashTimer > 0) ? 70 : 62;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 8));
    camera.updateProjectionMatrix();
  }

  const camDist = 11.8;
  const lookTarget = localPlayer.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
  const desiredCam = new THREE.Vector3(
    lookTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    lookTarget.y + Math.sin(camPitch) * camDist + 1.5,
    lookTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
  );
  if (shakeIntensity > 0 && !settings.reducedMotion) {
    desiredCam.x += (Math.random() - 0.5) * shakeIntensity;
    desiredCam.y += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity = Math.max(0, shakeIntensity - dt * 1.4);
  }
  const camLerp = settings.reducedMotion ? 1.0 : Math.min(1, dt * 12);
  camera.position.lerp(desiredCam, camLerp);
  camera.lookAt(lookTarget);

  // HUD Prompt Updates
  const grappleTarget = findBestGrapplePoint(localPlayer.pos, world.grapplePoints, 26, camForward);
  grapplePromptEl.classList.toggle('hidden', !grappleTarget || localPlayer.grappleActive);
  climbPromptEl.classList.toggle('hidden', localPlayer.climbTimer <= 0);

  if (localPlayer.dashCooldown <= 0) {
    hudDashCdEl.textContent = `READY [${formatKeyCode(keybinds.dash)}]`;
    hudDashCdEl.classList.remove('cooling');
  } else {
    hudDashCdEl.textContent = `${localPlayer.dashCooldown.toFixed(1)}s`;
    hudDashCdEl.classList.add('cooling');
  }

  if (localPlayer.gadgetCooldown <= 0) {
    hudGadgetCdEl.textContent = `READY [${formatKeyCode(keybinds.gadget)}]`;
    hudGadgetCdEl.classList.remove('cooling');
  } else {
    hudGadgetCdEl.textContent = `${localPlayer.gadgetCooldown.toFixed(1)}s`;
    hudGadgetCdEl.classList.add('cooling');
  }

  const carrierLabel = stormCore.carrier ? `Held by ${stormCore.carrier.name}` : 'Central / Loose';
  coreStatusTextEl.textContent = `Core: ${carrierLabel} • ${activeMutation.icon} ${activeMutation.name}`;

  updateMarkers(grappleTarget);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Scenic preview world behind lobby
world.build('ring', [
  { id: 'preview_0', teamId: 0, teamName: 'Azure', teamColor: '#2ec4ff', teamColorHex: 0x2ec4ff, shape: '▲' },
  { id: 'preview_1', teamId: 1, teamName: 'Crimson', teamColor: '#ff5268', teamColorHex: 0xff5268, shape: '●' },
  { id: 'preview_2', teamId: 2, teamName: 'Emerald', teamColor: '#38e39a', teamColorHex: 0x38e39a, shape: '■' }
], true);

initLobbyUI();
requestAnimationFrame(animate);
