import * as THREE from 'three';
import { createRng } from '@shared/prng';
import { WATER_LEVEL } from '@shared/constants';
import type { IslandTerrainData } from '@shared/terrain';

interface BirdAgent {
  mesh: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  phase: number;
}

interface GroundCritter {
  mesh: THREE.Group;
  origin: THREE.Vector3;
  phase: number;
  speed: number;
  isFish: boolean;
}

export class WildlifeSystem {
  public readonly group = new THREE.Group();
  private readonly birds: BirdAgent[] = [];
  private readonly critters: GroundCritter[] = [];

  constructor(private readonly terrain: IslandTerrainData) {
    this.spawnWildlife();
  }

  private spawnWildlife(): void {
    const rng = createRng(this.terrain.seed + 5150);

    // 1. Circling Seabirds
    const birdMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.7 });
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 5), birdMat);
      body.rotation.x = Math.PI / 2;
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.24), birdMat);
      wingL.position.x = 0.34;
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.24), birdMat);
      wingR.position.x = -0.34;
      g.add(body, wingL, wingR);

      const ang = (i / 18) * Math.PI * 2;
      const cx = Math.cos(ang) * (250 + rng() * 380);
      const cz = Math.sin(ang) * (250 + rng() * 380);
      const cy = Math.max(18, this.terrain.getHeight(cx, cz) + 18 + rng() * 24);
      this.group.add(g);
      this.birds.push({
        mesh: g,
        wingL,
        wingR,
        center: new THREE.Vector3(cx, cy, cz),
        radius: 24 + rng() * 45,
        speed: 0.3 + rng() * 0.25,
        phase: rng() * Math.PI * 2
      });
    }

    // 2. Beach Crabs & Butterflies & Lagoon Fish
    const crabMat = new THREE.MeshStandardMaterial({ color: 0xd9483b, roughness: 0.7 });
    const bflyMat = new THREE.MeshBasicMaterial({ color: 0xffd147, side: THREE.DoubleSide });
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x3ec6e0, roughness: 0.4 });

    for (let i = 0; i < 48; i++) {
      const x = (rng() - 0.5) * 1450;
      const z = (rng() - 0.5) * 1450;
      const s = this.terrain.sample(x, z);

      if (s.biome === 'beach' && s.height > 0.1 && s.height < 2.2) {
        const g = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.22), crabMat);
        g.add(shell);
        g.position.set(x, s.height + 0.08, z);
        this.group.add(g);
        this.critters.push({ mesh: g, origin: g.position.clone(), phase: rng() * 6, speed: 1.6, isFish: false });
      } else if (s.biome === 'lagoon' && s.height < -0.6) {
        const g = new THREE.Group();
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), fishMat);
        f.rotation.x = Math.PI / 2;
        g.add(f);
        g.position.set(x, WATER_LEVEL - 0.6, z);
        this.group.add(g);
        this.critters.push({ mesh: g, origin: g.position.clone(), phase: rng() * 6, speed: 0.9, isFish: true });
      } else if (s.biome === 'jungle') {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), bflyMat);
        g.add(b);
        g.position.set(x, s.height + 1.4, z);
        this.group.add(g);
        this.critters.push({ mesh: g, origin: g.position.clone(), phase: rng() * 6, speed: 2.2, isFish: false });
      }
    }
  }

  public update(elapsed: number): void {
    for (const b of this.birds) {
      const a = elapsed * b.speed + b.phase;
      const x = b.center.x + Math.cos(a) * b.radius;
      const z = b.center.z + Math.sin(a) * b.radius;
      b.mesh.position.set(x, b.center.y + Math.sin(elapsed * 1.4 + b.phase) * 1.5, z);
      b.mesh.rotation.y = -a;
      const flap = Math.sin(elapsed * 9 + b.phase) * 0.5;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }

    for (const c of this.critters) {
      const t = elapsed * c.speed + c.phase;
      const ox = c.origin.x + Math.cos(t) * (c.isFish ? 4.5 : 1.8);
      const oz = c.origin.z + Math.sin(t) * (c.isFish ? 4.5 : 1.8);
      c.mesh.position.x = ox;
      c.mesh.position.z = oz;
      if (!c.isFish) {
        c.mesh.position.y = this.terrain.getHeight(ox, oz) + (c.origin.y > this.terrain.getHeight(c.origin.x, c.origin.z) + 0.5 ? 1.3 + Math.sin(t * 4) * 0.35 : 0.08);
      } else {
        c.mesh.rotation.y = -t;
      }
    }
  }
}
