import { HALF_WORLD, WATER_LEVEL, WORLD_SIZE } from '@shared/constants';
import type { IslandTerrainData } from '@shared/terrain';

// Minimap + Full Map with persistent Fog-of-War exploration grid
export class IslandMapRenderer {
  private readonly baseCanvas: HTMLCanvasElement;
  private readonly fogGrid: Uint8Array;
  private readonly FOG_RES = 48;

  constructor(private readonly terrain: IslandTerrainData) {
    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.width = 256;
    this.baseCanvas.height = 256;
    this.fogGrid = new Uint8Array(this.FOG_RES * this.FOG_RES);
    this.prerenderTerrainMap();
  }

  private prerenderTerrainMap(): void {
    const ctx = this.baseCanvas.getContext('2d')!;
    const size = this.baseCanvas.width;
    const img = ctx.createImageData(size, size);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const wx = (px / size) * WORLD_SIZE - HALF_WORLD;
        const wz = (py / size) * WORLD_SIZE - HALF_WORLD;
        const s = this.terrain.sample(wx, wz);

        let r = 18;
        let g = 74;
        let b = 122;

        if (s.height < WATER_LEVEL - 0.1) {
          const depth = Math.min(1, -s.height / 10);
          r = Math.round(35 * (1 - depth) + 12 * depth);
          g = Math.round(145 * (1 - depth) + 54 * depth);
          b = Math.round(170 * (1 - depth) + 96 * depth);
        } else if (s.biome === 'beach') {
          r = 216; g = 194; b = 138;
        } else if (s.biome === 'swamp') {
          r = 76; g = 88; b = 54;
        } else if (s.biome === 'volcano') {
          r = 98; g = 84; b = 78;
        } else if (s.biome === 'cliff') {
          r = 128; g = 124; b = 114;
        } else if (s.biome === 'jungle') {
          r = 46; g = 112; b = 54;
        } else {
          r = 88; g = 148; b = 68;
        }

        const idx = (py * size + px) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  public revealAround(x: number, z: number, radiusMeters = 145): void {
    const gx = Math.floor(((x + HALF_WORLD) / WORLD_SIZE) * this.FOG_RES);
    const gz = Math.floor(((z + HALF_WORLD) / WORLD_SIZE) * this.FOG_RES);
    const radCells = Math.ceil((radiusMeters / WORLD_SIZE) * this.FOG_RES);

    for (let dz = -radCells; dz <= radCells; dz++) {
      for (let dx = -radCells; dx <= radCells; dx++) {
        if (dx * dx + dz * dz > radCells * radCells) continue;
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx >= 0 && nx < this.FOG_RES && nz >= 0 && nz < this.FOG_RES) {
          this.fogGrid[nz * this.FOG_RES + nx] = 1;
        }
      }
    }
  }

  public draw(
    target: HTMLCanvasElement,
    playerPos: { x: number; z: number },
    playerYaw: number,
    berthPos: { x: number; z: number },
    cluePos: { x: number; z: number } | null,
    chestDroppedPos: { x: number; z: number } | null,
    fullMode = false
  ): void {
    const ctx = target.getContext('2d');
    if (!ctx) return;
    const w = target.width;
    const h = target.height;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.baseCanvas, 0, 0, w, h);

    // Draw Fog-of-War over unexplored cells
    const cw = w / this.FOG_RES;
    const ch = h / this.FOG_RES;
    ctx.fillStyle = 'rgba(12, 22, 34, 0.72)';
    for (let gz = 0; gz < this.FOG_RES; gz++) {
      for (let gx = 0; gx < this.FOG_RES; gx++) {
        if (!this.fogGrid[gz * this.FOG_RES + gx]) {
          ctx.fillRect(gx * cw, gz * ch, cw + 0.6, ch + 0.6);
        }
      }
    }

    const toPx = (wx: number, wz: number) => ({
      x: ((wx + HALF_WORLD) / WORLD_SIZE) * w,
      y: ((wz + HALF_WORLD) / WORLD_SIZE) * h
    });

    // Landmarks shown once explored (or in full map)
    if (fullMode) {
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      for (const lm of this.terrain.landmarks) {
        if (lm.kind === 'ship_berth') continue;
        const gx = Math.floor(((lm.x + HALF_WORLD) / WORLD_SIZE) * this.FOG_RES);
        const gz = Math.floor(((lm.z + HALF_WORLD) / WORLD_SIZE) * this.FOG_RES);
        if (gx >= 0 && gz >= 0 && gx < this.FOG_RES && gz < this.FOG_RES && this.fogGrid[gz * this.FOG_RES + gx]) {
          const p = toPx(lm.x, lm.z);
          ctx.fillStyle = '#ffe599';
          ctx.fillText(lm.name, p.x, p.y - 5);
        }
      }
    }

    // Player's home ship berth
    const bp = toPx(berthPos.x, berthPos.z);
    ctx.fillStyle = '#4de1ff';
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, fullMode ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Active Clue marker (never shows buried chest itself!)
    if (cluePos) {
      const cp = toPx(cluePos.x, cluePos.z);
      ctx.fillStyle = '#ffd147';
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, fullMode ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dropped or carried chest indicator (only when unearthed!)
    if (chestDroppedPos) {
      const chp = toPx(chestDroppedPos.x, chestDroppedPos.z);
      ctx.strokeStyle = '#ff5757';
      ctx.lineWidth = 2;
      ctx.strokeRect(chp.x - 4, chp.y - 4, 8, 8);
    }

    // Local player arrow
    const pp = toPx(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-playerYaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, fullMode ? -8 : -6);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
