import { BODY_TYPES, DEFAULT_LOADOUT, SKIN_TONES, type ClothingLoadout } from './constants.js';
import catalogJson from '../assets/catalog.json' with { type: 'json' };

export interface CatalogItem {
  id: string;
  label: string;
}

export interface OutfitPreset {
  id: string;
  name: string;
  bodyType: string;
  slots: ClothingLoadout['slots'];
}

export const CLOTHING_CATALOG = catalogJson as {
  slots: Record<keyof ClothingLoadout['slots'], CatalogItem[]>;
  tints: string[];
  presets: OutfitPreset[];
};

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;

export function validateLoadout(raw: unknown): ClothingLoadout {
  const out = structuredClone(DEFAULT_LOADOUT);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<ClothingLoadout>;

  if (typeof r.bodyType === 'string' && BODY_TYPES.some((b) => b.id === r.bodyType)) {
    out.bodyType = r.bodyType;
  }
  if (typeof r.skinTone === 'string' && (SKIN_TONES as readonly string[]).includes(r.skinTone)) {
    out.skinTone = r.skinTone;
  }
  if (typeof r.faceStyle === 'number' && Number.isInteger(r.faceStyle) && r.faceStyle >= 0 && r.faceStyle <= 2) {
    out.faceStyle = r.faceStyle;
  }
  if (typeof r.beardStyle === 'number' && Number.isInteger(r.beardStyle) && r.beardStyle >= 0 && r.beardStyle <= 2) {
    out.beardStyle = r.beardStyle;
  }
  if (typeof r.presetId === 'string') {
    out.presetId = r.presetId;
  }

  if (r.slots && typeof r.slots === 'object') {
    for (const slotKey of Object.keys(out.slots) as (keyof ClothingLoadout['slots'])[]) {
      const candidate = r.slots[slotKey];
      if (!candidate || typeof candidate !== 'object') continue;
      const validItems = CLOTHING_CATALOG.slots[slotKey] || [];
      if (typeof candidate.item === 'string' && validItems.some((v) => v.id === candidate.item)) {
        out.slots[slotKey].item = candidate.item;
      }
      if (typeof candidate.tint === 'string' && VALID_HEX.test(candidate.tint)) {
        out.slots[slotKey].tint = candidate.tint;
      }
    }
  }
  return out;
}
