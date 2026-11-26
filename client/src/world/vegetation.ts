import * as THREE from 'three';
import { createRng } from '@shared/prng';
import { HALF_WORLD } from '@shared/constants';
import type { IslandTerrainData } from '@shared/terrain';
import type { SpatialCollisionGrid } from '@shared/spatialGrid';

interface VegBatch {
  mesh: THREE.InstancedMesh;
  maxCount: number;
}

export class VegetationSystem {
  public readonly group = new THREE.Group();
  private readonly batches: VegBatch[] = [];
  private readonly windUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1.0 }
  };

  constructor(
    private readonly terrain: IslandTerrainData,
    private readonly spatialGrid?: SpatialCollisionGrid
  ) {
    this.buildInstancedVegetation();
  }

  private addWindShader(mat: THREE.MeshStandardMaterial, swayAmount: number): THREE.MeshStandardMaterial {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniforms.uTime;
      shader.uniforms.uWind = this.windUniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float hFactor = clamp(position.y * 0.25, 0.0, 1.5);
           #ifdef USE_INSTANCING
             float phase = instanceMatrix[3][0] * 0.17 + instanceMatrix[3][2] * 0.21;
           #else
             float phase = 0.0;
           #endif
           transformed.x += sin(uTime * 1.9 + phase) * ${swayAmount.toFixed(3)} * hFactor * uWind;
           transformed.z += cos(uTime * 1.5 + phase) * ${(swayAmount * 0.6).toFixed(3)} * hFactor * uWind;`
        );
    };
    mat.customProgramCacheKey = () => `veg-wind-${swayAmount}`;
    return mat;
  }

  private nearLandmark(x: number, z: number): boolean {
    for (const lm of this.terrain.landmarks) {
      const dx = x - lm.x;
      const dz = z - lm.z;
      if (dx * dx + dz * dz < lm.radius * lm.radius * 0.72) return true;
    }
    return false;
  }

  private buildInstancedVegetation(): void {
    const rng = createRng(this.terrain.seed + 909);

    const palmPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const bushPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const fernPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const grassPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const flowerPlacements: { x: number; y: number; z: number; scale: number }[] = [];
    const rockPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const driftwoodPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
    const coconutPlacements: { x: number; y: number; z: number; scale: number }[] = [];
    const shellPlacements: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];

    for (let i = 0; i < 6800; i++) {
      const x = (rng() - 0.5) * (HALF_WORLD * 1.82);
      const z = (rng() - 0.5) * (HALF_WORLD * 1.82);
      if (this.nearLandmark(x, z)) continue;

      const s = this.terrain.sample(x, z);
      if (s.height < 0.25) continue;

      if (s.biome === 'beach') {
        if (s.height > 1.2 && s.slope < 0.3 && palmPlacements.length < 420 && rng() < 0.28) {
          const sc = 0.8 + rng() * 0.55;
          palmPlacements.push({ x, y: s.height, z, scale: sc, yaw: rng() * Math.PI * 2 });
          this.spatialGrid?.insert(x, z, 0.38 * sc);
          if (coconutPlacements.length < 180 && rng() < 0.35) {
            coconutPlacements.push({ x: x + (rng() - 0.5) * 1.4, y: this.terrain.getHeight(x, z) + 0.15, z: z + (rng() - 0.5) * 1.4, scale: 0.8 + rng() * 0.4 });
          }
        } else if (s.height < 2.2 && driftwoodPlacements.length < 160 && rng() < 0.14) {
          driftwoodPlacements.push({ x, y: s.height + 0.08, z, scale: 0.8 + rng() * 0.6, yaw: rng() * Math.PI * 2 });
        } else if (s.height < 1.8 && shellPlacements.length < 320 && rng() < 0.28) {
          shellPlacements.push({ x, y: s.height + 0.05, z, scale: 0.7 + rng() * 0.5, yaw: rng() * Math.PI * 2 });
        }
      } else if (s.biome === 'jungle' || s.biome === 'swamp') {
        if (s.slope < 0.36 && palmPlacements.length < 420 && rng() < 0.22) {
          const sc = 0.9 + rng() * 0.6;
          palmPlacements.push({ x, y: s.height, z, scale: sc, yaw: rng() * Math.PI * 2 });
          this.spatialGrid?.insert(x, z, 0.4 * sc);
        } else if (s.slope < 0.42 && bushPlacements.length < 520 && rng() < 0.35) {
          bushPlacements.push({ x, y: s.height, z, scale: 0.7 + rng() * 0.8, yaw: rng() * Math.PI * 2 });
        } else if (fernPlacements.length < 700 && rng() < 0.45) {
          fernPlacements.push({ x, y: s.height, z, scale: 0.75 + rng() * 0.65, yaw: rng() * Math.PI * 2 });
        } else if (flowerPlacements.length < 350 && rng() < 0.25) {
          flowerPlacements.push({ x, y: s.height + 0.12, z, scale: 0.8 + rng() * 0.5 });
        }
      } else if (s.biome === 'grassland') {
        if (grassPlacements.length < 1400 && s.slope < 0.4 && rng() < 0.65) {
          grassPlacements.push({ x, y: s.height, z, scale: 0.7 + rng() * 0.7, yaw: rng() * Math.PI * 2 });
        } else if (flowerPlacements.length < 350 && rng() < 0.18) {
          flowerPlacements.push({ x, y: s.height + 0.12, z, scale: 0.8 + rng() * 0.5 });
        } else if (bushPlacements.length < 520 && rng() < 0.15) {
          bushPlacements.push({ x, y: s.height, z, scale: 0.65 + rng() * 0.65, yaw: rng() * Math.PI * 2 });
        }
      }

      if ((s.biome === 'cliff' || s.biome === 'volcano' || s.slope > 0.38) && rockPlacements.length < 480 && rng() < 0.4) {
        const sc = 0.7 + rng() * 1.8;
        rockPlacements.push({ x, y: s.height - 0.15, z, scale: sc, yaw: rng() * Math.PI * 2 });
        this.spatialGrid?.insert(x, z, 0.9 * sc);
      }
    }

    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 6.2, 7);
    trunkGeo.translate(0, 3.0, 0);
    trunkGeo.rotateZ(0.12);
    const trunkMesh = new THREE.InstancedMesh(
      trunkGeo,
      this.addWindShader(new THREE.MeshStandardMaterial({ color: 0x6f4b2c, roughness: 0.92 }), 0.08),
      Math.max(1, palmPlacements.length)
    );
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const crownGeo = new THREE.ConeGeometry(2.5, 1.4, 7);
    crownGeo.translate(-0.7, 5.9, 0);
    const crownMesh = new THREE.InstancedMesh(
      crownGeo,
      this.addWindShader(new THREE.MeshStandardMaterial({ color: 0x2b7a35, roughness: 0.78 }), 0.16),
      Math.max(1, palmPlacements.length)
    );
    crownMesh.castShadow = true;

    palmPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.15, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      crownMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(trunkMesh, crownMesh);
    this.batches.push({ mesh: trunkMesh, maxCount: palmPlacements.length }, { mesh: crownMesh, maxCount: palmPlacements.length });

    // Bushes
    const bushGeo = new THREE.DodecahedronGeometry(1.15, 1);
    bushGeo.translate(0, 0.75, 0);
    const bushMesh = new THREE.InstancedMesh(
      bushGeo,
      this.addWindShader(new THREE.MeshStandardMaterial({ color: 0x2f6e2e, roughness: 0.86 }), 0.08),
      Math.max(1, bushPlacements.length)
    );
    bushMesh.castShadow = true;
    bushPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.1, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.scale * 1.15, p.scale * 0.85, p.scale * 1.15);
      dummy.updateMatrix();
      bushMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(bushMesh);
    this.batches.push({ mesh: bushMesh, maxCount: bushPlacements.length });

    // Ferns
    const fernGeo = new THREE.ConeGeometry(0.95, 0.9, 5);
    fernGeo.scale(1, -1, 1);
    fernGeo.translate(0, 0.65, 0);
    const fernMesh = new THREE.InstancedMesh(
      fernGeo,
      this.addWindShader(new THREE.MeshStandardMaterial({ color: 0x458b3c, roughness: 0.75 }), 0.18),
      Math.max(1, fernPlacements.length)
    );
    fernPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      fernMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(fernMesh);
    this.batches.push({ mesh: fernMesh, maxCount: fernPlacements.length });

    // Grass tufts
    const grassGeo = new THREE.ConeGeometry(0.42, 0.95, 4);
    grassGeo.translate(0, 0.45, 0);
    const grassMesh = new THREE.InstancedMesh(
      grassGeo,
      this.addWindShader(new THREE.MeshStandardMaterial({ color: 0x5d943c, roughness: 0.88 }), 0.25),
      Math.max(1, grassPlacements.length)
    );
    grassPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.05, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(grassMesh);
    this.batches.push({ mesh: grassMesh, maxCount: grassPlacements.length });

    // Tropical Flowers
    const flowerGeo = new THREE.DodecahedronGeometry(0.22, 0);
    const flowerMesh = new THREE.InstancedMesh(
      flowerGeo,
      new THREE.MeshStandardMaterial({ color: 0xff6b8b, roughness: 0.7 }),
      Math.max(1, flowerPlacements.length)
    );
    flowerPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(flowerMesh);
    this.batches.push({ mesh: flowerMesh, maxCount: flowerPlacements.length });

    // Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
    rockGeo.translate(0, 0.45, 0);
    const rockMesh = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshStandardMaterial({ color: 0x6e6d68, roughness: 0.94 }),
      Math.max(1, rockPlacements.length)
    );
    rockMesh.castShadow = true;
    rockPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(rng() * 0.4, p.yaw, rng() * 0.4);
      dummy.scale.set(p.scale * 1.2, p.scale * 0.85, p.scale);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(rockMesh);
    this.batches.push({ mesh: rockMesh, maxCount: rockPlacements.length });

    // Driftwood
    const driftGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.8, 6);
    driftGeo.rotateZ(Math.PI / 2);
    const driftMesh = new THREE.InstancedMesh(
      driftGeo,
      new THREE.MeshStandardMaterial({ color: 0x8e7960, roughness: 0.95 }),
      Math.max(1, driftwoodPlacements.length)
    );
    driftwoodPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0.04);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      driftMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(driftMesh);
    this.batches.push({ mesh: driftMesh, maxCount: driftwoodPlacements.length });

    // Coconuts & Seashells
    const cocoMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x4b301b, roughness: 0.88 }),
      Math.max(1, coconutPlacements.length)
    );
    coconutPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      cocoMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(cocoMesh);
    this.batches.push({ mesh: cocoMesh, maxCount: coconutPlacements.length });

    const shellMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.14, 0.22, 5),
      new THREE.MeshStandardMaterial({ color: 0xf4e3cf, roughness: 0.6 }),
      Math.max(1, shellPlacements.length)
    );
    shellPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(Math.PI / 2, p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      shellMesh.setMatrixAt(i, dummy.matrix);
    });
    this.group.add(shellMesh);
    this.batches.push({ mesh: shellMesh, maxCount: shellPlacements.length });
  }

  public setDensity(density: number): void {
    const d = THREE.MathUtils.clamp(density, 0.15, 1.0);
    for (const b of this.batches) {
      b.mesh.count = Math.max(1, Math.floor(b.maxCount * d));
    }
  }

  public update(elapsed: number, windStrength: number): void {
    this.windUniforms.uTime.value = elapsed;
    this.windUniforms.uWind.value = windStrength;
  }
}
