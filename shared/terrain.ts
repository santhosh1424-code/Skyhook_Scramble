import { createRng, fbm2D, ridgedFbm2D } from './prng.js';
import { MAX_PLAYERS } from './constants.js';

export type BiomeId =
  | 'ocean'
  | 'beach'
  | 'lagoon'
  | 'swamp'
  | 'grassland'
  | 'jungle'
  | 'cliff'
  | 'volcano';

export interface Landmark {
  id: string;
  kind:
    | 'port_village'
    | 'ship_berth'
    | 'temple_ruins'
    | 'pirate_fort'
    | 'cave'
    | 'shipwreck'
    | 'waterfall'
    | 'volcano'
    | 'camp';
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  radius: number;
  ownerIndex?: number;
}

export interface IslandSample {
  height: number;
  biome: BiomeId;
  slope: number;
  /** Splat weights: [sand, grass, dirt, rock, mud] */
  splat: [number, number, number, number, number];
  riverFactor: number;
}

export const GRID_RES = 513; // 512 intervals * 4m = 2048m (-1024..1024)
export const GRID_SPAN = 2048;
export const GRID_HALF = GRID_SPAN / 2;
export const GRID_CELL = GRID_SPAN / (GRID_RES - 1); // 4m

export class IslandTerrainData {
  public readonly seed: number;
  public readonly volcanoCenter: { x: number; z: number };
  public readonly lagoonCenter: { x: number; z: number };
  public readonly swampCenter: { x: number; z: number };
  public readonly landmarks: Landmark[] = [];
  public readonly heightGrid: Float32Array;
  public readonly riverGrid: Float32Array;

  constructor(
    seed: number,
    precomputed?: {
      heightGrid: Float32Array;
      riverGrid: Float32Array;
      landmarks: Landmark[];
      volcanoCenter: { x: number; z: number };
      lagoonCenter: { x: number; z: number };
      swampCenter: { x: number; z: number };
    }
  ) {
    this.seed = (seed >>> 0) || 424242;

    if (precomputed) {
      this.heightGrid = precomputed.heightGrid;
      this.riverGrid = precomputed.riverGrid;
      this.landmarks = precomputed.landmarks;
      this.volcanoCenter = precomputed.volcanoCenter;
      this.lagoonCenter = precomputed.lagoonCenter;
      this.swampCenter = precomputed.swampCenter;
      return;
    }

    const rng = createRng(this.seed);
    this.volcanoCenter = {
      x: -110 + (rng() - 0.5) * 180,
      z: -320 + (rng() - 0.5) * 160
    };
    this.lagoonCenter = {
      x: 260 + (rng() - 0.5) * 140,
      z: 270 + (rng() - 0.5) * 140
    };
    this.swampCenter = {
      x: -430 + (rng() - 0.5) * 120,
      z: 140 + (rng() - 0.5) * 120
    };

    this.heightGrid = new Float32Array(GRID_RES * GRID_RES);
    this.riverGrid = new Float32Array(GRID_RES * GRID_RES);
    this.bakeHeightmap();
    this.generateLandmarks();
  }

  private rawHeight(x: number, z: number): { h: number; riverFactor: number } {
    const wx = x + fbm2D(x * 0.0014, z * 0.0014, this.seed + 11, 3) * 140;
    const wz = z + fbm2D(x * 0.0014 + 4.3, z * 0.0014 - 2.1, this.seed + 29, 3) * 140;

    const radial = Math.hypot(wx * 0.96, wz * 1.02) / 860;
    const coastNoise = fbm2D(x * 0.0022, z * 0.0022, this.seed + 53, 3) * 0.16;
    const islandMask = Math.max(0, Math.min(1, 1.15 - (radial + coastNoise)));

    const rolling = (fbm2D(wx * 0.0021, wz * 0.0021, this.seed + 101, 5) * 0.5 + 0.5) * 32;
    const ridges = ridgedFbm2D(wx * 0.0032, wz * 0.0032, this.seed + 211, 4) * 28;
    const detail = fbm2D(x * 0.015, z * 0.015, this.seed + 307, 3) * 2.2;

    let h = -11 + islandMask * (14 + rolling + ridges * islandMask) + detail * islandMask;

    const dv = Math.hypot(x - this.volcanoCenter.x, z - this.volcanoCenter.z);
    if (dv < 320) {
      const vt = 1 - dv / 320;
      const mountain = Math.pow(vt, 1.55) * 112;
      const caldera = dv < 62 ? (1 - dv / 62) * 34 : 0;
      h += mountain - caldera;
    }

    const dl = Math.hypot(x - this.lagoonCenter.x, z - this.lagoonCenter.z);
    if (dl < 190) {
      const lt = 1 - dl / 190;
      h -= Math.pow(lt, 1.4) * 17;
    }

    const ds = Math.hypot(x - this.swampCenter.x, z - this.swampCenter.z);
    if (ds < 200) {
      const st = Math.pow(1 - ds / 200, 1.5);
      h = h * (1 - st * 0.72) + 1.1 * (st * 0.72);
    }

    const riverProgress = Math.max(
      0,
      Math.min(
        1,
        ((x - this.volcanoCenter.x) * (this.lagoonCenter.x - this.volcanoCenter.x) +
          (z - this.volcanoCenter.z) * (this.lagoonCenter.z - this.volcanoCenter.z)) /
          (Math.pow(this.lagoonCenter.x - this.volcanoCenter.x, 2) +
            Math.pow(this.lagoonCenter.z - this.volcanoCenter.z, 2))
      )
    );
    const rx =
      this.volcanoCenter.x +
      (this.lagoonCenter.x - this.volcanoCenter.x) * riverProgress +
      Math.sin(riverProgress * Math.PI * 3.5) * 65;
    const rz =
      this.volcanoCenter.z +
      (this.lagoonCenter.z - this.volcanoCenter.z) * riverProgress +
      Math.cos(riverProgress * Math.PI * 2.5) * 55;
    const distRiver = Math.hypot(x - rx, z - rz);
    let riverFactor = 0;
    if (riverProgress > 0.16 && distRiver < 34) {
      riverFactor = Math.pow(1 - distRiver / 34, 1.6);
      h -= riverFactor * 11.5;
    }

    if (h > 14 && h < 52) {
      const step = 12;
      const snapped = Math.round(h / step) * step;
      h = h * 0.84 + snapped * 0.16;
    }

    return { h, riverFactor };
  }

  private bakeHeightmap(): void {
    // Pass 1: raw height & river mask
    const raw = new Float32Array(GRID_RES * GRID_RES);
    for (let gz = 0; gz < GRID_RES; gz++) {
      const wz = -GRID_HALF + gz * GRID_CELL;
      for (let gx = 0; gx < GRID_RES; gx++) {
        const wx = -GRID_HALF + gx * GRID_CELL;
        const r = this.rawHeight(wx, wz);
        const idx = gz * GRID_RES + gx;
        raw[idx] = r.h;
        this.riverGrid[idx] = r.riverFactor;
      }
    }

    // Pass 2: erosion-like 5-tap smoothing directly on baked grid (fast!)
    for (let gz = 0; gz < GRID_RES; gz++) {
      const zm = Math.max(0, gz - 1);
      const zp = Math.min(GRID_RES - 1, gz + 1);
      for (let gx = 0; gx < GRID_RES; gx++) {
        const xm = Math.max(0, gx - 1);
        const xp = Math.min(GRID_RES - 1, gx + 1);
        const idx = gz * GRID_RES + gx;
        const avg =
          (raw[gz * GRID_RES + xp] +
            raw[gz * GRID_RES + xm] +
            raw[zp * GRID_RES + gx] +
            raw[zm * GRID_RES + gx]) *
          0.25;
        this.heightGrid[idx] = raw[idx] * 0.72 + avg * 0.28;
      }
    }
  }

  /** O(1) bilinear heightmap lookup (no noise evaluated per frame!) */
  public getHeight(x: number, z: number): number {
    const fx = Math.max(0, Math.min(GRID_RES - 1.001, (x + GRID_HALF) / GRID_CELL));
    const fz = Math.max(0, Math.min(GRID_RES - 1.001, (z + GRID_HALF) / GRID_CELL));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;

    const i00 = z0 * GRID_RES + x0;
    const h00 = this.heightGrid[i00];
    const h10 = this.heightGrid[i00 + 1];
    const h01 = this.heightGrid[i00 + GRID_RES];
    const h11 = this.heightGrid[i00 + GRID_RES + 1];

    const hx0 = h00 + (h10 - h00) * tx;
    const hx1 = h01 + (h11 - h01) * tx;
    return hx0 + (hx1 - hx0) * tz;
  }

  private getRiverFactor(x: number, z: number): number {
    const gx = Math.max(0, Math.min(GRID_RES - 1, Math.round((x + GRID_HALF) / GRID_CELL)));
    const gz = Math.max(0, Math.min(GRID_RES - 1, Math.round((z + GRID_HALF) / GRID_CELL)));
    return this.riverGrid[gz * GRID_RES + gx];
  }

  /** O(1) terrain sample using precomputed heightmap + bilinear slope */
  public sample(x: number, z: number): IslandSample {
    const height = this.getHeight(x, z);
    const riverFactor = this.getRiverFactor(x, z);

    const eps = GRID_CELL;
    const hx = this.getHeight(x + eps, z) - this.getHeight(x - eps, z);
    const hz = this.getHeight(x, z + eps) - this.getHeight(x, z - eps);
    const slope = Math.min(1, Math.hypot(hx, hz) / (eps * 2));

    const ds = Math.hypot(x - this.swampCenter.x, z - this.swampCenter.z);
    const dv = Math.hypot(x - this.volcanoCenter.x, z - this.volcanoCenter.z);
    const dl = Math.hypot(x - this.lagoonCenter.x, z - this.lagoonCenter.z);

    let biome: BiomeId = 'grassland';
    if (height < -0.8) biome = dl < 170 ? 'lagoon' : 'ocean';
    else if (height < 3.4 && slope < 0.35) biome = ds < 175 ? 'swamp' : 'beach';
    else if (dv < 210 && height > 48) biome = 'volcano';
    else if (slope > 0.48 || height > 46) biome = 'cliff';
    else if (fbm2D(x * 0.004, z * 0.004, this.seed + 509, 1) > -0.05) biome = 'jungle';

    let sand = 0;
    let grass = 0;
    let dirt = 0;
    let rock = 0;
    let mud = 0;

    if (height < 3.6) sand = Math.max(0, 1 - Math.max(0, height - 1.0) / 2.6);
    if (ds < 185 && height < 6.5) {
      mud = Math.max(mud, Math.min(1, (1 - ds / 185) * 1.3));
      sand *= 1 - mud * 0.7;
    }
    if (riverFactor > 0.25) dirt = Math.max(dirt, riverFactor * 0.8);
    if (slope > 0.36 || height > 42) {
      rock = Math.min(1, Math.max((slope - 0.32) * 2.6, (height - 40) / 30));
    }
    const baseVeg = Math.max(0, 1 - sand - rock - mud);
    if (biome === 'jungle') {
      grass = baseVeg * 0.72;
      dirt += baseVeg * 0.28;
    } else {
      grass = baseVeg * 0.85;
      dirt += baseVeg * 0.15;
    }

    const total = Math.max(1e-5, sand + grass + dirt + rock + mud);
    return {
      height,
      biome,
      slope,
      splat: [sand / total, grass / total, dirt / total, rock / total, mud / total],
      riverFactor
    };
  }

  private findSpotNearAngle(
    angle: number,
    minDist: number,
    maxDist: number,
    predicate: (s: IslandSample, x: number, z: number) => boolean
  ): { x: number; y: number; z: number } {
    for (let r = minDist; r <= maxDist; r += 16) {
      for (let da = 0; da <= 0.45; da += 0.09) {
        for (const sign of da === 0 ? [1] : [1, -1]) {
          const a = angle + da * sign;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const s = this.sample(x, z);
          if (predicate(s, x, z)) return { x, y: s.height, z };
        }
      }
    }
    const fx = Math.cos(angle) * ((minDist + maxDist) * 0.5);
    const fz = Math.sin(angle) * ((minDist + maxDist) * 0.5);
    return { x: fx, y: this.getHeight(fx, fz), z: fz };
  }

  private generateLandmarks(): void {
    const rng = createRng(this.seed + 777);

    this.landmarks.push({
      id: 'volcano',
      kind: 'volcano',
      name: 'Mount Ember Caldera',
      x: this.volcanoCenter.x,
      y: this.getHeight(this.volcanoCenter.x, this.volcanoCenter.z),
      z: this.volcanoCenter.z,
      yaw: 0,
      radius: 90
    });

    const port = this.findSpotNearAngle(1.05, 420, 760, (s) => s.height > 1.2 && s.height < 6.5 && s.slope < 0.22);
    this.landmarks.push({
      id: 'port_village',
      kind: 'port_village',
      name: 'Port Barnacle',
      ...port,
      yaw: Math.atan2(-port.x, -port.z),
      radius: 42
    });

    for (let i = 0; i < MAX_PLAYERS; i++) {
      const ang = (i / MAX_PLAYERS) * Math.PI * 2 + 0.18;
      let berthX = Math.cos(ang) * 740;
      let berthZ = Math.sin(ang) * 740;
      for (let r = 880; r >= 380; r -= 12) {
        const tx = Math.cos(ang) * r;
        const tz = Math.sin(ang) * r;
        const h = this.getHeight(tx, tz);
        if (h > -0.4 && h < 3.0) {
          berthX = Math.cos(ang) * (r + 18);
          berthZ = Math.sin(ang) * (r + 18);
          break;
        }
      }
      this.landmarks.push({
        id: `berth_${i}`,
        kind: 'ship_berth',
        name: `Berth ${i + 1}`,
        x: berthX,
        y: 0,
        z: berthZ,
        yaw: ang + Math.PI,
        radius: 16,
        ownerIndex: i
      });
    }

    const temple = this.findSpotNearAngle(2.4 + rng() * 0.4, 220, 480, (s) => s.height > 8 && s.height < 36 && s.slope < 0.28);
    this.landmarks.push({ id: 'temple_ruins', kind: 'temple_ruins', name: 'Sunken Sun Temple', ...temple, yaw: rng() * Math.PI * 2, radius: 26 });

    const fort = this.findSpotNearAngle(-0.7 + rng() * 0.3, 360, 680, (s) => s.height > 8 && s.height < 28 && s.slope < 0.3);
    this.landmarks.push({ id: 'pirate_fort', kind: 'pirate_fort', name: 'Fort Cutlass', ...fort, yaw: Math.atan2(-fort.x, -fort.z), radius: 24 });

    [0.2, 2.9, 4.7].forEach((a, idx) => {
      const c = this.findSpotNearAngle(a + rng() * 0.3, 220, 520, (s) => s.height > 6 && s.slope > 0.2);
      this.landmarks.push({
        id: `cave_${idx}`,
        kind: 'cave',
        name: ['Smuggler Cavern', 'Echo Grotto', 'Whispering Cave'][idx],
        ...c,
        yaw: Math.atan2(c.x, c.z),
        radius: 14
      });
    });

    [1.8, 3.85, 5.55].forEach((a, idx) => {
      const w = this.findSpotNearAngle(a, 480, 820, (s) => s.height > -0.6 && s.height < 2.8 && s.slope < 0.25);
      this.landmarks.push({
        id: `wreck_${idx}`,
        kind: 'shipwreck',
        name: ['The Black Gull', 'Queen Anne Wreck', 'Salty Mary'][idx],
        ...w,
        yaw: a + 0.8,
        radius: 16
      });
    });

    const camp1 = this.findSpotNearAngle(3.2, 260, 540, (s) => s.height > 3 && s.slope < 0.22);
    this.landmarks.push({ id: 'camp_0', kind: 'camp', name: 'Lookout Camp', ...camp1, yaw: 0.4, radius: 12 });
    const camp2 = this.findSpotNearAngle(5.1, 260, 540, (s) => s.height > 3 && s.slope < 0.22);
    this.landmarks.push({ id: 'camp_1', kind: 'camp', name: 'Buccaneer Camp', ...camp2, yaw: 1.9, radius: 12 });

    const wfX = (this.volcanoCenter.x + this.lagoonCenter.x) * 0.42;
    const wfZ = (this.volcanoCenter.z + this.lagoonCenter.z) * 0.42;
    this.landmarks.push({
      id: 'waterfall_0',
      kind: 'waterfall',
      name: 'Emerald Cascade',
      x: wfX,
      y: this.getHeight(wfX, wfZ),
      z: wfZ,
      yaw: Math.atan2(this.lagoonCenter.x - this.volcanoCenter.x, this.lagoonCenter.z - this.volcanoCenter.z),
      radius: 16
    });
  }
}
