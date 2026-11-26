import * as THREE from 'three';
import type { TreasureHuntPlan } from '@shared/treasure';
import type { IslandTerrainData } from '@shared/terrain';
import type { PlayerInputState } from '@client/character/playerController';
import type { TreasureWorldObjects } from './treasureWorld';

export class PirateBotBrain {
  public clueStage = 0;
  public digTimer = 0;
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 2.0;

  constructor(
    public readonly botId: string,
    public readonly teamId: number,
    public readonly berthPos: THREE.Vector3
  ) {}

  public computeInput(
    dt: number,
    botPos: THREE.Vector3,
    carryingChest: boolean,
    plan: TreasureHuntPlan,
    treasureObj: TreasureWorldObjects,
    carrierPos: THREE.Vector3 | null,
    carrierTeamId: number | null,
    terrain: IslandTerrainData
  ): { input: PlayerInputState; wantsDig: boolean; wantsAttack: boolean } {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.6 + Math.random() * 1.4;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    let target = this.berthPos;
    let wantsDig = false;
    let wantsAttack = false;

    if (carryingChest) {
      target = this.berthPos;
    } else if (treasureObj.chestState === 'carried' && carrierPos) {
      if (carrierTeamId !== this.teamId) {
        target = carrierPos;
        if (botPos.distanceTo(carrierPos) < 2.6) wantsAttack = true;
      } else {
        target = carrierPos.clone().add(new THREE.Vector3(this.strafeDir * 4, 0, 4));
      }
    } else if (treasureObj.chestState === 'dropped') {
      target = treasureObj.chestPos;
      if (botPos.distanceTo(target) < 2.6) wantsDig = true;
    } else if (this.clueStage < plan.clues.length) {
      const c = plan.clues[this.clueStage];
      target = new THREE.Vector3(c.x, c.y, c.z);
      if (botPos.distanceTo(target) < 3.0) {
        this.clueStage++;
      }
    } else {
      target = new THREE.Vector3(plan.treasurePos.x, plan.treasurePos.y, plan.treasurePos.z);
      if (botPos.distanceTo(target) < 3.4) {
        this.digTimer -= dt;
        if (this.digTimer <= 0) {
          wantsDig = true;
          this.digTimer = 1.2;
        }
      }
    }

    const toTarget = target.clone().sub(botPos);
    toTarget.y = 0;
    const dist = toTarget.length();
    let moveX = 0;
    let moveZ = 0;
    let camYaw = 0;

    if (dist > 1.0) {
      toTarget.normalize();
      camYaw = Math.atan2(-toTarget.x, -toTarget.z);
      moveZ = -1; // Forward relative to camYaw
      moveX = this.strafeDir * 0.12;
    }

    // Jump over steep steps ahead
    const aheadY = terrain.getHeight(botPos.x + toTarget.x * 1.4, botPos.z + toTarget.z * 1.4);
    const jumpPressed = aheadY - botPos.y > 0.6 && aheadY - botPos.y < 1.8;

    return {
      input: {
        moveX,
        moveZ,
        sprint: dist > 18 && !carryingChest,
        jumpPressed,
        camYaw
      },
      wantsDig,
      wantsAttack
    };
  }
}
