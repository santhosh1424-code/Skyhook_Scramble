// Deterministic seeded PRNG (Mulberry32) and 2D FBM / Domain-Warped Noise

export function createRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz) * 2 - 1;
}

export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves = 5,
  lacunarity = 2.05,
  gain = 0.5
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 97);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / Math.max(norm, 1e-6);
}

export function ridgedFbm2D(x: number, z: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq, seed + i * 131));
    sum += amp * (n * n);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / Math.max(norm, 1e-6);
}
