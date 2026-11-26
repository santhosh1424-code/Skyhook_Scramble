// Generates valid binary glTF 2.0 (.glb) rigged humanoid base & modular clothing pack
// sharing a unified 22-bone skeleton so clothing & animations swap cleanly at runtime.
// Output:
//   assets/models/pirate_base.glb
//   assets/models/clothing_pack.glb

import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('assets/models');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 22-bone shared humanoid skeleton (local translations in meters, Y-up, facing +Z)
const BONES = [
  { name: 'Hips', parent: -1, pos: [0, 0.94, 0] }, // 0
  { name: 'Spine', parent: 0, pos: [0, 0.14, 0] }, // 1
  { name: 'Chest', parent: 1, pos: [0, 0.24, 0] }, // 2
  { name: 'Neck', parent: 2, pos: [0, 0.2, 0] }, // 3
  { name: 'Head', parent: 3, pos: [0, 0.1, 0] }, // 4

  { name: 'ShoulderL', parent: 2, pos: [0.1, 0.14, 0] }, // 5
  { name: 'UpperArmL', parent: 5, pos: [0.11, -0.02, 0] }, // 6
  { name: 'ForearmL', parent: 6, pos: [0.24, 0, 0] }, // 7
  { name: 'HandL', parent: 7, pos: [0.22, 0, 0] }, // 8

  { name: 'ShoulderR', parent: 2, pos: [-0.1, 0.14, 0] }, // 9
  { name: 'UpperArmR', parent: 9, pos: [-0.11, -0.02, 0] }, // 10
  { name: 'ForearmR', parent: 10, pos: [-0.24, 0, 0] }, // 11
  { name: 'HandR', parent: 11, pos: [-0.22, 0, 0] }, // 12

  { name: 'ThighL', parent: 0, pos: [0.1, -0.04, 0] }, // 13
  { name: 'ShinL', parent: 13, pos: [0, -0.43, 0] }, // 14
  { name: 'FootL', parent: 14, pos: [0, -0.42, 0] }, // 15

  { name: 'ThighR', parent: 0, pos: [-0.1, -0.04, 0] }, // 16
  { name: 'ShinR', parent: 16, pos: [0, -0.43, 0] }, // 17
  { name: 'FootR', parent: 17, pos: [0, -0.42, 0] }, // 18

  { name: 'HatAttach', parent: 4, pos: [0, 0.17, 0] }, // 19
  { name: 'BackAttach', parent: 2, pos: [0, 0.1, -0.14] }, // 20
  { name: 'HandItemAttach', parent: 12, pos: [0, -0.04, 0.06] } // 21
];

function computeWorldPositions() {
  const world = [];
  for (let i = 0; i < BONES.length; i++) {
    const b = BONES[i];
    if (b.parent === -1) world.push([...b.pos]);
    else {
      const p = world[b.parent];
      world.push([p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]);
    }
  }
  return world;
}

const WORLD_BONE_POS = computeWorldPositions();

// Geometry builder helpers (produces indexed triangles with smooth normals, UVs, and bone weights)
function createMeshBuilder() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const indices = [];

  function addVertex(px, py, pz, nx, ny, nz, u, v, j0, w0, j1 = 0, w1 = 0) {
    const idx = positions.length / 3;
    positions.push(px, py, pz);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(u, v);
    joints.push(j0, j1, 0, 0);
    weights.push(w0, w1, 0, 0);
    return idx;
  }

  // Tapered limb/torso segment along arbitrary 3D axis or Y axis with elliptical cross-section
  function addLimbTube(x0, y0, z0, x1, y1, z1, rx0, rz0, rx1, rz1, segsU, segsV, bone0, bone1) {
    const startIdx = positions.length / 3;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    const axis = [dx / len, dy / len, dz / len];

    // Orthonormal frame around axis
    let ref = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    // tangent = normalize(cross(ref, axis))
    let tx = ref[1] * axis[2] - ref[2] * axis[1];
    let ty = ref[2] * axis[0] - ref[0] * axis[2];
    let tz = ref[0] * axis[1] - ref[1] * axis[0];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;
    // bitangent = cross(axis, tangent)
    const bx = axis[1] * tz - axis[2] * ty;
    const by = axis[2] * tx - axis[0] * tz;
    const bz = axis[0] * ty - axis[1] * tx;

    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV;
      const cx = x0 + dx * v;
      const cy = y0 + dy * v;
      const cz = z0 + dz * v;
      const rx = rx0 + (rx1 - rx0) * v;
      const rz = rz0 + (rz1 - rz0) * v;
      const w1 = v;
      const w0 = 1 - v;

      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        const ang = u * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);

        const ox = tx * ca * rx + bx * sa * rz;
        const oy = ty * ca * rx + by * sa * rz;
        const oz = tz * ca * rx + bz * sa * rz;

        addVertex(cx + ox, cy + oy, cz + oz, ox, oy, oz, u, v, bone0, w0, bone1, w1);
      }
    }

    const row = segsU + 1;
    for (let iv = 0; iv < segsV; iv++) {
      for (let iu = 0; iu < segsU; iu++) {
        const a = startIdx + iv * row + iu;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  function addEllipsoid(cx, cy, cz, rx, ry, rz, segsU, segsV, bone0, bone1 = 0, w0 = 1, w1 = 0) {
    const startIdx = positions.length / 3;
    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV;
      const phi = v * Math.PI;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        const theta = u * Math.PI * 2;
        const nx = sp * Math.cos(theta);
        const ny = cp;
        const nz = sp * Math.sin(theta);
        addVertex(
          cx + nx * rx,
          cy + ny * ry,
          cz + nz * rz,
          nx / rx,
          ny / ry,
          nz / rz,
          u,
          v,
          bone0,
          w0,
          bone1,
          w1
        );
      }
    }
    const row = segsU + 1;
    for (let iv = 0; iv < segsV; iv++) {
      for (let iu = 0; iu < segsU; iu++) {
        const a = startIdx + iv * row + iu;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  function addBox(cx, cy, cz, hx, hy, hz, bone) {
    const faces = [
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], d: hz },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], d: hz },
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], d: hx },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], d: hx },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], d: hy },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], d: hy }
    ];
    for (const f of faces) {
      const s = positions.length / 3;
      const sx = f.u[0] * hx + f.v[0] * hy;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ]) {
        const px = cx + f.n[0] * f.d + f.u[0] * su * hx + f.v[0] * sv * hy;
        const py = cy + f.n[1] * f.d + f.u[1] * su * hy + f.v[1] * sv * hy;
        const pz = cz + f.n[2] * f.d + f.u[2] * su * hz + f.v[2] * sv * hz;
        // Exact extents along face tangent axes
        const ax = cx + f.n[0] * (f.n[0] ? hx : 0) + (f.u[0] * su * hx) + (f.v[0] * sv * hx);
        const ex = cx + f.n[0] * hx + (f.u[0] !== 0 ? f.u[0] * su * hx : f.v[0] * sv * hx);
        const ey = cy + f.n[1] * hy + (f.u[1] !== 0 ? f.u[1] * su * hy : f.v[1] * sv * hy);
        const ez = cz + f.n[2] * hz + (f.u[2] !== 0 ? f.u[2] * su * hz : f.v[2] * sv * hz);
        void px; void py; void pz; void sx; void ax;
        addVertex(ex, ey, ez, f.n[0], f.n[1], f.n[2], su * 0.5 + 0.5, sv * 0.5 + 0.5, bone, 1);
      }
      indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  }

  return { positions, normals, uvs, joints, weights, indices, addLimbTube, addEllipsoid, addBox };
}

function buildHumanoidBodyMesh() {
  const m = createMeshBuilder();
  // Pelvis / Hips (bone 0 -> 1)
  m.addLimbTube(0, 0.86, 0, 0, 1.06, 0, 0.14, 0.1, 0.14, 0.1, 12, 2, 0, 1);
  // Waist to Chest (bone 1 -> 2)
  m.addLimbTube(0, 1.05, 0, 0, 1.4, 0, 0.135, 0.095, 0.185, 0.115, 14, 4, 1, 2);
  // Neck (bone 3 -> 4)
  m.addLimbTube(0, 1.41, 0, 0, 1.54, 0, 0.055, 0.055, 0.05, 0.05, 10, 2, 3, 4);

  // Proportional Head (cranium + jaw/chin + nose bridge, bone 4)
  m.addEllipsoid(0, 1.65, 0, 0.1, 0.125, 0.11, 14, 10, 4);
  m.addEllipsoid(0, 1.58, 0.03, 0.072, 0.065, 0.08, 10, 6, 4); // jaw
  m.addEllipsoid(0, 1.64, 0.11, 0.018, 0.025, 0.022, 6, 4, 4); // nose

  // Left & Right Arms (T-pose along +/-X)
  m.addEllipsoid(0.18, 1.38, 0, 0.07, 0.065, 0.065, 8, 6, 5, 6, 0.5, 0.5);
  m.addLimbTube(0.21, 1.37, 0, 0.45, 1.37, 0, 0.055, 0.055, 0.044, 0.044, 10, 3, 6, 7);
  m.addLimbTube(0.45, 1.37, 0, 0.67, 1.37, 0, 0.044, 0.044, 0.034, 0.034, 10, 3, 7, 8);
  m.addEllipsoid(0.71, 1.37, 0, 0.052, 0.028, 0.04, 8, 6, 8);

  m.addEllipsoid(-0.18, 1.38, 0, 0.07, 0.065, 0.065, 8, 6, 9, 10, 0.5, 0.5);
  m.addLimbTube(-0.21, 1.37, 0, -0.45, 1.37, 0, 0.055, 0.055, 0.044, 0.044, 10, 3, 10, 11);
  m.addLimbTube(-0.45, 1.37, 0, -0.67, 1.37, 0, 0.044, 0.044, 0.034, 0.034, 10, 3, 11, 12);
  m.addEllipsoid(-0.71, 1.37, 0, 0.052, 0.028, 0.04, 8, 6, 12);

  // Left & Right Legs + Feet
  m.addLimbTube(0.1, 0.9, 0, 0.1, 0.48, 0, 0.082, 0.082, 0.06, 0.06, 10, 3, 13, 14);
  m.addLimbTube(0.1, 0.48, 0, 0.1, 0.07, 0, 0.06, 0.06, 0.044, 0.044, 10, 3, 14, 15);
  m.addBox(0.1, 0.035, 0.04, 0.05, 0.035, 0.11, 15);

  m.addLimbTube(-0.1, 0.9, 0, -0.1, 0.48, 0, 0.082, 0.082, 0.06, 0.06, 10, 3, 16, 17);
  m.addLimbTube(-0.1, 0.48, 0, -0.1, 0.07, 0, 0.06, 0.06, 0.044, 0.044, 10, 3, 17, 18);
  m.addBox(-0.1, 0.035, 0.04, 0.05, 0.035, 0.11, 18);

  return m;
}

function buildClothingParts() {
  const parts = {};

  // Coats (3 variations)
  parts.coat_captain = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.88, 0, 0, 1.42, 0, 0.19, 0.14, 0.21, 0.145, 14, 4, 1, 2);
    m.addLimbTube(0.2, 1.37, 0, 0.56, 1.37, 0, 0.068, 0.068, 0.055, 0.055, 10, 2, 6, 7);
    m.addLimbTube(-0.2, 1.37, 0, -0.56, 1.37, 0, 0.068, 0.068, 0.055, 0.055, 10, 2, 10, 11);
    return m;
  })();

  parts.coat_vest = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.02, 0, 0, 1.41, 0, 0.165, 0.118, 0.2, 0.135, 14, 4, 1, 2);
    return m;
  })();

  parts.coat_tunic = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.78, 0, 0, 1.4, 0, 0.2, 0.15, 0.195, 0.135, 14, 4, 0, 2);
    return m;
  })();

  // Shirts (3 variations)
  parts.shirt_linen = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.0, 0, 0, 1.41, 0, 0.15, 0.105, 0.192, 0.125, 12, 3, 1, 2);
    m.addLimbTube(0.21, 1.37, 0, 0.62, 1.37, 0, 0.06, 0.06, 0.048, 0.048, 8, 2, 6, 7);
    m.addLimbTube(-0.21, 1.37, 0, -0.62, 1.37, 0, 0.06, 0.06, 0.048, 0.048, 8, 2, 10, 11);
    return m;
  })();

  parts.shirt_ragged = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.0, 0, 0, 1.41, 0, 0.148, 0.105, 0.188, 0.122, 10, 3, 1, 2);
    return m;
  })();

  parts.shirt_striped = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.0, 0, 0, 1.41, 0, 0.152, 0.108, 0.193, 0.126, 12, 3, 1, 2);
    m.addLimbTube(0.21, 1.37, 0, 0.45, 1.37, 0, 0.06, 0.06, 0.052, 0.052, 8, 2, 6, 7);
    m.addLimbTube(-0.21, 1.37, 0, -0.45, 1.37, 0, 0.06, 0.06, 0.052, 0.052, 8, 2, 10, 11);
    return m;
  })();

  // Pants (3 variations)
  parts.pants_breeches = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.85, 0, 0, 1.02, 0, 0.15, 0.11, 0.15, 0.11, 12, 2, 0, 1);
    m.addLimbTube(0.1, 0.9, 0, 0.1, 0.4, 0, 0.09, 0.09, 0.068, 0.068, 10, 3, 13, 14);
    m.addLimbTube(-0.1, 0.9, 0, -0.1, 0.4, 0, 0.09, 0.09, 0.068, 0.068, 10, 3, 16, 17);
    return m;
  })();

  parts.pants_trousers = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.85, 0, 0, 1.02, 0, 0.15, 0.11, 0.15, 0.11, 12, 2, 0, 1);
    m.addLimbTube(0.1, 0.9, 0, 0.1, 0.14, 0, 0.092, 0.092, 0.062, 0.062, 10, 4, 13, 14);
    m.addLimbTube(-0.1, 0.9, 0, -0.1, 0.14, 0, 0.092, 0.092, 0.062, 0.062, 10, 4, 16, 17);
    return m;
  })();

  parts.pants_ragged = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.85, 0, 0, 1.02, 0, 0.15, 0.11, 0.15, 0.11, 10, 2, 0, 1);
    m.addLimbTube(0.1, 0.9, 0, 0.1, 0.34, 0, 0.088, 0.088, 0.065, 0.065, 8, 3, 13, 14);
    m.addLimbTube(-0.1, 0.9, 0, -0.1, 0.38, 0, 0.088, 0.088, 0.065, 0.065, 8, 3, 16, 17);
    return m;
  })();

  // Boots (3 variations)
  parts.boots_tall = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.1, 0.46, 0, 0.1, 0.05, 0, 0.072, 0.072, 0.058, 0.058, 10, 2, 14, 15);
    m.addBox(0.1, 0.04, 0.05, 0.058, 0.04, 0.125, 15);
    m.addLimbTube(-0.1, 0.46, 0, -0.1, 0.05, 0, 0.072, 0.072, 0.058, 0.058, 10, 2, 17, 18);
    m.addBox(-0.1, 0.04, 0.05, 0.058, 0.04, 0.125, 18);
    return m;
  })();

  parts.boots_ankle = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.1, 0.22, 0, 0.1, 0.05, 0, 0.06, 0.06, 0.056, 0.056, 8, 2, 14, 15);
    m.addBox(0.1, 0.04, 0.05, 0.056, 0.04, 0.12, 15);
    m.addLimbTube(-0.1, 0.22, 0, -0.1, 0.05, 0, 0.06, 0.06, 0.056, 0.056, 8, 2, 17, 18);
    m.addBox(-0.1, 0.04, 0.05, 0.056, 0.04, 0.12, 18);
    return m;
  })();

  parts.boots_wraps = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.1, 0.34, 0, 0.1, 0.06, 0, 0.064, 0.064, 0.052, 0.052, 8, 3, 14, 15);
    m.addLimbTube(-0.1, 0.34, 0, -0.1, 0.06, 0, 0.064, 0.064, 0.052, 0.052, 8, 3, 17, 18);
    return m;
  })();

  // Belt / Sash (3 variations)
  parts.belt_brass = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.96, 0, 0, 1.05, 0, 0.16, 0.12, 0.16, 0.12, 12, 1, 0, 1);
    m.addBox(0, 1.0, 0.125, 0.04, 0.04, 0.015, 0);
    return m;
  })();

  parts.belt_sash = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.94, 0, 0, 1.08, 0, 0.165, 0.125, 0.165, 0.125, 12, 2, 0, 1);
    m.addLimbTube(0.14, 0.96, 0.06, 0.17, 0.68, 0.06, 0.04, 0.02, 0.03, 0.015, 6, 1, 0, 13);
    return m;
  })();

  parts.belt_rope = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 0.98, 0, 0, 1.03, 0, 0.158, 0.118, 0.158, 0.118, 10, 1, 0, 1);
    return m;
  })();

  // Gloves (3 variations)
  parts.gloves_leather = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.6, 1.37, 0, 0.74, 1.37, 0, 0.048, 0.042, 0.055, 0.045, 8, 2, 7, 8);
    m.addLimbTube(-0.6, 1.37, 0, -0.74, 1.37, 0, 0.048, 0.042, 0.055, 0.045, 8, 2, 11, 12);
    return m;
  })();

  parts.gloves_wraps = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.52, 1.37, 0, 0.7, 1.37, 0, 0.046, 0.046, 0.042, 0.042, 8, 2, 7, 8);
    m.addLimbTube(-0.52, 1.37, 0, -0.7, 1.37, 0, 0.046, 0.046, 0.042, 0.042, 8, 2, 11, 12);
    return m;
  })();

  parts.gloves_cuffed = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0.54, 1.37, 0, 0.74, 1.37, 0, 0.058, 0.058, 0.048, 0.045, 8, 2, 7, 8);
    m.addLimbTube(-0.54, 1.37, 0, -0.74, 1.37, 0, 0.058, 0.058, 0.048, 0.045, 8, 2, 11, 12);
    return m;
  })();

  // Hats (4 variations)
  parts.hat_tricorn = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.72, 0, 0, 1.75, 0, 0.24, 0.24, 0.22, 0.22, 3, 1, 4, 19);
    m.addLimbTube(0, 1.74, 0, 0, 1.85, 0, 0.12, 0.12, 0.1, 0.1, 8, 1, 4, 19);
    return m;
  })();

  parts.hat_bandana = (() => {
    const m = createMeshBuilder();
    m.addEllipsoid(0, 1.71, -0.01, 0.108, 0.06, 0.118, 12, 6, 4);
    m.addLimbTube(0, 1.68, -0.11, 0, 1.6, -0.2, 0.03, 0.02, 0.015, 0.01, 6, 1, 4, 19);
    return m;
  })();

  parts.hat_bicorn = (() => {
    const m = createMeshBuilder();
    m.addBox(0, 1.76, 0, 0.24, 0.07, 0.1, 4);
    return m;
  })();

  parts.hat_explorer = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.72, 0, 0, 1.74, 0, 0.23, 0.23, 0.22, 0.22, 12, 1, 4, 19);
    m.addLimbTube(0, 1.74, 0, 0, 1.84, 0, 0.11, 0.11, 0.095, 0.095, 10, 1, 4, 19);
    return m;
  })();

  // Hair (3 variations)
  parts.hair_wavy = (() => {
    const m = createMeshBuilder();
    m.addEllipsoid(0, 1.69, -0.02, 0.11, 0.11, 0.12, 10, 6, 4);
    m.addLimbTube(0, 1.65, -0.09, 0, 1.46, -0.11, 0.09, 0.04, 0.07, 0.03, 8, 2, 4, 3);
    return m;
  })();

  parts.hair_short = (() => {
    const m = createMeshBuilder();
    m.addEllipsoid(0, 1.71, -0.01, 0.105, 0.085, 0.115, 10, 6, 4);
    return m;
  })();

  parts.hair_braids = (() => {
    const m = createMeshBuilder();
    m.addEllipsoid(0, 1.7, -0.01, 0.105, 0.09, 0.115, 10, 6, 4);
    m.addLimbTube(0.09, 1.62, -0.04, 0.11, 1.38, -0.06, 0.025, 0.025, 0.018, 0.018, 6, 2, 4, 2);
    m.addLimbTube(-0.09, 1.62, -0.04, -0.11, 1.38, -0.06, 0.025, 0.025, 0.018, 0.018, 6, 2, 4, 2);
    return m;
  })();

  // Face items (3 variations)
  parts.face_eyepatch = (() => {
    const m = createMeshBuilder();
    m.addBox(0.038, 1.66, 0.105, 0.024, 0.018, 0.01, 4);
    return m;
  })();

  parts.face_goggles = (() => {
    const m = createMeshBuilder();
    m.addBox(0.038, 1.66, 0.108, 0.026, 0.02, 0.012, 4);
    m.addBox(-0.038, 1.66, 0.108, 0.026, 0.02, 0.012, 4);
    return m;
  })();

  parts.face_bandana = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(0, 1.56, 0.02, 0, 1.63, 0.02, 0.095, 0.105, 0.09, 0.1, 10, 1, 4, 3);
    return m;
  })();

  // Back / Shoulder items (3 variations)
  parts.back_scabbard = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(-0.1, 1.38, -0.14, 0.12, 0.92, -0.14, 0.028, 0.02, 0.022, 0.016, 6, 2, 2, 20);
    return m;
  })();

  parts.back_pack = (() => {
    const m = createMeshBuilder();
    m.addBox(0, 1.22, -0.18, 0.14, 0.18, 0.09, 2);
    return m;
  })();

  parts.back_parrot = (() => {
    const m = createMeshBuilder();
    m.addEllipsoid(0.2, 1.48, 0.02, 0.045, 0.075, 0.055, 8, 6, 5);
    m.addEllipsoid(0.2, 1.56, 0.04, 0.03, 0.03, 0.035, 8, 6, 5);
    return m;
  })();

  // Held items (6 variations)
  parts.held_cutlass = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(-0.71, 1.35, 0.04, -0.71, 1.35, 0.72, 0.015, 0.03, 0.008, 0.02, 6, 2, 12, 21);
    m.addBox(-0.71, 1.35, 0.08, 0.035, 0.035, 0.02, 12);
    return m;
  })();

  parts.held_pistol = (() => {
    const m = createMeshBuilder();
    m.addBox(-0.71, 1.35, 0.14, 0.022, 0.025, 0.15, 21);
    m.addBox(-0.71, 1.31, 0.03, 0.02, 0.05, 0.025, 12);
    return m;
  })();

  parts.held_shovel = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(-0.71, 1.35, -0.25, -0.71, 1.35, 0.75, 0.02, 0.02, 0.02, 0.02, 6, 2, 12, 21);
    m.addBox(-0.71, 1.35, 0.86, 0.1, 0.018, 0.13, 21);
    return m;
  })();

  parts.held_lantern = (() => {
    const m = createMeshBuilder();
    m.addBox(-0.71, 1.22, 0.06, 0.055, 0.09, 0.055, 21);
    return m;
  })();

  parts.held_spyglass = (() => {
    const m = createMeshBuilder();
    m.addLimbTube(-0.71, 1.36, 0.04, -0.71, 1.36, 0.36, 0.022, 0.022, 0.034, 0.034, 8, 1, 12, 21);
    return m;
  })();

  parts.held_map = (() => {
    const m = createMeshBuilder();
    m.addBox(-0.71, 1.35, 0.1, 0.09, 0.01, 0.08, 21);
    return m;
  })();

  return parts;
}

// Compute column-major 4x4 inverse bind matrices for the 22 bones (translation-only bind pose)
function buildInverseBindMatrices() {
  const arr = new Float32Array(BONES.length * 16);
  for (let i = 0; i < BONES.length; i++) {
    const [wx, wy, wz] = WORLD_BONE_POS[i];
    const o = i * 16;
    arr[o + 0] = 1; arr[o + 5] = 1; arr[o + 10] = 1; arr[o + 15] = 1;
    arr[o + 12] = -wx;
    arr[o + 13] = -wy;
    arr[o + 14] = -wz;
  }
  return arr;
}

// Build a valid binary .glb file from named skinned meshes sharing BONES
function encodeGlb(namedMeshes) {
  const binChunks = [];
  let byteOffset = 0;

  function appendBuffer(typedArr) {
    const u8 = new Uint8Array(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
    const pad = (4 - (u8.byteLength % 4)) % 4;
    const padded = new Uint8Array(u8.byteLength + pad);
    padded.set(u8);
    const start = byteOffset;
    binChunks.push(padded);
    byteOffset += padded.byteLength;
    return { byteOffset: start, byteLength: u8.byteLength };
  }

  const bufferViews = [];
  const accessors = [];

  function addAccessor(typedArr, componentType, type, min = null, max = null) {
    const { byteOffset: off, byteLength: len } = appendBuffer(typedArr);
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: len });
    const count =
      type === 'SCALAR' ? typedArr.length :
      type === 'VEC2' ? typedArr.length / 2 :
      type === 'VEC3' ? typedArr.length / 3 :
      type === 'VEC4' ? typedArr.length / 4 :
      typedArr.length / 16;
    const acc = { bufferView: bvIdx, componentType, count, type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  }

  const ibmAcc = addAccessor(buildInverseBindMatrices(), 5126, 'MAT4');

  // Nodes 0..21 are skeleton bones
  const nodes = BONES.map((b) => {
    const node = { name: b.name, translation: b.pos };
    const children = [];
    BONES.forEach((c, idx) => {
      if (c.parent === BONES.indexOf(b)) children.push(idx);
    });
    if (children.length > 0) node.children = children;
    return node;
  });

  const meshes = [];
  const rootChildren = [0]; // Hips bone root

  for (const [meshName, m] of Object.entries(namedMeshes)) {
    const posArr = new Float32Array(m.positions);
    const normArr = new Float32Array(m.normals);
    const uvArr = new Float32Array(m.uvs);
    const jointArr = new Uint16Array(m.joints);
    const weightArr = new Float32Array(m.weights);
    const idxArr = new Uint16Array(m.indices);

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posArr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], posArr[i + k]);
        max[k] = Math.max(max[k], posArr[i + k]);
      }
    }

    const posAcc = addAccessor(posArr, 5126, 'VEC3', min, max);
    const normAcc = addAccessor(normArr, 5126, 'VEC3');
    const uvAcc = addAccessor(uvArr, 5126, 'VEC2');
    const jointAcc = addAccessor(jointArr, 5123, 'VEC4');
    const weightAcc = addAccessor(weightArr, 5126, 'VEC4');
    const idxAcc = addAccessor(idxArr, 5123, 'SCALAR');

    const meshIdx = meshes.length;
    meshes.push({
      name: meshName,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            TEXCOORD_0: uvAcc,
            JOINTS_0: jointAcc,
            WEIGHTS_0: weightAcc
          },
          indices: idxAcc,
          material: 0
        }
      ]
    });

    const nodeIdx = nodes.length;
    nodes.push({ name: meshName, mesh: meshIdx, skin: 0 });
    rootChildren.push(nodeIdx);
  }

  const gltf = {
    asset: { version: '2.0', generator: 'TreasureIsle Procedural Rig Generator' },
    scene: 0,
    scenes: [{ nodes: rootChildren }],
    nodes,
    skins: [
      {
        name: 'PirateRig',
        skeleton: 0,
        joints: BONES.map((_, i) => i),
        inverseBindMatrices: ibmAcc
      }
    ],
    materials: [
      {
        name: 'DefaultPirateMat',
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.08, roughnessFactor: 0.78 }
      }
    ],
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }]
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonBuf = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  const binBuf = Buffer.concat(binChunks.map((u) => Buffer.from(u)));

  const totalLen = 12 + 8 + jsonBuf.byteLength + 8 + binBuf.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonChunkHdr = Buffer.alloc(8);
  jsonChunkHdr.writeUInt32LE(jsonBuf.byteLength, 0);
  jsonChunkHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHdr = Buffer.alloc(8);
  binChunkHdr.writeUInt32LE(binBuf.byteLength, 0);
  binChunkHdr.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHdr, jsonBuf, binChunkHdr, binBuf]);
}

fs.writeFileSync(path.join(OUT_DIR, 'pirate_base.glb'), encodeGlb({ HumanoidBody: buildHumanoidBodyMesh() }));
fs.writeFileSync(path.join(OUT_DIR, 'clothing_pack.glb'), encodeGlb(buildClothingParts()));

console.log('Generated assets/models/pirate_base.glb and assets/models/clothing_pack.glb');
