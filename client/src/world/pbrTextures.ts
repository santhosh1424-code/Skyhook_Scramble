import * as THREE from 'three';

export interface MaterialTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function heightToNormalCanvas(heights: Float32Array, size: number, strength = 2.4): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;

      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function finalizeTexture(canvas: HTMLCanvasElement, repeat = 1, isColor = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function tileableNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x) % period;
  const yi = Math.floor(y) % period;
  const x1 = (xi + 1) % period;
  const y1 = (yi + 1) % period;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const hash = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + seed * 1442695;
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  const v00 = hash(xi, yi);
  const v10 = hash(x1, yi);
  const v01 = hash(xi, y1);
  const v11 = hash(x1, y1);
  return (v00 * (1 - ux) + v10 * ux) * (1 - uy) + (v01 * (1 - ux) + v11 * ux) * uy;
}

function makeSurfaceSet(
  baseRgb: [number, number, number],
  varRgb: [number, number, number],
  seed: number,
  ripple = false,
  normalStrength = 2.2,
  size = 128
): MaterialTextureSet {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n =
        tileableNoise((x / size) * 8, (y / size) * 8, 8, seed) * 0.55 +
        tileableNoise((x / size) * 16, (y / size) * 16, 16, seed + 17) * 0.3 +
        tileableNoise((x / size) * 32, (y / size) * 32, 32, seed + 51) * 0.15;

      if (ripple) {
        const wave = Math.sin(((x + y * 0.35) / size) * Math.PI * 14 + n * 2.5) * 0.5 + 0.5;
        n = n * 0.55 + wave * 0.45;
      }

      heights[y * size + x] = n;
      const idx = (y * size + x) * 4;
      img.data[idx] = Math.min(255, Math.max(0, Math.round(baseRgb[0] + (n - 0.5) * varRgb[0])));
      img.data[idx + 1] = Math.min(255, Math.max(0, Math.round(baseRgb[1] + (n - 0.5) * varRgb[1])));
      img.data[idx + 2] = Math.min(255, Math.max(0, Math.round(baseRgb[2] + (n - 0.5) * varRgb[2])));
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: finalizeTexture(c, 1, true),
    normalMap: finalizeTexture(heightToNormalCanvas(heights, size, normalStrength), 1, false)
  };
}

export interface WorldTextureBundle {
  sand: MaterialTextureSet;
  grass: MaterialTextureSet;
  dirt: MaterialTextureSet;
  rock: MaterialTextureSet;
  mud: MaterialTextureSet;
  detailMap: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  clothNormal: THREE.CanvasTexture;
  leatherNormal: THREE.CanvasTexture;
  metalNormal: THREE.CanvasTexture;
}

let cachedBundle: WorldTextureBundle | null = null;

export function getWorldTextures(): WorldTextureBundle {
  if (cachedBundle) return cachedBundle;

  const sand = makeSurfaceSet([228, 206, 158], [28, 24, 22], 101, true, 1.5);
  const grass = makeSurfaceSet([72, 118, 54], [42, 48, 28], 202, false, 2.6);
  const dirt = makeSurfaceSet([122, 92, 62], [36, 30, 24], 303, false, 2.4);
  const rock = makeSurfaceSet([116, 114, 110], [58, 56, 52], 404, false, 4.2);
  const mud = makeSurfaceSet([68, 58, 44], [24, 22, 18], 505, false, 1.8);

  // Water normal map
  const wSize = 128;
  const wHeights = new Float32Array(wSize * wSize);
  for (let y = 0; y < wSize; y++) {
    for (let x = 0; x < wSize; x++) {
      const a = Math.sin((x / wSize) * Math.PI * 6) * Math.cos((y / wSize) * Math.PI * 4);
      const b = tileableNoise((x / wSize) * 12, (y / wSize) * 12, 12, 909);
      wHeights[y * wSize + x] = a * 0.35 + b * 0.65;
    }
  }
  const waterNormal = finalizeTexture(heightToNormalCanvas(wHeights, wSize, 2.2), 16, false);

  const clothNormal = makeSurfaceSet([128, 128, 128], [20, 20, 20], 606, true, 1.8, 64).normalMap;
  const leatherNormal = makeSurfaceSet([128, 128, 128], [30, 30, 30], 707, false, 2.6, 64).normalMap;
  const metalNormal = makeSurfaceSet([128, 128, 128], [14, 14, 14], 808, false, 1.2, 64).normalMap;
  const detailMap = makeSurfaceSet([210, 210, 210], [65, 65, 65], 959, false, 1.4, 128).map;

  cachedBundle = {
    sand,
    grass,
    dirt,
    rock,
    mud,
    detailMap,
    waterNormal,
    clothNormal,
    leatherNormal,
    metalNormal
  };
  return cachedBundle;
}
