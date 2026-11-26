import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BODY_TYPES,
  DEFAULT_LOADOUT,
  PLAYER_COLORS,
  QUALITY_PRESETS,
  SKIN_TONES,
  TEAMS,
  type ClothingLoadout,
  type GameMode,
  type QualityPreset,
  type TeamMode
} from '@shared/constants';
import { CLOTHING_CATALOG, validateLoadout } from '@shared/catalog';
import { IslandTerrainData } from '@shared/terrain';
import { generateTreasureHunt, type ClueNode, type TreasureHuntPlan } from '@shared/treasure';
import { loadCharacterAssets } from './assets/assetLoader';
import { ChunkedTerrain } from './world/terrainMesh';
import { WaterAndSkySystem } from './world/waterAndSky';
import { VegetationSystem } from './world/vegetation';
import { LandmarksSystem } from './world/landmarks';
import { WildlifeSystem } from './world/wildlife';
import { HumanoidCharacter } from './character/humanoidRig';
import { PlayerPhysicsController } from './character/playerController';
import { WardrobePreview } from './character/wardrobePreview';
import { TreasureWorldObjects } from './gameplay/treasureWorld';
import { PirateCombat, type CombatTarget } from './gameplay/combat';
import { PirateBotBrain } from './gameplay/botAi';
import { TreasureNetClient } from './net/netClient';
import { ProximityVoiceManager } from './net/voiceChat';
import { PirateAudioSystem } from './audio/soundSystem';
import { PostProcessPipeline } from './render/postProcess';
import { IslandMapRenderer } from './ui/mapCanvas';
import { MobileControls, detectTouchDevice } from './ui/mobile';

interface WorldActor {
  id: string;
  name: string;
  isBot: boolean;
  isRemote: boolean;
  teamId: number;
  berthIndex: number;
  char: HumanoidCharacter;
  controller: PlayerPhysicsController;
  botBrain?: PirateBotBrain;
  score: number;
  color: string;
  shape: string;
}

const DEFAULT_KEYS: Record<string, string> = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  interact: 'KeyE',
  attack: 'KeyF',
  shove: 'KeyX',
  cameraView: 'KeyV',
  map: 'KeyM',
  wardrobe: 'KeyC',
  emote: 'KeyG'
};

// --- DOM REFS ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingScreen = document.getElementById('loading-screen')!;
const loadingBar = document.getElementById('loading-bar')!;
const loadingStatus = document.getElementById('loading-status')!;
const webglFallback = document.getElementById('webgl-fallback')!;

const lobbyScreen = document.getElementById('lobby-screen')!;
const hud = document.getElementById('hud')!;
const resultsScreen = document.getElementById('results-screen')!;
const mapModal = document.getElementById('map-modal')!;
const wardrobeModal = document.getElementById('wardrobe-modal')!;
const tutorialModal = document.getElementById('tutorial-modal')!;
const settingsModal = document.getElementById('settings-modal')!;

const scoreboardEl = document.getElementById('scoreboard')!;
const compassHeadingEl = document.getElementById('compass-heading')!;
const compassPipEl = document.getElementById('compass-clue-pip')!;
const compassDistEl = document.getElementById('compass-dist')!;
const timerEl = document.getElementById('round-timer')!;
const modePillEl = document.getElementById('mode-pill')!;
const objTitleEl = document.getElementById('objective-title')!;
const objRiddleEl = document.getElementById('objective-riddle')!;
const wardrobeNearbyEl = document.getElementById('wardrobe-nearby-pill')!;
const interactPromptEl = document.getElementById('interact-prompt')!;
const invChestEl = document.getElementById('inv-chest')!;
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const fullMapCanvas = document.getElementById('full-map-canvas') as HTMLCanvasElement;
const journalListEl = document.getElementById('journal-list')!;
const bannerEl = document.getElementById('banner-alert')!;
const bannerIconEl = document.getElementById('banner-icon')!;
const bannerTitleEl = document.getElementById('banner-title')!;
const bannerDescEl = document.getElementById('banner-desc')!;
const chatLogEl = document.getElementById('chat-log')!;
const chatInputEl = document.getElementById('chat-input') as HTMLInputElement;
const hudChatWrapEl = document.getElementById('hud-chat-wrap')!;
const rotatePromptEl = document.getElementById('rotate-prompt')!;
const subtitleBoxEl = document.getElementById('subtitle-box')!;

// --- WEBGL CHECK & RENDERER ---
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  loadingScreen.classList.add('hidden');
  webglFallback.classList.remove('hidden');
  throw new Error('WebGL unsupported');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.25, 2400);
const postFx = new PostProcessPipeline(renderer, scene, camera);
const audio = new PirateAudioSystem();
audio.attachSubtitleEl(subtitleBoxEl);
const net = new TreasureNetClient();
const voice = new ProximityVoiceManager(net);
const combat = new PirateCombat();

// --- GLOBAL STATE ---
let baseGltf!: GLTF;
let clothingGltf!: GLTF;
let lobbyPreview: WardrobePreview | null = null;
let ingamePreview: WardrobePreview | null = null;

let terrainData!: IslandTerrainData;
let terrainMesh: ChunkedTerrain | null = null;
let waterSky!: WaterAndSkySystem;
let vegSys: VegetationSystem | null = null;
let landmarksSys: LandmarksSystem | null = null;
let wildlifeSys: WildlifeSystem | null = null;
let treasureObj: TreasureWorldObjects | null = null;
let mapRenderer: IslandMapRenderer | null = null;
let huntPlan: TreasureHuntPlan | null = null;

let activeLoadout: ClothingLoadout = loadSavedLoadout();
let keybinds: Record<string, string> = loadKeybinds();
let qualityPreset: QualityPreset = detectDefaultQuality();
let camSensitivity = 1.0;
let colorblindMode = false;
let reducedMotion = false;
let rotateDismissed = false;

let matchActive = false;
let isOnlineMatch = false;
let gameMode: GameMode = 'competitive';
let teamMode: TeamMode = 'solo';
let timeLeft = 900;
let actors: WorldActor[] = [];
let localActor: WorldActor | null = null;
let localClueStage = 0;
let activeClue: ClueNode | null = null;
let discoveredClues: ClueNode[] = [];

let camYaw = 0;
let camPitch = 0.28;
let elapsed = 0;
let stepAccum = 0;
let netSendAccum = 0;
let rebindingKey: string | null = null;

const keysDown = new Set<string>();
let jumpQueued = false;
let interactQueued = false;
let attackQueued = false;
let shoveQueued = false;
const emoteNames = ['emote_wave', 'emote_cheer', 'emote_dance', 'emote_bow'] as const;
let emoteIdx = 0;

function detectDefaultQuality(): QualityPreset {
  const isTouch = detectTouchDevice();
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (isTouch || (typeof mem === 'number' && mem <= 4)) return 'low';
  return 'medium';
}

function loadSavedLoadout(): ClothingLoadout {
  try {
    const raw = JSON.parse(localStorage.getItem('treasure_isle_loadout') || 'null');
    return validateLoadout(raw);
  } catch {
    return structuredClone(DEFAULT_LOADOUT);
  }
}

function saveLoadout(): void {
  localStorage.setItem('treasure_isle_loadout', JSON.stringify(activeLoadout));
}

function loadKeybinds(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem('treasure_isle_keys') || 'null');
    return raw ? { ...DEFAULT_KEYS, ...raw } : { ...DEFAULT_KEYS };
  } catch {
    return { ...DEFAULT_KEYS };
  }
}

function applyQualityPreset(preset: QualityPreset): void {
  qualityPreset = preset;
  const q = QUALITY_PRESETS[preset];
  const pr = Math.min(window.devicePixelRatio || 1, q.resolutionScale);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (waterSky) {
    waterSky.sunLight.castShadow = q.shadows;
    if (waterSky.sunLight.shadow.mapSize.x !== q.shadowMapSize) {
      waterSky.sunLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      waterSky.sunLight.shadow.map?.dispose();
      waterSky.sunLight.shadow.map = null;
    }
  }
  vegSys?.setDensity(q.vegDensity);
  postFx.configure(q, window.innerWidth, window.innerHeight);
}

// --- BUILD WORLD FROM SEED ---
function buildIslandWorld(seed: number, forMenuOnly = false): void {
  if (terrainMesh) { scene.remove(terrainMesh.group); terrainMesh.dispose(); terrainMesh = null; }
  if (vegSys) { scene.remove(vegSys.group); vegSys = null; }
  if (landmarksSys) { scene.remove(landmarksSys.group); landmarksSys = null; }
  if (wildlifeSys) { scene.remove(wildlifeSys.group); wildlifeSys = null; }
  if (treasureObj) { scene.remove(treasureObj.group); treasureObj = null; }

  terrainData = new IslandTerrainData(seed);
  terrainMesh = new ChunkedTerrain(terrainData);
  scene.add(terrainMesh.group);

  vegSys = new VegetationSystem(terrainData);
  vegSys.setDensity(QUALITY_PRESETS[qualityPreset].vegDensity);
  scene.add(vegSys.group);

  landmarksSys = new LandmarksSystem(terrainData);
  scene.add(landmarksSys.group);

  wildlifeSys = new WildlifeSystem(terrainData);
  scene.add(wildlifeSys.group);

  if (!forMenuOnly) {
    huntPlan = generateTreasureHunt(terrainData);
    treasureObj = new TreasureWorldObjects(huntPlan, terrainData);
    scene.add(treasureObj.group);
    mapRenderer = new IslandMapRenderer(terrainData);
  }
}

// --- WARDROBE UI BUILDER ---
function populateWardrobeUI(container: HTMLElement, onChanged: (l: ClothingLoadout) => void): void {
  container.innerHTML = '';

  // Preset Outfits
  const presetRow = document.createElement('div');
  presetRow.className = 'form-row';
  const pLabel = document.createElement('label');
  pLabel.textContent = 'Preset Outfit';
  const pSel = document.createElement('select');
  CLOTHING_CATALOG.presets.forEach((pr) => {
    const opt = document.createElement('option');
    opt.value = pr.id;
    opt.textContent = pr.name;
    if (activeLoadout.presetId === pr.id) opt.selected = true;
    pSel.appendChild(opt);
  });
  pSel.addEventListener('change', () => {
    const preset = CLOTHING_CATALOG.presets.find((p) => p.id === pSel.value);
    if (!preset) return;
    activeLoadout = validateLoadout({
      ...activeLoadout,
      presetId: preset.id,
      bodyType: preset.bodyType,
      slots: structuredClone(preset.slots)
    });
    saveLoadout();
    populateWardrobeUI(container, onChanged);
    onChanged(activeLoadout);
  });
  presetRow.append(pLabel, pSel);
  container.appendChild(presetRow);

  // Body Type + Beard + Face
  const bodyRow = document.createElement('div');
  bodyRow.className = 'form-row split';
  const bDiv = document.createElement('div');
  bDiv.innerHTML = '<label>Body Type</label>';
  const bSel = document.createElement('select');
  BODY_TYPES.forEach((b) => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.label;
    if (activeLoadout.bodyType === b.id) o.selected = true;
    bSel.appendChild(o);
  });
  bSel.addEventListener('change', () => {
    activeLoadout.bodyType = bSel.value;
    saveLoadout();
    onChanged(activeLoadout);
  });
  bDiv.appendChild(bSel);

  const fDiv = document.createElement('div');
  fDiv.innerHTML = '<label>Beard &amp; Brow</label>';
  const fSel = document.createElement('select');
  ['Clean Shaven', 'Stubble & Mustache', 'Full Pirate Beard'].forEach((lbl, idx) => {
    const o = document.createElement('option');
    o.value = String(idx);
    o.textContent = lbl;
    if (activeLoadout.beardStyle === idx) o.selected = true;
    fSel.appendChild(o);
  });
  fSel.addEventListener('change', () => {
    activeLoadout.beardStyle = Number(fSel.value);
    saveLoadout();
    onChanged(activeLoadout);
  });
  fDiv.appendChild(fSel);
  bodyRow.append(bDiv, fDiv);
  container.appendChild(bodyRow);

  // Skin Tone Swatches
  const skinLabel = document.createElement('label');
  skinLabel.textContent = 'Skin Tone';
  const swatches = document.createElement('div');
  swatches.className = 'swatch-row';
  SKIN_TONES.forEach((hex) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = `swatch ${activeLoadout.skinTone === hex ? 'selected' : ''}`;
    sw.style.background = hex;
    sw.addEventListener('click', () => {
      activeLoadout.skinTone = hex;
      swatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
      saveLoadout();
      onChanged(activeLoadout);
    });
    swatches.appendChild(sw);
  });
  container.append(skinLabel, swatches);

  // All 11 Modular Slots
  const slotNames: Record<keyof ClothingLoadout['slots'], string> = {
    hat: 'Hat',
    hair: 'Hair',
    faceItem: 'Face',
    coat: 'Coat',
    shirt: 'Shirt',
    pants: 'Pants',
    boots: 'Boots',
    belt: 'Belt',
    gloves: 'Gloves',
    backItem: 'Back',
    heldItem: 'Held'
  };

  (Object.keys(slotNames) as (keyof ClothingLoadout['slots'])[]).forEach((slotKey) => {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const lbl = document.createElement('span');
    lbl.textContent = slotNames[slotKey];

    const sel = document.createElement('select');
    CLOTHING_CATALOG.slots[slotKey].forEach((item) => {
      const o = document.createElement('option');
      o.value = item.id;
      o.textContent = item.label;
      if (activeLoadout.slots[slotKey].item === item.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      activeLoadout.slots[slotKey].item = sel.value;
      saveLoadout();
      onChanged(activeLoadout);
    });

    const colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.value = activeLoadout.slots[slotKey].tint;
    colorInp.addEventListener('input', () => {
      activeLoadout.slots[slotKey].tint = colorInp.value;
      saveLoadout();
      onChanged(activeLoadout);
    });

    row.append(lbl, sel, colorInp);
    container.appendChild(row);
  });
}

// --- MATCH LIFECYCLE ---
function clearActors(): void {
  actors.forEach((a) => scene.remove(a.char.root));
  actors = [];
  localActor = null;
}

function startOfflineMatch(): void {
  audio.ensureStarted();
  clearActors();
  isOnlineMatch = false;

  const name = (document.getElementById('player-name') as HTMLInputElement).value.trim() || "Cap'n Hawthorne";
  const rawSeed = parseInt((document.getElementById('island-seed') as HTMLInputElement).value, 10);
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? rawSeed : Math.floor(Math.random() * 899999 + 100000);
  gameMode = (document.getElementById('game-mode') as HTMLSelectElement).value as GameMode;
  teamMode = (document.getElementById('team-mode') as HTMLSelectElement).value as TeamMode;
  timeLeft = gameMode === 'explore' ? 0 : parseInt((document.getElementById('time-limit') as HTMLSelectElement).value, 10);
  const fillBots = (document.getElementById('bot-fill') as HTMLSelectElement).value === 'yes';

  buildIslandWorld(seed, false);

  const count = fillBots ? 9 : 1;
  const botNames = ['Barnacle [BOT]', 'Cutlass Kate [BOT]', 'Salty Sam [BOT]', 'Calico [BOT]', 'Reef Jack [BOT]', 'Vane [BOT]', 'Morgan [BOT]', 'Sparrow [BOT]'];
  const berths = landmarksSys!.shipBerths;

  for (let i = 0; i < count; i++) {
    const isHuman = i === 0;
    const preset = CLOTHING_CATALOG.presets[(i + 1) % CLOTHING_CATALOG.presets.length];
    const botLoadout = validateLoadout({
      bodyType: BODY_TYPES[i % BODY_TYPES.length].id,
      skinTone: SKIN_TONES[i % SKIN_TONES.length],
      beardStyle: i % 3,
      slots: preset.slots
    });

    const char = new HumanoidCharacter(baseGltf, clothingGltf, isHuman ? activeLoadout : botLoadout);
    const ctrl = new PlayerPhysicsController();
    const berth = berths[i % berths.length];
    ctrl.pos.copy(berth.pos).add(new THREE.Vector3(0, 1.0, -3));
    char.root.position.copy(ctrl.pos);
    scene.add(char.root);

    const teamId = gameMode === 'coop' ? 0 : teamMode === 'teams' ? i % 3 : i;
    const colorInfo = teamMode === 'teams' ? TEAMS[teamId % 3] : PLAYER_COLORS[i % PLAYER_COLORS.length];

    actors.push({
      id: `p_${i}`,
      name: isHuman ? name : botNames[i - 1],
      isBot: !isHuman,
      isRemote: false,
      teamId,
      berthIndex: i,
      char,
      controller: ctrl,
      botBrain: isHuman ? undefined : new PirateBotBrain(`p_${i}`, teamId, berth.pos),
      score: 0,
      color: colorInfo.color,
      shape: colorInfo.shape
    });
  }

  localActor = actors[0];
  localClueStage = 0;
  activeClue = huntPlan!.clues[0];
  discoveredClues = [activeClue];

  beginPlayHUD();
  addChatMessage('SYSTEM', `Landfall on Seed #${seed}! Follow your compass to Clue 1.`);
}

function startOnlineMatch(msg: any): void {
  audio.ensureStarted();
  clearActors();
  isOnlineMatch = true;

  const room = msg.room;
  gameMode = room.settings.mode;
  teamMode = room.settings.teamMode;
  timeLeft = gameMode === 'explore' ? 0 : room.settings.timeLimit;

  buildIslandWorld(msg.seed, false);
  const berths = landmarksSys!.shipBerths;

  room.players.forEach((rp: any, idx: number) => {
    const char = new HumanoidCharacter(baseGltf, clothingGltf, validateLoadout(rp.loadout));
    const ctrl = new PlayerPhysicsController();
    const berth = berths[(rp.berthIndex ?? idx) % berths.length];
    ctrl.pos.copy(berth.pos).add(new THREE.Vector3(0, 1.0, -3));
    char.root.position.copy(ctrl.pos);
    scene.add(char.root);

    const colorInfo = teamMode === 'teams' ? TEAMS[rp.teamId % 3] : PLAYER_COLORS[idx % PLAYER_COLORS.length];
    actors.push({
      id: rp.id,
      name: rp.name,
      isBot: !!rp.isBot,
      isRemote: rp.id !== net.playerId,
      teamId: rp.teamId,
      berthIndex: rp.berthIndex ?? idx,
      char,
      controller: ctrl,
      score: rp.score || 0,
      color: colorInfo.color,
      shape: colorInfo.shape
    });
  });

  localActor = actors.find((a) => a.id === net.playerId) || actors[0];
  localClueStage = msg.clueStage || 0;
  activeClue = msg.currentClue || msg.firstClue || huntPlan!.clues[0];
  discoveredClues = activeClue ? [activeClue] : [];

  beginPlayHUD();
  addChatMessage('SYSTEM', `Joined Online Expedition in Room ${room.code} (Seed #${msg.seed})!`);
}

function beginPlayHUD(): void {
  matchActive = true;
  rotateDismissed = false;
  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  if (mobileControls.enabled) hudChatWrapEl.classList.add('chat-collapsed');
  modePillEl.textContent = `${gameMode.toUpperCase()} • ${isOnlineMatch ? 'ONLINE' : 'BOTS'}`;

  syncPlayingLockState();
  updateClueUI();
  updateScoreboardUI();
  updateRotatePrompt();
}

function syncPlayingLockState(): void {
  const modalOpen =
    !mapModal.classList.contains('hidden') ||
    !wardrobeModal.classList.contains('hidden') ||
    !tutorialModal.classList.contains('hidden') ||
    !settingsModal.classList.contains('hidden');
  const active = matchActive && !modalOpen;
  document.body.classList.toggle('playing-active', active);
  mobileControls.setActive(active);
}

function updateRotatePrompt(): void {
  const show = mobileControls.enabled && matchActive && !rotateDismissed && window.innerHeight > window.innerWidth;
  rotatePromptEl.classList.toggle('hidden', !show);
}

function updateClueUI(): void {
  if (localActor?.controller.carryingChest) {
    objTitleEl.textContent = 'DELIVER TREASURE!';
    objRiddleEl.textContent = 'Carry the chest back to your Ship Berth before rivals steal it!';
  } else if (activeClue) {
    objTitleEl.textContent = `Clue ${Math.min(4, localClueStage + 1)}/4: ${activeClue.title}`;
    objRiddleEl.textContent = activeClue.riddle;
  } else {
    objTitleEl.textContent = 'X Marks the Spot!';
    objRiddleEl.textContent = 'Search near the carved X rock and press [E] to dig with your shovel!';
  }

  journalListEl.innerHTML = '';
  discoveredClues.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'journal-entry';
    div.innerHTML = `<strong>${escapeHtml(c.title)} (${escapeHtml(c.landmarkName)})</strong><br>${escapeHtml(c.riddle)}`;
    journalListEl.appendChild(div);
  });
}

function updateScoreboardUI(): void {
  scoreboardEl.innerHTML = '';
  const list = [...actors].sort((a, b) => b.score - a.score).slice(0, 5);
  if (localActor && !list.includes(localActor)) list.push(localActor);
  for (const a of list) {
    const chip = document.createElement('div');
    chip.className = `score-chip ${a === localActor ? 'me' : ''}`;
    const badge = colorblindMode ? `${a.shape} ` : '';
    chip.innerHTML = `<span class="score-dot" style="background:${a.color}"></span><span>${badge}${escapeHtml(a.name)}: ${a.score}</span>`;
    scoreboardEl.appendChild(chip);
  }
}

function showBanner(icon: string, title: string, desc: string, secs = 3.5): void {
  bannerIconEl.textContent = icon;
  bannerTitleEl.textContent = title;
  bannerDescEl.textContent = desc;
  bannerEl.classList.remove('hidden');
  window.clearTimeout((bannerEl as unknown as { _t?: number })._t);
  (bannerEl as unknown as { _t?: number })._t = window.setTimeout(() => bannerEl.classList.add('hidden'), secs * 1000);
}

function addChatMessage(sender: string, text: string): void {
  const div = document.createElement('div');
  div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
  chatLogEl.appendChild(div);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  while (chatLogEl.children.length > 30) chatLogEl.removeChild(chatLogEl.firstChild!);
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

function endMatch(winnerName: string, reason: string): void {
  matchActive = false;
  syncPlayingLockState();
  document.exitPointerLock?.();
  audio.playVictory();

  document.getElementById('results-winner-title')!.textContent = `${winnerName.toUpperCase()} WINS!`;
  document.getElementById('results-subtitle')!.textContent = reason;

  const podium = document.getElementById('results-podium')!;
  podium.innerHTML = '';
  [...actors].sort((a, b) => b.score - a.score).slice(0, 4).forEach((a, idx) => {
    const card = document.createElement('div');
    card.className = `podium-card ${idx === 0 ? 'winner' : ''}`;
    card.innerHTML = `<div style="font-size:1.3rem;font-weight:800;color:${a.color}">#${idx + 1} ${a.shape}</div><div>${escapeHtml(a.name)}</div><div style="font-weight:800;margin-top:4px">${a.score} Chest${a.score === 1 ? '' : 's'}</div>`;
    podium.appendChild(card);
  });

  hud.classList.add('hidden');
  resultsScreen.classList.remove('hidden');
}

function returnToLobby(): void {
  matchActive = false;
  syncPlayingLockState();
  document.exitPointerLock?.();
  clearActors();
  hud.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
}

// --- PLAYER ACTIONS (DIG, CLUE, ATTACK, WARDROBE) ---
function handleDigOrInteract(): void {
  if (!matchActive || !localActor || !treasureObj || !huntPlan) return;
  if (localActor.controller.knockedDownTimer > 0) return;

  const pPos = localActor.controller.pos;
  // 1. Clue inspection
  if (activeClue && pPos.distanceTo(new THREE.Vector3(activeClue.x, activeClue.y, activeClue.z)) <= 6.0) {
    if (isOnlineMatch) {
      net.send({ type: 'claim_clue' });
    } else {
      localClueStage += 1;
      activeClue = huntPlan.clues[localClueStage] || null;
      if (activeClue) discoveredClues.push(activeClue);
      audio.playClueFound();
      updateClueUI();
      showBanner('📜', 'CLUE UNLOCKED!', activeClue ? activeClue.riddle : 'Find the X rock and dig!', 4.2);
    }
    return;
  }

  // 2. Dig with shovel
  localActor.char.anim.playOneShot('dig', 0.1);
  if (isOnlineMatch) {
    net.send({ type: 'dig' });
    audio.playDig(false);
    return;
  }

  // Offline dropped chest pickup
  if (treasureObj.chestState === 'dropped' && pPos.distanceTo(treasureObj.chestPos) <= 4.2) {
    treasureObj.chestState = 'carried';
    treasureObj.carrierId = localActor.id;
    localActor.controller.carryingChest = true;
    audio.playChestOpen();
    updateClueUI();
    return;
  }

  // Offline buried chest dig
  if (treasureObj.chestState === 'buried') {
    const tVec = new THREE.Vector3(huntPlan.treasurePos.x, huntPlan.treasurePos.y, huntPlan.treasurePos.z);
    const d = pPos.distanceTo(tVec);
    terrainMesh?.addDigMound(pPos.x, terrainData.getHeight(pPos.x, pPos.z), pPos.z);

    if (d <= 5.5) {
      treasureObj.digProgress += 1;
      audio.playDig(true);
      if (treasureObj.digProgress >= 2) {
        treasureObj.chestState = 'carried';
        treasureObj.carrierId = localActor.id;
        localActor.controller.carryingChest = true;
        audio.playChestOpen();
        showBanner('💰', 'CHEST UNEARTHED!', 'Run back to your Ship Berth to win!', 4.5);
        updateClueUI();
      } else {
        showBanner('🪏', 'STRUCK WOOD!', 'Dig once more to unearth the chest!', 2.5);
      }
    } else {
      audio.playDig(false);
      showBanner('🪏', d < 18 ? 'WARM SOIL!' : 'EMPTY SAND', d < 18 ? 'Buried timber is very close...' : 'Keep following your compass!', 2.0);
    }
  }
}

function handleAttack(kind: 'slash' | 'shove'): void {
  if (!matchActive || !localActor || localActor.controller.knockedDownTimer > 0) return;
  if (kind === 'slash') localActor.char.anim.playOneShot('slash', 0.08);
  else localActor.char.anim.playOneShot('hit', 0.08);

  const targets: CombatTarget[] = actors.map((a) => ({
    id: a.id,
    teamId: a.teamId,
    pos: a.controller.pos,
    vel: a.controller.vel,
    carryingChest: a.controller.carryingChest,
    knockedDownTimer: a.controller.knockedDownTimer,
    hitStunTimer: a.controller.hitStunTimer,
    onHit: (hitKind, knockVec) => {
      if (isOnlineMatch) {
        net.send({ type: 'attack', kind: hitKind, targetId: a.id });
        return;
      }
      a.controller.vel.add(knockVec);
      if (hitKind === 'shove' || a.controller.carryingChest) {
        a.controller.knockedDownTimer = 2.0;
        a.char.anim.playOneShot('knockdown', 0.08);
        if (a.controller.carryingChest && treasureObj) {
          a.controller.carryingChest = false;
          treasureObj.chestState = 'dropped';
          treasureObj.carrierId = null;
          treasureObj.chestPos.copy(a.controller.pos);
          showBanner('⚔️', 'CHEST DROPPED!', `${localActor!.name} knocked the chest loose!`, 2.8);
        }
      } else {
        a.controller.hitStunTimer = 0.45;
        a.char.anim.playOneShot('hit', 0.08);
      }
    }
  }));

  const hit =
    kind === 'slash'
      ? combat.tryCutlassSwing(localActor.id, localActor.teamId, localActor.controller.pos, localActor.controller.yaw, targets)
      : combat.tryShoveKick(localActor.id, localActor.teamId, localActor.controller.pos, localActor.controller.yaw, targets);

  audio.playCutlass(Boolean(hit));
}

function toggleMapModal(): void {
  if (!matchActive) return;
  const hidden = mapModal.classList.toggle('hidden');
  if (!hidden) {
    document.exitPointerLock?.();
    if (mapRenderer && localActor && landmarksSys) {
      const berth = landmarksSys.shipBerths[localActor.berthIndex % landmarksSys.shipBerths.length];
      mapRenderer.draw(
        fullMapCanvas,
        localActor.controller.pos,
        localActor.controller.yaw,
        berth.pos,
        activeClue,
        treasureObj && treasureObj.chestState !== 'buried' ? treasureObj.chestPos : null,
        true
      );
    }
  }
  syncPlayingLockState();
}

function toggleWardrobeModal(): void {
  if (!matchActive || !localActor || !landmarksSys) return;
  const nearWardrobe = landmarksSys.wardrobePoints.some((w) => w.pos.distanceTo(localActor!.controller.pos) <= 10);
  if (!nearWardrobe && wardrobeModal.classList.contains('hidden')) {
    showBanner('👕', 'FIND A WARDROBE CHEST', 'Visit your Ship Dock or any Camp Chest to change outfits!', 2.8);
    return;
  }

  const opening = wardrobeModal.classList.contains('hidden');
  wardrobeModal.classList.toggle('hidden', !opening);
  if (opening) {
    document.exitPointerLock?.();
    const prevCanvas = document.getElementById('ingame-preview-canvas') as HTMLCanvasElement;
    if (!ingamePreview) {
      ingamePreview = new WardrobePreview(prevCanvas, baseGltf, clothingGltf, activeLoadout);
    } else {
      ingamePreview.setLoadout(activeLoadout);
      ingamePreview.resize();
    }
    populateWardrobeUI(document.getElementById('ingame-wardrobe-controls')!, (l) => {
      ingamePreview?.setLoadout(l);
      localActor?.char.applyLoadout(l);
      if (isOnlineMatch) net.send({ type: 'update_loadout', loadout: l });
    });
  }
  syncPlayingLockState();
}

// --- MOBILE CONTROLS ---
const mobileControls = new MobileControls({
  onJump: () => { if (matchActive) jumpQueued = true; },
  onDig: () => { if (matchActive) interactQueued = true; },
  onAttack: () => { if (matchActive) attackQueued = true; },
  onSprintToggle: () => {},
  onMap: toggleMapModal,
  onWardrobe: toggleWardrobeModal,
  onEmote: () => {
    if (!matchActive || !localActor) return;
    localActor.char.anim.playOneShot(emoteNames[emoteIdx % emoteNames.length], 0.12);
    emoteIdx++;
  },
  onCameraDelta: (dx, dy) => {
    if (!matchActive) return;
    camYaw -= dx * 0.005 * camSensitivity;
    camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004 * camSensitivity, -0.35, 1.1);
  }
});
document.body.classList.toggle('is-touch-device', mobileControls.enabled);

// --- MAIN LOOP ---
let lastNow = performance.now();
function animate(now: number): void {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  elapsed += dt;

  const focusPos = localActor ? localActor.controller.pos : new THREE.Vector3(0, 18, 0);
  const drawDist = QUALITY_PRESETS[qualityPreset].drawDistance;

  waterSky.update(dt, elapsed, focusPos, camera, drawDist);
  terrainMesh?.updateVisibility(camera, drawDist);
  vegSys?.update(elapsed, waterSky.weather.windStrength);
  landmarksSys?.update(elapsed);
  wildlifeSys?.update(elapsed);

  if (matchActive && localActor && terrainData && landmarksSys && treasureObj) {
    stepGameplay(dt);
  } else {
    // Cinematic island flyover behind Lobby
    const ang = elapsed * 0.06;
    const fx = Math.cos(ang) * 420;
    const fz = Math.sin(ang) * 420;
    const fy = Math.max(42, terrainData.getHeight(fx, fz) + 34);
    camera.position.set(fx, fy, fz);
    camera.lookAt(0, 12, 0);
  }

  postFx.render();
}

function stepGameplay(dt: number): void {
  if (!localActor || !landmarksSys || !treasureObj || !huntPlan) return;
  combat.update(dt);

  if (!isOnlineMatch && gameMode !== 'explore') {
    timeLeft = Math.max(0, timeLeft - dt);
    if (timeLeft <= 0) {
      endMatch(gameMode === 'coop' ? 'Time Expired!' : 'Draw at Sea', 'Expedition timer reached 00:00');
      return;
    }
  }

  // Gamepad polling
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps[0];
  let gpMoveX = 0;
  let gpMoveZ = 0;
  let gpSprint = false;
  if (gp) {
    gpMoveX = Math.abs(gp.axes[0]) > 0.16 ? gp.axes[0] : 0;
    gpMoveZ = Math.abs(gp.axes[1]) > 0.16 ? gp.axes[1] : 0;
    const rx = Math.abs(gp.axes[2]) > 0.18 ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3]) > 0.18 ? gp.axes[3] : 0;
    camYaw -= rx * 2.4 * camSensitivity * dt;
    camPitch = THREE.MathUtils.clamp(camPitch + ry * 1.6 * camSensitivity * dt, -0.35, 1.1);
    if (gp.buttons[0]?.pressed) jumpQueued = true;
    if (gp.buttons[2]?.pressed) interactQueued = true;
    if (gp.buttons[1]?.pressed) attackQueued = true;
    if (gp.buttons[4]?.pressed) gpSprint = true;
  }

  let moveX = gpMoveX + (mobileControls.enabled ? mobileControls.moveX : 0);
  let moveZ = gpMoveZ + (mobileControls.enabled ? mobileControls.moveY : 0);
  if (keysDown.has(keybinds.forward)) moveZ -= 1;
  if (keysDown.has(keybinds.backward)) moveZ += 1;
  if (keysDown.has(keybinds.left)) moveX -= 1;
  if (keysDown.has(keybinds.right)) moveX += 1;
  if (keysDown.has('ArrowLeft')) camYaw += 2.0 * camSensitivity * dt;
  if (keysDown.has('ArrowRight')) camYaw -= 2.0 * camSensitivity * dt;

  const sprint = keysDown.has(keybinds.sprint) || mobileControls.sprintToggled || gpSprint;

  if (interactQueued) handleDigOrInteract();
  if (attackQueued) handleAttack('slash');
  if (shoveQueued) handleAttack('shove');

  const stepRes = localActor.controller.step(
    dt,
    { moveX, moveZ, sprint, jumpPressed: jumpQueued, camYaw },
    terrainData,
    localActor.char,
    waterSky.weather.raining
  );

  jumpQueued = false;
  interactQueued = false;
  attackQueued = false;
  shoveQueued = false;

  if (stepRes.stepped) {
    stepAccum += dt * (sprint ? 3.2 : 2.2);
    if (stepAccum >= 1) {
      stepAccum = 0;
      audio.playFootstep(stepRes.surface);
    }
  }

  // Update Audio spatial ambient mix
  const shoreDist = Math.abs(Math.hypot(localActor.controller.pos.x, localActor.controller.pos.z) - 720);
  audio.updateAmbientMix(shoreDist, waterSky.weather.windStrength, localActor.controller.pos.y);

  // Step Bots (offline) or Remote Interpolation (online)
  const carrierActor = actors.find((a) => a.controller.carryingChest) || null;
  for (const a of actors) {
    if (a === localActor) continue;
    if (isOnlineMatch) {
      const snap = net.getInterpolatedPlayer(a.id);
      if (snap) {
        a.controller.pos.set(snap.pos.x, snap.pos.y, snap.pos.z);
        a.controller.yaw = snap.yaw;
        a.controller.carryingChest = snap.carryingChest;
        a.controller.knockedDownTimer = snap.knockedDownTimer;
        a.char.root.position.copy(a.controller.pos);
        a.char.root.rotation.y = a.controller.yaw;
        a.char.anim.setLocomotionState((snap.animState as any) || 'idle');
        a.char.anim.update(dt, terrainData, a.controller.pos, a.controller.yaw, true);
        if (voice.enabled) voice.updateProximityVolume(a.id, a.controller.pos.distanceTo(localActor.controller.pos));
      }
    } else if (a.botBrain) {
      const bi = a.botBrain.computeInput(
        dt,
        a.controller.pos,
        a.controller.carryingChest,
        huntPlan,
        treasureObj,
        carrierActor ? carrierActor.controller.pos : null,
        carrierActor ? carrierActor.teamId : null,
        terrainData
      );
      a.controller.step(dt, bi.input, terrainData, a.char, waterSky.weather.raining);

      if (bi.wantsDig) {
        if (treasureObj.chestState === 'dropped' && a.controller.pos.distanceTo(treasureObj.chestPos) < 3.5) {
          treasureObj.chestState = 'carried';
          treasureObj.carrierId = a.id;
          a.controller.carryingChest = true;
        } else if (treasureObj.chestState === 'buried' && a.controller.pos.distanceTo(new THREE.Vector3(huntPlan.treasurePos.x, huntPlan.treasurePos.y, huntPlan.treasurePos.z)) < 4.5) {
          treasureObj.digProgress += 1;
          if (treasureObj.digProgress >= 2) {
            treasureObj.chestState = 'carried';
            treasureObj.carrierId = a.id;
            a.controller.carryingChest = true;
            showBanner('⚠️', 'RIVAL UNEARTHED CHEST!', `${a.name} dug up the treasure! Intercept them!`, 4.0);
          }
        }
      }

      if (bi.wantsAttack && carrierActor && a.controller.pos.distanceTo(carrierActor.controller.pos) < 2.8) {
        a.char.anim.playOneShot('slash', 0.08);
        carrierActor.controller.carryingChest = false;
        carrierActor.controller.knockedDownTimer = 1.8;
        carrierActor.char.anim.playOneShot('knockdown', 0.08);
        treasureObj.chestState = 'dropped';
        treasureObj.carrierId = null;
        treasureObj.chestPos.copy(carrierActor.controller.pos);
      }

      if (a.controller.carryingChest) {
        const berth = landmarksSys.shipBerths[a.berthIndex % landmarksSys.shipBerths.length];
        if (a.controller.pos.distanceTo(berth.pos) <= berth.deliveryRadius) {
          a.score += 1;
          treasureObj.chestState = 'delivered';
          endMatch(a.name, 'Bot rival delivered the buried treasure to their ship!');
          return;
        }
      }
    }
  }

  // Local Chest Delivery Check
  const myBerth = landmarksSys.shipBerths[localActor.berthIndex % landmarksSys.shipBerths.length];
  if (localActor.controller.carryingChest && localActor.controller.pos.distanceTo(myBerth.pos) <= myBerth.deliveryRadius) {
    if (isOnlineMatch) {
      net.send({ type: 'deliver_chest' });
    } else {
      localActor.score += 1;
      treasureObj.chestState = 'delivered';
      endMatch(localActor.name, 'Delivered the buried treasure to your ship!');
      return;
    }
  }

  // Online 20Hz state upload
  if (isOnlineMatch) {
    netSendAccum += dt;
    if (netSendAccum >= 0.05) {
      netSendAccum = 0;
      net.send({
        type: 'input_state',
        pos: { x: localActor.controller.pos.x, y: localActor.controller.pos.y, z: localActor.controller.pos.z },
        vel: { x: localActor.controller.vel.x, y: localActor.controller.vel.y, z: localActor.controller.vel.z },
        yaw: localActor.controller.yaw,
        animState: localActor.char.anim.currentState
      });
    }
  }

  // Visual updates: chest & clues
  const curCarrier = actors.find((a) => a.id === treasureObj!.carrierId);
  treasureObj.updateVisuals(elapsed, localClueStage, curCarrier?.controller.pos, curCarrier?.controller.yaw || 0);

  // Camera update
  localActor.controller.updateCamera(camera, camYaw, camPitch, terrainData, localActor.char, dt);

  // HUD Updates: Compass, Timer, Minimap, Prompts
  invChestEl.classList.toggle('hidden', !localActor.controller.carryingChest);
  const nearWardrobe = landmarksSys.wardrobePoints.some((w) => w.pos.distanceTo(localActor!.controller.pos) <= 10);
  wardrobeNearbyEl.classList.toggle('hidden', !nearWardrobe);

  const nearClue = activeClue && localActor.controller.pos.distanceTo(new THREE.Vector3(activeClue.x, activeClue.y, activeClue.z)) <= 6.0;
  interactPromptEl.classList.toggle('hidden', !nearClue && !localActor.controller.grounded);
  interactPromptEl.textContent = nearClue ? '[E] Inspect Clue' : '[E] Dig with Shovel';

  // Compass bearing to next clue (or ship if carrying chest!)
  const compassTarget = localActor.controller.carryingChest ? myBerth.pos : activeClue ? new THREE.Vector3(activeClue.x, activeClue.y, activeClue.z) : null;
  const headingDeg = (((-camYaw * 180) / Math.PI) % 360 + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  compassHeadingEl.textContent = dirs[Math.round(headingDeg / 45) % 8];

  if (compassTarget) {
    const dx = compassTarget.x - localActor.controller.pos.x;
    const dz = compassTarget.z - localActor.controller.pos.z;
    compassDistEl.textContent = `${Math.round(Math.hypot(dx, dz))}m`;
    const targetAng = Math.atan2(dx, -dz);
    let rel = targetAng - ((-camYaw) % (Math.PI * 2));
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const pct = THREE.MathUtils.clamp(50 + (rel / Math.PI) * 50, 6, 94);
    compassPipEl.style.left = `${pct}%`;
  } else {
    compassDistEl.textContent = 'NEARBY';
    compassPipEl.style.left = '50%';
  }

  if (gameMode === 'explore') {
    timerEl.textContent = 'FREE EXPLORE';
  } else {
    const m = Math.floor(timeLeft / 60);
    const s = Math.floor(timeLeft % 60);
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (mapRenderer) {
    mapRenderer.revealAround(localActor.controller.pos.x, localActor.controller.pos.z, 145);
    mapRenderer.draw(
      minimapCanvas,
      localActor.controller.pos,
      localActor.controller.yaw,
      myBerth.pos,
      activeClue,
      treasureObj.chestState !== 'buried' ? treasureObj.chestPos : null,
      false
    );
  }
}

// --- INPUT & UI EVENTS ---
function bindAllUI(): void {
  const tabOff = document.getElementById('tab-offline')!;
  const tabOn = document.getElementById('tab-online')!;
  const onPanel = document.getElementById('online-panel')!;
  const startOffBtn = document.getElementById('btn-start-offline')!;

  tabOff.addEventListener('click', () => {
    tabOff.classList.add('active');
    tabOn.classList.remove('active');
    onPanel.classList.add('hidden');
    startOffBtn.classList.remove('hidden');
  });
  tabOn.addEventListener('click', () => {
    tabOn.classList.add('active');
    tabOff.classList.remove('active');
    onPanel.classList.remove('hidden');
    startOffBtn.classList.add('hidden');
  });

  const wsUrlInput = document.getElementById('ws-url-input') as HTMLInputElement;
  wsUrlInput.value = import.meta.env.VITE_WS_URL || (location.protocol === 'https:' ? '' : 'ws://localhost:8080');

  try {
    const saved = JSON.parse(sessionStorage.getItem('treasure_isle_session') || 'null');
    if (saved?.roomCode && saved?.token) {
      document.getElementById('btn-rejoin-saved')!.classList.remove('hidden');
      (document.getElementById('join-code-input') as HTMLInputElement).value = saved.roomCode;
    }
  } catch {}

  const gatherMeta = () => ({
    name: (document.getElementById('player-name') as HTMLInputElement).value.trim() || "Cap'n Hawthorne",
    loadout: activeLoadout,
    settings: {
      mode: (document.getElementById('game-mode') as HTMLSelectElement).value,
      teamMode: (document.getElementById('team-mode') as HTMLSelectElement).value,
      timeLimit: parseInt((document.getElementById('time-limit') as HTMLSelectElement).value, 10),
      seed: parseInt((document.getElementById('island-seed') as HTMLInputElement).value, 10) || 424242,
      fillBots: (document.getElementById('bot-fill') as HTMLSelectElement).value === 'yes'
    }
  });

  const ensureWs = async () => {
    const url = wsUrlInput.value.trim();
    if (!url) throw new Error('Enter ws:// or wss:// server URL.');
    if (net.status === 'connected') return;
    await net.connect(url);
    const badge = document.getElementById('ws-status-badge')!;
    badge.textContent = 'CONNECTED';
    badge.classList.add('ok');
  };

  document.getElementById('btn-create-room')!.addEventListener('click', async () => {
    try {
      await ensureWs();
      net.send({ type: 'create_room', ...gatherMeta() });
    } catch (e: any) {
      document.getElementById('online-helper-text')!.textContent = e.message;
    }
  });

  document.getElementById('btn-join-room')!.addEventListener('click', async () => {
    const code = (document.getElementById('join-code-input') as HTMLInputElement).value.trim().toUpperCase();
    if (!code) return;
    try {
      await ensureWs();
      net.send({ type: 'join_room', roomCode: code, ...gatherMeta() });
    } catch (e: any) {
      document.getElementById('online-helper-text')!.textContent = e.message;
    }
  });

  document.getElementById('btn-rejoin-saved')!.addEventListener('click', async () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('treasure_isle_session') || 'null');
      if (!saved) return;
      await ensureWs();
      net.send({ type: 'join_room', roomCode: saved.roomCode, token: saved.token, ...gatherMeta() });
    } catch (e: any) {
      document.getElementById('online-helper-text')!.textContent = e.message;
    }
  });

  document.getElementById('btn-online-start')!.addEventListener('click', () => {
    net.send({ type: 'update_settings', settings: gatherMeta().settings });
    net.send({ type: 'start_match' });
  });

  document.getElementById('btn-copy-code')!.addEventListener('click', () => {
    navigator.clipboard?.writeText(document.getElementById('active-room-code')!.textContent || '').catch(() => {});
  });

  // Net handlers
  const renderRoster = (room: any) => {
    document.getElementById('online-roster-box')!.classList.remove('hidden');
    document.getElementById('active-room-code')!.textContent = room.code;
    const rl = document.getElementById('roster-list')!;
    rl.innerHTML = '';
    room.players.forEach((p: any) => {
      const c = document.createElement('div');
      c.className = 'roster-chip';
      c.textContent = `${p.id === room.hostId ? '👑 ' : ''}${p.name}`;
      rl.appendChild(c);
    });
    document.getElementById('btn-online-start')!.classList.toggle('hidden', room.hostId !== net.playerId);
  };

  net.on('joined_room', (msg) => {
    renderRoster(msg.room);
    if (msg.rejoined && msg.room.phase === 'playing') startOnlineMatch(msg);
  });
  net.on('room_update', (msg) => renderRoster(msg.room));
  net.on('match_started', (msg) => startOnlineMatch(msg));
  net.on('chat', (msg) => addChatMessage(msg.sender, msg.text));
  net.on('correct_pos', (msg) => {
    if (localActor && msg.pos) localActor.controller.pos.set(msg.pos.x, msg.pos.y, msg.pos.z);
  });
  net.on('clue_unlocked', (msg) => {
    localClueStage = msg.clueStage;
    activeClue = msg.nextClue;
    if (activeClue) discoveredClues.push(activeClue);
    audio.playClueFound();
    updateClueUI();
    showBanner('📜', 'CLUE UNLOCKED!', activeClue ? activeClue.riddle : 'Dig near the carved X rock!', 4.0);
  });
  net.on('dig_feedback', (msg) => showBanner('🪏', 'SHOVEL', msg.message, 2.5));
  net.on('event', (msg) => {
    if (!treasureObj) return;
    if (msg.kind === 'dig_mound' && msg.pos) {
      terrainMesh?.addDigMound(msg.pos.x, terrainData.getHeight(msg.pos.x, msg.pos.z), msg.pos.z);
    } else if (msg.kind === 'chest_unearthed' || msg.kind === 'chest_picked') {
      treasureObj.chestState = 'carried';
      treasureObj.carrierId = msg.playerId;
      actors.forEach((a) => (a.controller.carryingChest = a.id === msg.playerId));
      audio.playChestOpen();
      updateClueUI();
      showBanner('💰', 'CHEST UNEARTHED!', `${msg.name} has the treasure!`, 4.0);
    } else if (msg.kind === 'chest_dropped') {
      treasureObj.chestState = 'dropped';
      treasureObj.carrierId = null;
      if (msg.pos) treasureObj.chestPos.set(msg.pos.x, msg.pos.y, msg.pos.z);
      actors.forEach((a) => (a.controller.carryingChest = false));
      updateClueUI();
    }
  });
  net.on('hit_received', (msg) => {
    if (!localActor) return;
    localActor.controller.knockedDownTimer = msg.kind === 'shove' ? 2.0 : 0.6;
    localActor.char.anim.playOneShot(msg.kind === 'shove' ? 'knockdown' : 'hit', 0.08);
  });
  net.on('match_ended', (msg) => endMatch(msg.winnerName, msg.reason));

  // Buttons
  startOffBtn.addEventListener('click', startOfflineMatch);
  document.getElementById('btn-play-again')!.addEventListener('click', () => {
    resultsScreen.classList.add('hidden');
    if (isOnlineMatch && net.room?.hostId === net.playerId) net.send({ type: 'start_match' });
    else if (!isOnlineMatch) startOfflineMatch();
    else returnToLobby();
  });
  document.getElementById('btn-back-lobby')!.addEventListener('click', returnToLobby);
  document.getElementById('btn-hud-leave')!.addEventListener('click', () => {
    if (isOnlineMatch) net.close();
    returnToLobby();
  });
  document.getElementById('btn-hud-map')!.addEventListener('click', toggleMapModal);
  document.getElementById('btn-close-map')!.addEventListener('click', toggleMapModal);
  document.getElementById('minimap-wrap')!.addEventListener('click', toggleMapModal);
  document.getElementById('btn-hud-wardrobe')!.addEventListener('click', toggleWardrobeModal);
  document.getElementById('btn-close-wardrobe')!.addEventListener('click', toggleWardrobeModal);
  document.getElementById('btn-hud-chat')!.addEventListener('click', () => hudChatWrapEl.classList.toggle('chat-collapsed'));
  document.getElementById('btn-dismiss-rotate')!.addEventListener('click', () => {
    rotateDismissed = true;
    rotatePromptEl.classList.add('hidden');
  });

  document.getElementById('btn-open-tutorial')!.addEventListener('click', () => { tutorialModal.classList.remove('hidden'); syncPlayingLockState(); });
  document.getElementById('btn-close-tutorial')!.addEventListener('click', () => { tutorialModal.classList.add('hidden'); syncPlayingLockState(); });
  document.getElementById('btn-open-settings')!.addEventListener('click', () => { settingsModal.classList.remove('hidden'); renderKeys(); syncPlayingLockState(); });
  document.getElementById('btn-hud-settings')!.addEventListener('click', () => { document.exitPointerLock?.(); settingsModal.classList.remove('hidden'); renderKeys(); syncPlayingLockState(); });
  document.getElementById('btn-close-settings')!.addEventListener('click', () => { settingsModal.classList.add('hidden'); syncPlayingLockState(); });

  document.getElementById('btn-cam-toggle')!.addEventListener('click', () => {
    if (localActor) localActor.controller.firstPerson = !localActor.controller.firstPerson;
  });
  document.getElementById('btn-emote-cycle')!.addEventListener('click', () => {
    if (!localActor) return;
    localActor.char.anim.playOneShot(emoteNames[emoteIdx % emoteNames.length], 0.12);
    emoteIdx++;
  });

  const sfxBtn = document.getElementById('btn-sfx-toggle')!;
  sfxBtn.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    sfxBtn.textContent = audio.enabled ? '🔊 Audio: On' : '🔇 Audio: Off';
  });

  const voiceBtn = document.getElementById('btn-voice-toggle')!;
  voiceBtn.addEventListener('click', async () => {
    if (!isOnlineMatch) {
      showBanner('🎙', 'VOICE CHAT', 'Proximity voice requires an Online Private Room.', 2.5);
      return;
    }
    try {
      const on = await voice.toggle();
      voiceBtn.textContent = on ? '🎙 Voice: On' : '🎙 Voice: Off';
      if (on) {
        for (const a of actors) {
          if (a !== localActor && !a.isBot) voice.connectToPeer(a.id).catch(() => {});
        }
      }
    } catch {
      showBanner('🎙', 'MIC DENIED', 'Grant microphone permission for proximity voice.', 2.5);
    }
  });

  document.getElementById('chat-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = chatInputEl.value.trim();
    if (txt && localActor) {
      if (isOnlineMatch) net.send({ type: 'chat', text: txt });
      else addChatMessage(localActor.name, txt);
      chatInputEl.value = '';
    }
    chatInputEl.blur();
  });

  // Settings bindings
  const qSel = document.getElementById('opt-quality') as HTMLSelectElement;
  qSel.value = qualityPreset;
  qSel.addEventListener('change', () => applyQualityPreset(qSel.value as QualityPreset));

  const sensInp = document.getElementById('opt-sensitivity') as HTMLInputElement;
  sensInp.addEventListener('input', () => {
    camSensitivity = parseFloat(sensInp.value);
    document.getElementById('sens-val')!.textContent = `${camSensitivity.toFixed(1)}x`;
  });

  const joySel = document.getElementById('opt-joystick-size') as HTMLSelectElement;
  joySel.addEventListener('change', () => {
    mobileControls.joystickSize = joySel.value as 'small' | 'medium' | 'large';
    mobileControls.applySettings();
  });

  const opInp = document.getElementById('opt-btn-opacity') as HTMLInputElement;
  opInp.addEventListener('input', () => {
    mobileControls.buttonOpacity = parseFloat(opInp.value);
    mobileControls.applySettings();
    document.getElementById('opacity-val')!.textContent = `${Math.round(mobileControls.buttonOpacity * 100)}%`;
  });

  (document.getElementById('opt-subtitles') as HTMLInputElement).addEventListener('change', (e) => {
    audio.subtitlesEnabled = (e.target as HTMLInputElement).checked;
  });
  (document.getElementById('opt-colorblind') as HTMLInputElement).addEventListener('change', (e) => {
    colorblindMode = (e.target as HTMLInputElement).checked;
    updateScoreboardUI();
  });
  (document.getElementById('opt-reduced-motion') as HTMLInputElement).addEventListener('change', (e) => {
    reducedMotion = (e.target as HTMLInputElement).checked;
    document.body.classList.toggle('reduced-motion', reducedMotion);
  });
  (document.getElementById('opt-music') as HTMLInputElement).addEventListener('change', (e) => {
    audio.musicEnabled = (e.target as HTMLInputElement).checked;
  });
  (document.getElementById('opt-volume') as HTMLInputElement).addEventListener('input', (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    audio.setVolume(v);
    document.getElementById('vol-val')!.textContent = `${Math.round(v * 100)}%`;
  });
  document.getElementById('btn-reset-keys')!.addEventListener('click', () => {
    keybinds = { ...DEFAULT_KEYS };
    localStorage.setItem('treasure_isle_keys', JSON.stringify(keybinds));
    renderKeys();
  });
}

function renderKeys(): void {
  const list = document.getElementById('keybind-list')!;
  list.innerHTML = '';
  Object.entries(keybinds).forEach(([action, code]) => {
    const row = document.createElement('div');
    row.className = 'keybind-item';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keybind-btn';
    btn.textContent = rebindingKey === action ? 'Press Key...' : code.replace('Key', '');
    btn.addEventListener('click', () => {
      rebindingKey = action;
      renderKeys();
    });
    row.innerHTML = `<span>${action}</span>`;
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// Desktop Keyboard / Mouse listeners
window.addEventListener('keydown', (e) => {
  if (rebindingKey) {
    e.preventDefault();
    keybinds[rebindingKey] = e.code;
    rebindingKey = null;
    localStorage.setItem('treasure_isle_keys', JSON.stringify(keybinds));
    renderKeys();
    return;
  }
  if (document.activeElement === chatInputEl || document.activeElement?.tagName === 'INPUT') return;
  if ((e.code === 'KeyT' || e.code === 'Enter') && matchActive) {
    e.preventDefault();
    chatInputEl.focus();
    return;
  }
  if (!keysDown.has(e.code)) {
    if (e.code === keybinds.jump) jumpQueued = true;
    if (e.code === keybinds.interact) interactQueued = true;
    if (e.code === keybinds.attack) attackQueued = true;
    if (e.code === keybinds.shove) shoveQueued = true;
    if (e.code === keybinds.cameraView && localActor) localActor.controller.firstPerson = !localActor.controller.firstPerson;
    if (e.code === keybinds.map) toggleMapModal();
    if (e.code === keybinds.wardrobe) toggleWardrobeModal();
    if (e.code === keybinds.emote && localActor) {
      localActor.char.anim.playOneShot(emoteNames[emoteIdx % emoteNames.length], 0.12);
      emoteIdx++;
    }
  }
  keysDown.add(e.code);
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

canvas.addEventListener('click', () => {
  if (matchActive && !mobileControls.enabled && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (!matchActive || mobileControls.enabled) return;
  if (e.button === 0 && document.pointerLockElement === canvas) attackQueued = true;
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && matchActive) {
    camYaw -= e.movementX * 0.0026 * camSensitivity;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0022 * camSensitivity, -0.35, 1.1);
  }
});

function handleResize(): void {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  applyQualityPreset(qualityPreset);
  lobbyPreview?.resize();
  ingamePreview?.resize();
  updateRotatePrompt();
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));

// --- BOOTSTRAP ---
async function boot(): Promise<void> {
  loadingBar.style.width = '25%';
  waterSky = new WaterAndSkySystem(scene);
  applyQualityPreset(qualityPreset);

  loadingStatus.textContent = 'Loading rigged humanoid & modular clothing GLBs...';
  loadingBar.style.width = '55%';
  const assets = await loadCharacterAssets(renderer);
  baseGltf = assets.baseGltf;
  clothingGltf = assets.clothingGltf;

  loadingStatus.textContent = 'Generating 2 km × 2 km tropical island...';
  loadingBar.style.width = '85%';
  buildIslandWorld(424242, true);

  lobbyPreview = new WardrobePreview(
    document.getElementById('lobby-preview-canvas') as HTMLCanvasElement,
    baseGltf,
    clothingGltf,
    activeLoadout
  );
  populateWardrobeUI(document.getElementById('lobby-wardrobe-controls')!, (l) => lobbyPreview?.setLoadout(l));

  bindAllUI();
  loadingBar.style.width = '100%';
  loadingScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  requestAnimationFrame(animate);
}

boot().catch((err) => {
  loadingStatus.textContent = `Startup failed: ${err?.message || err}`;
  console.error(err);
});
