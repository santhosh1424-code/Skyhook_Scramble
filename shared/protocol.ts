// Compact binary WebSocket protocol for 20 Hz state sync (replaces verbose JSON position frames)

export const ANIM_LIST = [
  'idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land',
  'swim', 'wade', 'climb', 'dig', 'slash', 'carry', 'open_chest',
  'victory', 'emote_wave', 'emote_cheer', 'emote_dance', 'emote_bow',
  'hit', 'knockdown', 'getup'
] as const;

export const PKT_INPUT = 0x01;
export const PKT_SNAPSHOT = 0x02;
export const PKT_CORRECT_POS = 0x03;

export function encodeInputBinary(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  yaw: number,
  animState: string
): ArrayBuffer {
  const buf = new ArrayBuffer(30);
  const dv = new DataView(buf);
  dv.setUint8(0, PKT_INPUT);
  dv.setFloat32(1, pos.x, true);
  dv.setFloat32(5, pos.y, true);
  dv.setFloat32(9, pos.z, true);
  dv.setFloat32(13, vel.x, true);
  dv.setFloat32(17, vel.y, true);
  dv.setFloat32(21, vel.z, true);
  dv.setFloat32(25, yaw, true);
  const idx = ANIM_LIST.indexOf(animState as (typeof ANIM_LIST)[number]);
  dv.setUint8(29, idx >= 0 ? idx : 0);
  return buf;
}

export function decodeInputBinary(buf: ArrayBuffer | Uint8Array): {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  animState: string;
} | null {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength < 30 || u8[0] !== PKT_INPUT) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const animIdx = dv.getUint8(29);
  return {
    pos: { x: dv.getFloat32(1, true), y: dv.getFloat32(5, true), z: dv.getFloat32(9, true) },
    vel: { x: dv.getFloat32(13, true), y: dv.getFloat32(17, true), z: dv.getFloat32(21, true) },
    yaw: dv.getFloat32(25, true),
    animState: ANIM_LIST[animIdx] || 'idle'
  };
}

export const CHEST_STATES = ['buried', 'dropped', 'carried', 'delivered'] as const;

export interface BinarySnapshotPlayer {
  numId: number;
  pos: { x: number; y: number; z: number };
  yaw: number;
  animState: string;
  carryingChest: boolean;
  knockedDownTimer: number;
}

export function encodeSnapshotBinary(
  timeLeft: number,
  chestState: (typeof CHEST_STATES)[number],
  chestPos: { x: number; y: number; z: number } | null,
  carrierNumId: number,
  players: BinarySnapshotPlayer[]
): Uint8Array {
  const stride = 24;
  const buf = new ArrayBuffer(21 + players.length * stride);
  const dv = new DataView(buf);
  dv.setUint8(0, PKT_SNAPSHOT);
  dv.setFloat32(1, timeLeft, true);
  dv.setUint8(5, CHEST_STATES.indexOf(chestState));
  dv.setFloat32(6, chestPos ? chestPos.x : 0, true);
  dv.setFloat32(10, chestPos ? chestPos.y : 0, true);
  dv.setFloat32(14, chestPos ? chestPos.z : 0, true);
  dv.setInt16(18, carrierNumId, true);
  dv.setUint8(20, players.length);

  let off = 21;
  for (const p of players) {
    dv.setUint16(off, p.numId, true);
    dv.setFloat32(off + 2, p.pos.x, true);
    dv.setFloat32(off + 6, p.pos.y, true);
    dv.setFloat32(off + 10, p.pos.z, true);
    dv.setFloat32(off + 14, p.yaw, true);
    const aIdx = ANIM_LIST.indexOf(p.animState as (typeof ANIM_LIST)[number]);
    dv.setUint8(off + 18, aIdx >= 0 ? aIdx : 0);
    dv.setUint8(off + 19, p.carryingChest ? 1 : 0);
    dv.setFloat32(off + 20, p.knockedDownTimer, true);
    off += stride;
  }
  return new Uint8Array(buf);
}

export function decodeSnapshotBinary(buf: ArrayBuffer): {
  timeLeft: number;
  chestState: (typeof CHEST_STATES)[number];
  chestPos: { x: number; y: number; z: number } | null;
  carrierNumId: number;
  players: BinarySnapshotPlayer[];
} | null {
  if (buf.byteLength < 21) return null;
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== PKT_SNAPSHOT) return null;
  const timeLeft = dv.getFloat32(1, true);
  const cState = CHEST_STATES[dv.getUint8(5)] || 'buried';
  const chestPos = cState === 'buried' ? null : { x: dv.getFloat32(6, true), y: dv.getFloat32(10, true), z: dv.getFloat32(14, true) };
  const carrierNumId = dv.getInt16(18, true);
  const count = dv.getUint8(20);
  const players: BinarySnapshotPlayer[] = [];
  let off = 21;
  for (let i = 0; i < count && off + 24 <= buf.byteLength; i++) {
    const numId = dv.getUint16(off, true);
    const x = dv.getFloat32(off + 2, true);
    const y = dv.getFloat32(off + 6, true);
    const z = dv.getFloat32(off + 10, true);
    const yaw = dv.getFloat32(off + 14, true);
    const animState = ANIM_LIST[dv.getUint8(off + 18)] || 'idle';
    const carryingChest = (dv.getUint8(off + 19) & 1) === 1;
    const knockedDownTimer = dv.getFloat32(off + 20, true);
    players.push({ numId, pos: { x, y, z }, yaw, animState, carryingChest, knockedDownTimer });
    off += 24;
  }
  return { timeLeft, chestState: cState, chestPos, carrierNumId, players };
}

export function encodeCorrectPosBinary(pos: { x: number; y: number; z: number }): Uint8Array {
  const buf = new ArrayBuffer(13);
  const dv = new DataView(buf);
  dv.setUint8(0, PKT_CORRECT_POS);
  dv.setFloat32(1, pos.x, true);
  dv.setFloat32(5, pos.y, true);
  dv.setFloat32(9, pos.z, true);
  return new Uint8Array(buf);
}

export function decodeCorrectPosBinary(buf: ArrayBuffer): { x: number; y: number; z: number } | null {
  if (buf.byteLength < 13) return null;
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== PKT_CORRECT_POS) return null;
  return { x: dv.getFloat32(1, true), y: dv.getFloat32(5, true), z: dv.getFloat32(9, true) };
}
