import * as THREE from 'three';
import type { TreasureHuntPlan } from '@shared/treasure';
import type { IslandTerrainData } from '@shared/terrain';

export class TreasureWorldObjects {
  public readonly group = new THREE.Group();
  public readonly chestGroup = new THREE.Group();
  private readonly chestLidPivot = new THREE.Group();
  private readonly clueMeshes: THREE.Group[] = [];
  private readonly xRockMarker = new THREE.Group();

  public chestPos = new THREE.Vector3();
  public chestState: 'buried' | 'dropped' | 'carried' | 'delivered' = 'buried';
  public carrierId: string | null = null;
  public digProgress = 0; // 0..2 digs to unearth

  constructor(private readonly plan: TreasureHuntPlan, private readonly terrain: IslandTerrainData) {
    this.buildClueObjects();
    this.buildBuriedChest();
  }

  private buildClueObjects(): void {
    const scrollMat = new THREE.MeshStandardMaterial({
      color: 0xf4e3b8,
      emissive: 0x6b4f12,
      emissiveIntensity: 0.45,
      roughness: 0.75
    });
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xb8292f, roughness: 0.5 });

    for (const c of this.plan.clues) {
      const g = new THREE.Group();
      g.position.set(c.x, c.y + 0.35, c.z);

      if (c.kind === 'rock_carving') {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.95, 0),
          new THREE.MeshStandardMaterial({ color: 0x6c6b66, roughness: 0.94 })
        );
        rock.position.y = 0.25;
        rock.castShadow = true;
        const xMat = new THREE.MeshBasicMaterial({ color: 0xffc845 });
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.14), xMat);
        bar1.position.set(0, 0.95, 0);
        bar1.rotation.y = Math.PI / 4;
        const bar2 = bar1.clone();
        bar2.rotation.y = -Math.PI / 4;
        g.add(rock, bar1, bar2);
        this.xRockMarker.copy(g);
      } else {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.65, 0.85),
          new THREE.MeshStandardMaterial({ color: 0x6b472a, roughness: 0.88 })
        );
        crate.castShadow = true;
        const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8), scrollMat);
        scroll.rotation.z = Math.PI / 2;
        scroll.position.y = 0.45;
        const seal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), waxMat);
        seal.position.set(0, 0.5, 0.06);
        const beacon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
        );
        beacon.position.y = 1.9;
        g.add(crate, scroll, seal, beacon);
      }

      this.group.add(g);
      this.clueMeshes.push(g);
    }
  }

  private buildBuriedChest(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5c361a, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4c430, metalness: 0.82, roughness: 0.26 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.52, 0.66), wood);
    base.position.y = 0.26;
    base.castShadow = true;

    const band = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.7), gold);
    band.position.y = 0.36;

    this.chestLidPivot.position.set(0, 0.52, -0.33);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 10, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0, 0.33);
    lid.castShadow = true;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08), gold);
    lock.position.set(0, -0.05, 0.66);
    this.chestLidPivot.add(lid, lock);

    const coins = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.52), gold);
    coins.position.y = 0.48;

    this.chestGroup.add(base, band, coins, this.chestLidPivot);
    this.chestPos.set(this.plan.treasurePos.x, this.plan.treasurePos.y - 0.6, this.plan.treasurePos.z);
    this.chestGroup.position.copy(this.chestPos);
    this.chestGroup.visible = false;
    this.group.add(this.chestGroup);
  }

  public updateVisuals(elapsed: number, activeClueIndex: number, carrierPos?: THREE.Vector3, carrierYaw = 0): void {
    this.clueMeshes.forEach((m, idx) => {
      m.visible = idx >= activeClueIndex;
      if (idx < 3) {
        m.children[1].position.y = 0.48 + Math.sin(elapsed * 2.5 + idx) * 0.06;
      }
    });

    if (this.chestState === 'buried') {
      this.chestGroup.visible = this.digProgress > 0;
      this.chestGroup.position.set(
        this.plan.treasurePos.x,
        this.plan.treasurePos.y - 0.45 + this.digProgress * 0.25,
        this.plan.treasurePos.z
      );
      this.chestLidPivot.rotation.x = 0;
    } else if (this.chestState === 'carried' && carrierPos) {
      this.chestGroup.visible = true;
      const offset = new THREE.Vector3(0, 1.05, 0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), carrierYaw);
      this.chestGroup.position.copy(carrierPos).add(offset);
      this.chestGroup.rotation.y = carrierYaw;
      this.chestLidPivot.rotation.x = -0.35;
    } else if (this.chestState === 'dropped') {
      this.chestGroup.visible = true;
      this.chestPos.y = this.terrain.getHeight(this.chestPos.x, this.chestPos.z);
      this.chestGroup.position.copy(this.chestPos);
      this.chestLidPivot.rotation.x = -0.5;
    } else if (this.chestState === 'delivered') {
      this.chestGroup.visible = true;
      this.chestLidPivot.rotation.x = -1.25;
    }
  }
}
