export const GADGETS = {
  smoke: {
    id: 'smoke',
    name: 'Smoke Bomb',
    icon: '💨',
    cooldown: 9,
    desc: 'Drops a concealing cloud + quick getaway hop.'
  },
  spring: {
    id: 'spring',
    name: 'Spring Mine',
    icon: '🌀',
    cooldown: 10,
    desc: 'Places a launch pad that blasts rivals skyward.'
  },
  shield: {
    id: 'shield',
    name: 'Shield Bubble',
    icon: '🛡️',
    cooldown: 12,
    desc: '3.5s dome blocking knockback, lightning & pulls.'
  },
  pull: {
    id: 'pull',
    name: 'Short-Range Pull',
    icon: '🪝',
    cooldown: 8,
    desc: 'Yanks nearby rivals back or shakes loose the core!'
  }
};

export const ROUND_MODIFIERS = [
  { id: 'normal', name: 'Fair Winds', icon: '⛵', desc: 'Balanced winds, lightning, and ruins.' },
  { id: 'gale', name: 'Gale Winds', icon: '🌬️', desc: 'Extra wind tunnels & stronger updrafts!' },
  { id: 'thunderhead', name: 'Thunderhead', icon: '⛈️', desc: 'More frequent lightning zones across the sky!' },
  { id: 'fragile', name: 'Fragile Ruins', icon: '🪨', desc: 'Extra crumbling shortcuts — watch your step!' }
];

export const MAP_LAYOUTS = [
  { id: 'random', name: 'Randomize Round' },
  { id: 'ring', name: 'Archipelago Ring' },
  { id: 'peaks', name: 'Twin Peaks' },
  { id: 'gauntlet', name: 'Sky Gauntlet' },
  { id: 'caldera', name: 'Storm Caldera' }
];

export const COSMETIC_COLORS = [
  { name: 'Sky Azure', hex: '#2ec4ff' },
  { name: 'Coral Red', hex: '#ff5268' },
  { name: 'Emerald Mint', hex: '#38e39a' },
  { name: 'Sunburst Gold', hex: '#ffc833' },
  { name: 'Violet Storm', hex: '#a46bff' },
  { name: 'Tangerine', hex: '#ff823a' }
];

export const TEAMS = [
  { id: 0, name: 'Azure Corsairs', color: '#2ec4ff', hexNum: 0x2ec4ff, shape: '▲' },
  { id: 1, name: 'Crimson Raiders', color: '#ff5268', hexNum: 0xff5268, shape: '●' },
  { id: 2, name: 'Emerald Buccaneers', color: '#38e39a', hexNum: 0x38e39a, shape: '■' }
];

export const SOLO_COLORS = [
  { color: '#2ec4ff', hexNum: 0x2ec4ff, shape: '▲' },
  { color: '#ff5268', hexNum: 0xff5268, shape: '●' },
  { color: '#38e39a', hexNum: 0x38e39a, shape: '■' },
  { color: '#ffc833', hexNum: 0xffc833, shape: '◆' },
  { color: '#a46bff', hexNum: 0xa46bff, shape: '★' },
  { color: '#ff823a', hexNum: 0xff823a, shape: '✚' },
  { color: '#ff70d8', hexNum: 0xff70d8, shape: '✦' },
  { color: '#7df9ff', hexNum: 0x7df9ff, shape: '▼' },
  { color: '#c4f54c', hexNum: 0xc4f54c, shape: '⬢' }
];

export const CORE_MUTATIONS = [
  {
    id: 'standard',
    name: 'Standard Storm Core',
    icon: '💎',
    colorHex: 0x38e5ff,
    desc: 'Heavy core: -12% sprint speed, bright sky beacon.',
    speedMult: 0.88,
    gravityMult: 1.0,
    bouncy: false,
    lightningMagnet: false,
    decoys: false
  },
  {
    id: 'floaty',
    name: 'Floaty Helium Aura',
    icon: '🎈',
    colorHex: 0x9bffd0,
    desc: 'Carrier floats in low gravity! Huge jumps, wild wind drift.',
    speedMult: 0.96,
    gravityMult: 0.52,
    bouncy: false,
    lightningMagnet: false,
    decoys: false
  },
  {
    id: 'bouncy',
    name: 'Super Bouncy Core',
    icon: '🏀',
    colorHex: 0xffaa33,
    desc: 'Boing! Carrier bounces on every landing for chaotic escapes.',
    speedMult: 0.95,
    gravityMult: 0.95,
    bouncy: true,
    lightningMagnet: false,
    decoys: false
  },
  {
    id: 'lightning',
    name: 'Lightning Magnet',
    icon: '⚡',
    colorHex: 0xffe44d,
    desc: 'Telegraphed sky bolts crackle around the carrier every few seconds!',
    speedMult: 1.05,
    gravityMult: 1.0,
    bouncy: false,
    lightningMagnet: true,
    decoys: false
  },
  {
    id: 'decoy',
    name: 'Decoy Split',
    icon: '🎭',
    colorHex: 0xd18bff,
    desc: 'Two fake Storm Cores orbit nearby to bluff and confuse chasers!',
    speedMult: 0.93,
    gravityMult: 1.0,
    bouncy: false,
    lightningMagnet: false,
    decoys: true
  }
];

export const BOT_NAMES = [
  'Barnacle [BOT]',
  'Pip Squeak [BOT]',
  'Salty Peg [BOT]',
  'Gale Force [BOT]',
  'Biscuit [BOT]',
  'Hookshot [BOT]',
  'Plankwalker [BOT]',
  'Nimbus Ned [BOT]',
  'Starboard [BOT]'
];

export const DEFAULT_KEYBINDS = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  grapple: 'KeyE',
  dash: 'ShiftLeft',
  gadget: 'KeyQ',
  emote: 'KeyG',
  respawn: 'KeyR'
};

export const COSMETIC_REWARDS = [
  'Unlocked Emote: Barrel Roll Cheer!',
  'Unlocked Hat Trim: Golden Compass!',
  'Unlocked Victory Pose: Skyhook Salute!',
  'Unlocked Hat: Storm-Chaser Goggles!',
  'Unlocked Scarf Pattern: Cloudburst Stripes!'
];
