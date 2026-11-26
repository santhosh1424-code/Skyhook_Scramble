export const WORLD_SIZE = 2000; // 2 km x 2 km island bounds (-1000..1000)
export const HALF_WORLD = WORLD_SIZE / 2;
export const CHUNK_SIZE = 125; // 16 x 16 chunks = 2000m
export const WATER_LEVEL = 0;
export const MAX_PLAYERS = 9;
export const TICK_RATE_HZ = 20;
export const REJOIN_GRACE_MS = 60_000;

export const MOVE_SPEEDS = {
  walk: 3.6,
  run: 5.8,
  sprint: 8.3,
  swim: 4.1,
  wade: 3.4,
  carryMult: 0.78
} as const;

export type GameMode = 'competitive' | 'coop' | 'explore';
export type TeamMode = 'solo' | 'teams';
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type ConcreteQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityConfig {
  resolutionScale: number;
  shadows: boolean;
  shadowMapSize: number;
  drawDistance: number;
  vegDensity: number; // 0.25 .. 1.0
  postProcess: boolean; // Only High & Ultra
  ssao: boolean;
  wetnessShader: boolean; // Disabled on Low
  footIK: boolean; // Desktop-only (disabled on Low/Mobile)
}

export const QUALITY_PRESETS: Record<ConcreteQuality, QualityConfig> = {
  low: {
    resolutionScale: 0.75,
    shadows: false,
    shadowMapSize: 512,
    drawDistance: 440,
    vegDensity: 0.3,
    postProcess: false,
    ssao: false,
    wetnessShader: false,
    footIK: false
  },
  medium: {
    resolutionScale: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    drawDistance: 700,
    vegDensity: 0.6,
    postProcess: false,
    ssao: false,
    wetnessShader: true,
    footIK: true
  },
  high: {
    resolutionScale: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    drawDistance: 980,
    vegDensity: 0.85,
    postProcess: true,
    ssao: false,
    wetnessShader: true,
    footIK: true
  },
  ultra: {
    resolutionScale: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    drawDistance: 1300,
    vegDensity: 1.0,
    postProcess: true,
    ssao: true,
    wetnessShader: true,
    footIK: true
  }
};

export const TEAMS = [
  { id: 0, name: 'Crimson Buccaneers', color: '#e04f5f', hex: 0xe04f5f, shape: '▲' },
  { id: 1, name: 'Sapphire Corsairs', color: '#3b9eff', hex: 0x3b9eff, shape: '●' },
  { id: 2, name: 'Emerald Raiders', color: '#34d399', hex: 0x34d399, shape: '■' }
] as const;

export const PLAYER_COLORS = [
  { color: '#e04f5f', hex: 0xe04f5f, shape: '▲' },
  { color: '#3b9eff', hex: 0x3b9eff, shape: '●' },
  { color: '#34d399', hex: 0x34d399, shape: '■' },
  { color: '#fbbf24', hex: 0xfbbf24, shape: '◆' },
  { color: '#a78bfa', hex: 0xa78bfa, shape: '★' },
  { color: '#fb923c', hex: 0xfb923c, shape: '✚' },
  { color: '#f472b6', hex: 0xf472b6, shape: '✦' },
  { color: '#22d3ee', hex: 0x22d3ee, shape: '▼' },
  { color: '#a3e635', hex: 0xa3e635, shape: '⬢' }
] as const;

export const BODY_TYPES = [
  { id: 'male_athletic', label: 'Male Athletic', widthScale: 1.0, heightScale: 1.0 },
  { id: 'female_athletic', label: 'Female Athletic', widthScale: 0.9, heightScale: 0.96 },
  { id: 'slim_scout', label: 'Slim Scout', widthScale: 0.85, heightScale: 1.02 },
  { id: 'stocky_buccaneer', label: 'Stocky Buccaneer', widthScale: 1.18, heightScale: 0.98 }
] as const;

export const SKIN_TONES = [
  '#f5d0b5',
  '#e6b48c',
  '#c98b5b',
  '#a56b43',
  '#78482a',
  '#4d2c19'
] as const;

export interface ClothingLoadout {
  bodyType: string;
  skinTone: string;
  faceStyle: number;
  beardStyle: number;
  presetId?: string;
  slots: {
    hat: { item: string; tint: string };
    hair: { item: string; tint: string };
    faceItem: { item: string; tint: string };
    coat: { item: string; tint: string };
    shirt: { item: string; tint: string };
    pants: { item: string; tint: string };
    boots: { item: string; tint: string };
    belt: { item: string; tint: string };
    gloves: { item: string; tint: string };
    backItem: { item: string; tint: string };
    heldItem: { item: string; tint: string };
  };
}

export const DEFAULT_LOADOUT: ClothingLoadout = {
  bodyType: 'male_athletic',
  skinTone: '#e6b48c',
  faceStyle: 0,
  beardStyle: 1,
  presetId: 'classic_captain',
  slots: {
    hat: { item: 'hat_tricorn', tint: '#2a2220' },
    hair: { item: 'hair_wavy', tint: '#3b2618' },
    faceItem: { item: 'face_eyepatch', tint: '#1e1c1a' },
    coat: { item: 'coat_captain', tint: '#8b2635' },
    shirt: { item: 'shirt_linen', tint: '#ece3d2' },
    pants: { item: 'pants_breeches', tint: '#3a342e' },
    boots: { item: 'boots_tall', tint: '#3b2416' },
    belt: { item: 'belt_brass', tint: '#b58932' },
    gloves: { item: 'gloves_leather', tint: '#462c1c' },
    backItem: { item: 'back_scabbard', tint: '#5c4128' },
    heldItem: { item: 'held_cutlass', tint: '#cfd8e3' }
  }
};
