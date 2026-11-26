import * as THREE from 'three';
import { PLAYER_COLORS } from '@shared/constants';
import type { IslandTerrainData, Landmark } from '@shared/terrain';
import type { SpatialCollisionGrid } from '@shared/spatialGrid';

export interface WardrobePoint {
  id: string;
  label: string;
  pos: THREE.Vector3;
  ownerIndex?: number;
}

export class LandmarksSystem {
  public readonly group = new THREE.Group();
  public readonly wardrobePoints: WardrobePoint[] = [];
  public readonly shipBerths: { ownerIndex: number; pos: THREE.Vector3; deliveryRadius: number }[] = [];
  private readonly torchLights: { light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];
  private readonly waterfalls: THREE.Mesh[] = [];

  constructor(
    private readonly terrain: IslandTerrainData,
    private readonly spatialGrid?: SpatialCollisionGrid
  ) {
    this.buildAll();
  }

  private makeWoodMat(hex = 0x6b472a): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88 });
  }

  private makeStoneMat(hex = 0x777671): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.94 });
  }

  private buildAll(): void {
    for (const lm of this.terrain.landmarks) {
      switch (lm.kind) {
        case 'ship_berth':
          this.buildShipBerth(lm);
          break;
        case 'port_village':
          this.buildPortVillage(lm);
          break;
        case 'temple_ruins':
          this.buildTempleRuins(lm);
          break;
        case 'pirate_fort':
          this.buildPirateFort(lm);
          break;
        case 'cave':
          this.buildCave(lm);
          break;
        case 'shipwreck':
          this.buildShipwreck(lm);
          break;
        case 'camp':
          this.buildCamp(lm);
          break;
        case 'waterfall':
          this.buildWaterfall(lm);
          break;
        case 'volcano':
          this.buildVolcanoCrater(lm);
          break;
      }
    }
  }

  private addWardrobeChest(parent: THREE.Object3D, x: number, y: number, z: number, id: string, label: string, worldPos: THREE.Vector3, ownerIndex?: number): void {
    const chest = new THREE.Group();
    chest.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.75), this.makeWoodMat(0x5b371b));
    body.position.y = 0.36;
    body.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.14, 0.78),
      new THREE.MeshStandardMaterial({ color: 0xc99c38, metalness: 0.7, roughness: 0.35 })
    );
    band.position.y = 0.52;
    chest.add(body, band);
    parent.add(chest);
    this.wardrobePoints.push({ id, label, pos: worldPos, ownerIndex });
  }

  private buildShipBerth(lm: Landmark): void {
    const idx = lm.ownerIndex ?? 0;
    const colorHex = PLAYER_COLORS[idx % PLAYER_COLORS.length].hex;
    const g = new THREE.Group();
    g.position.set(lm.x, 0, lm.z);
    g.rotation.y = lm.yaw;

    // Timber dock pier leading from shore to ship
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 16), this.makeWoodMat(0x734e30));
    pier.position.set(0, 0.75, -7);
    pier.castShadow = true;
    pier.receiveShadow = true;
    g.add(pier);

    for (let pz = -13; pz <= 0; pz += 3.2) {
      for (const px of [-1.4, 1.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 6), this.makeWoodMat(0x54361d));
        post.position.set(px, 0.1, pz);
        g.add(post);
      }
    }

    // Pirate Sloop moored at dock
    const ship = new THREE.Group();
    ship.position.set(4.6, 0.25, 2.5);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.1, 12.5), this.makeWoodMat(0x5d391e));
    hull.castShadow = true;
    hull.receiveShadow = true;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.15, 3.8, 6), this.makeWoodMat(0x523119));
    bow.rotation.x = Math.PI / 2;
    bow.position.z = 7.9;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 10.5, 8), this.makeWoodMat(0x4a2c17));
    mast.position.set(0, 5.2, 0.5);
    mast.castShadow = true;
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 6.4, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0xf4ecd8, side: THREE.DoubleSide, roughness: 0.9 })
    );
    sail.position.set(0, 6.0, 0.8);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.85, 0.08),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 })
    );
    flag.position.set(0.9, 10.1, 0.5);
    ship.add(hull, bow, mast, sail, flag);
    g.add(ship);

    // Delivery beacon ring on dock
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.14, 8, 24),
      new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.45 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 1.05, 0);
    g.add(ring);

    const wp = new THREE.Vector3(0, 1.05, -2.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), lm.yaw).add(g.position);
    this.addWardrobeChest(g, 0, 1.0, -2.5, `wardrobe_${lm.id}`, `Ship ${idx + 1} Wardrobe`, wp, idx);

    this.shipBerths.push({
      ownerIndex: idx,
      pos: new THREE.Vector3(lm.x, 1.0, lm.z),
      deliveryRadius: 6.5
    });

    this.group.add(g);
  }

  private buildPortVillage(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y, lm.z);
    g.rotation.y = lm.yaw;

    const houseOffsets = [
      { x: -10, z: -6, w: 7, d: 6, h: 4.5, ry: 0.2 },
      { x: 9, z: -4, w: 8, d: 6.5, h: 5.0, ry: -0.3 },
      { x: 0, z: 10, w: 6.5, d: 5.5, h: 4.2, ry: 0.1 }
    ];

    for (const h of houseOffsets) {
      const hy = this.terrain.getHeight(lm.x + h.x, lm.z + h.z) - lm.y;
      const house = new THREE.Group();
      house.position.set(h.x, hy, h.z);
      house.rotation.y = h.ry;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), this.makeWoodMat(0xc7b292));
      wall.position.y = h.h / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(h.w, h.d) * 0.78, 3.0, 4), this.makeWoodMat(0x633722));
      roof.position.y = h.h + 1.4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      house.add(wall, roof);
      g.add(house);
    }

    const lanternLight = new THREE.PointLight(0xffaa44, 2.2, 26);
    lanternLight.position.set(0, 3.8, 0);
    g.add(lanternLight);
    this.torchLights.push({ light: lanternLight, baseIntensity: 2.2, phase: 0.5 });

    this.addWardrobeChest(g, 2.5, 0, 1.5, 'wardrobe_port', 'Port Tailor Chest', new THREE.Vector3(lm.x + 2.5, lm.y, lm.z + 1.5));
    this.group.add(g);
  }

  private buildTempleRuins(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y - 0.3, lm.z);
    g.rotation.y = lm.yaw;

    const stone = this.makeStoneMat(0x8c8779);
    const tiers = [
      { w: 18, h: 1.8, y: 0.9 },
      { w: 13, h: 1.8, y: 2.7 },
      { w: 8, h: 1.8, y: 4.5 }
    ];
    for (const t of tiers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.w), stone);
      m.position.y = t.y;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }

    // Broken columns
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const colH = 3.2 + (i % 3) * 1.4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, colH, 8), stone);
      col.position.set(Math.cos(a) * 10.5, colH / 2 + 0.5, Math.sin(a) * 10.5);
      col.castShadow = true;
      g.add(col);
    }

    this.group.add(g);
  }

  private buildPirateFort(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y - 0.4, lm.z);
    g.rotation.y = lm.yaw;

    const stone = this.makeStoneMat(0x6d6c67);
    const walls = [
      { x: 0, z: -8, w: 16, d: 2, h: 5 },
      { x: -8, z: 0, w: 2, d: 16, h: 5 },
      { x: 8, z: 0, w: 2, d: 12, h: 4.2 }
    ];
    for (const w of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), stone);
      wall.position.set(w.x, w.h / 2, w.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      g.add(wall);
    }

    // Watchtower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 9.5, 8), stone);
    tower.position.set(-7, 4.75, -7);
    tower.castShadow = true;
    g.add(tower);

    // Cannon barrel
    const cannon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.36, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x26292e, metalness: 0.85, roughness: 0.38 })
    );
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, 5.4, -7.8);
    g.add(cannon);

    this.group.add(g);
  }

  private buildCave(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y - 0.5, lm.z);
    g.rotation.y = lm.yaw;

    const rock = this.makeStoneMat(0x524f4a);
    const archL = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), rock);
    archL.position.set(-2.6, 2.2, 0);
    const archR = archL.clone();
    archR.position.set(2.6, 2.2, 0);
    const top = new THREE.Mesh(new THREE.DodecahedronGeometry(3.4, 0), rock);
    top.position.set(0, 4.4, -0.8);
    const darkInterior = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 3.8, 3.5),
      new THREE.MeshStandardMaterial({ color: 0x100f12, roughness: 1.0 })
    );
    darkInterior.position.set(0, 1.9, -2.2);
    g.add(archL, archR, top, darkInterior);

    // Flickering Torch
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), this.makeWoodMat(0x4b2f17));
    stick.position.set(2.1, 0.8, 1.6);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.48, 6),
      new THREE.MeshBasicMaterial({ color: 0xffa033 })
    );
    flame.position.set(2.1, 1.8, 1.6);
    const tLight = new THREE.PointLight(0xff8e2b, 3.0, 22);
    tLight.position.set(2.1, 2.1, 1.8);
    g.add(stick, flame, tLight);
    this.torchLights.push({ light: tLight, baseIntensity: 3.0, phase: lm.x * 0.1 });

    this.group.add(g);
  }

  private buildShipwreck(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y - 0.3, lm.z);
    g.rotation.set(0.22, lm.yaw, -0.28);

    const wood = this.makeWoodMat(0x4f3522);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 11), wood);
    hull.position.y = 0.8;
    hull.castShadow = true;
    const brokenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 6.2, 7), wood);
    brokenMast.position.set(0, 3.6, 1);
    brokenMast.rotation.z = 0.35;
    g.add(hull, brokenMast);

    this.group.add(g);
  }

  private buildCamp(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y, lm.z);
    g.rotation.y = lm.yaw;

    const tent = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: 0xd9c59e, roughness: 0.92 })
    );
    tent.position.set(-2.5, 1.3, -1.5);
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;

    const fireLight = new THREE.PointLight(0xff7722, 2.8, 20);
    fireLight.position.set(1.5, 1.2, 1.5);
    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    ember.position.set(1.5, 0.2, 1.5);
    g.add(tent, fireLight, ember);
    this.torchLights.push({ light: fireLight, baseIntensity: 2.8, phase: lm.z * 0.1 });

    this.addWardrobeChest(g, 0, 0, -3.2, `wardrobe_${lm.id}`, `${lm.name} Chest`, new THREE.Vector3(lm.x, lm.y, lm.z - 3.2));

    // Barrels & supply crates around camp
    const barrelMat = this.makeWoodMat(0x5a3a1e);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.85, 8), barrelMat);
    b1.position.set(2.4, 0.42, -1.2);
    b1.castShadow = true;
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), this.makeWoodMat(0x7c5432));
    c1.position.set(-1.6, 0.35, 2.2);
    c1.castShadow = true;
    g.add(b1, c1);
    this.spatialGrid?.insert(lm.x - 2.5, lm.z - 1.5, 1.8);

    this.group.add(g);
  }

  private buildWaterfall(lm: Landmark): void {
    const g = new THREE.Group();
    g.position.set(lm.x, lm.y, lm.z);
    g.rotation.y = lm.yaw;

    const wfMat = new THREE.MeshBasicMaterial({ color: 0xbcf2ff, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 14), wfMat);
    ribbon.position.set(0, 4.5, 0);
    ribbon.rotation.x = -0.25;
    g.add(ribbon);
    this.waterfalls.push(ribbon);
    this.group.add(g);
  }

  private buildVolcanoCrater(lm: Landmark): void {
    const lava = new THREE.Mesh(
      new THREE.CircleGeometry(28, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4d14 })
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(lm.x, lm.y + 1.5, lm.z);
    const glow = new THREE.PointLight(0xff4400, 4.5, 90);
    glow.position.set(lm.x, lm.y + 8, lm.z);
    this.group.add(lava, glow);
  }

  public update(elapsed: number): void {
    for (const t of this.torchLights) {
      t.light.intensity = t.baseIntensity + Math.sin(elapsed * 11 + t.phase) * 0.45 + Math.cos(elapsed * 17 + t.phase) * 0.25;
    }
    for (const wf of this.waterfalls) {
      (wf.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(elapsed * 6) * 0.1;
    }
  }
}
