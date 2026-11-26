import * as THREE from 'three';
import { HALF_WORLD, MOVE_SPEEDS, WATER_LEVEL } from '@shared/constants';
import type { IslandTerrainData } from '@shared/terrain';
import type { HumanoidCharacter } from './humanoidRig';

export interface PlayerInputState {
  moveX: number; // -1..1 right
  moveZ: number; // -1..1 forward/back
  sprint: boolean;
  jumpPressed: boolean;
  camYaw: number;
}

export class PlayerPhysicsController {
  public pos = new THREE.Vector3(0, 10, 0);
  public vel = new THREE.Vector3();
  public yaw = 0;
  public grounded = false;
  public wasGrounded = false;
  public inWater = false;
  public wading = false;
  public carryingChest = false;
  public knockedDownTimer = 0;
  public hitStunTimer = 0;
  public firstPerson = false;

  public coyoteTimer = 0;
  private landTimer = 0;

  public step(
    dt: number,
    input: PlayerInputState,
    terrain: IslandTerrainData,
    char: HumanoidCharacter,
    raining: boolean
  ): { surface: 'sand' | 'grass' | 'rock' | 'mud' | 'water'; stepped: boolean } {
    this.wasGrounded = this.grounded;
    if (this.knockedDownTimer > 0) {
      this.knockedDownTimer = Math.max(0, this.knockedDownTimer - dt);
      if (this.knockedDownTimer === 0) {
        char.anim.playOneShot('getup', 0.12);
        this.hitStunTimer = 0.65;
      }
    }
    if (this.hitStunTimer > 0) this.hitStunTimer = Math.max(0, this.hitStunTimer - dt);
    if (this.landTimer > 0) this.landTimer = Math.max(0, this.landTimer - dt);

    const sample = terrain.sample(this.pos.x, this.pos.z);
    const groundY = sample.height;
    const waterDepth = WATER_LEVEL - groundY;

    this.wading = waterDepth > 0.15 && waterDepth <= 1.15 && this.pos.y <= WATER_LEVEL + 0.1;
    this.inWater = waterDepth > 1.15 && this.pos.y <= WATER_LEVEL - 0.15;

    // Update wetness & mud shaders
    char.updateEnvironmentSurface(dt, this.inWater || this.wading, raining, sample.biome === 'swamp');

    // Movement vector in camera yaw space
    const fwd = new THREE.Vector3(-Math.sin(input.camYaw), 0, -Math.cos(input.camYaw));
    const right = new THREE.Vector3(Math.cos(input.camYaw), 0, -Math.sin(input.camYaw));
    const moveDir = new THREE.Vector3()
      .addScaledVector(fwd, -input.moveZ)
      .addScaledVector(right, input.moveX);
    const moveMag = Math.min(1, moveDir.length());
    if (moveMag > 0.01) moveDir.normalize();

    const canControl = this.knockedDownTimer <= 0 && this.hitStunTimer <= 0;
    let speed: number = MOVE_SPEEDS.run;
    if (this.inWater) speed = MOVE_SPEEDS.swim;
    else if (this.wading) speed = MOVE_SPEEDS.wade;
    else if (input.sprint && moveMag > 0.45 && !this.carryingChest) speed = MOVE_SPEEDS.sprint;
    else if (moveMag < 0.45) speed = MOVE_SPEEDS.walk;

    if (this.carryingChest) speed *= MOVE_SPEEDS.carryMult;

    if (canControl) {
      const accel = this.grounded || this.inWater ? 14 : 5;
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, moveDir.x * speed * moveMag, Math.min(1, dt * accel));
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, moveDir.z * speed * moveMag, Math.min(1, dt * accel));

      if (moveMag > 0.08) {
        const targetYaw = Math.atan2(moveDir.x, moveDir.z);
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 11);
      }
    } else {
      this.vel.x *= 0.92;
      this.vel.z *= 0.92;
    }

    // Slope steepness pushback
    if (this.grounded && sample.slope > 0.65) {
      const eps = 1.5;
      const gx = terrain.getHeight(this.pos.x + eps, this.pos.z) - terrain.getHeight(this.pos.x - eps, this.pos.z);
      const gz = terrain.getHeight(this.pos.x, this.pos.z + eps) - terrain.getHeight(this.pos.x, this.pos.z - eps);
      const downSlope = new THREE.Vector3(-gx, 0, -gz).normalize();
      this.vel.addScaledVector(downSlope, 16 * dt);
    }

    // Ledge climb: if moving into a step 0.6..1.6m higher right ahead
    if (canControl && moveMag > 0.4 && input.jumpPressed && !this.inWater) {
      const aheadY = terrain.getHeight(this.pos.x + moveDir.x * 1.15, this.pos.z + moveDir.z * 1.15);
      const stepH = aheadY - this.pos.y;
      if (stepH > 0.55 && stepH <= 1.65) {
        this.vel.y = 7.8;
        this.grounded = false;
        char.anim.playOneShot('climb', 0.1);
      }
    }

    if (this.grounded) this.coyoteTimer = 0.14;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (canControl && input.jumpPressed) {
      if (this.inWater) {
        this.vel.y = 4.6;
      } else if (this.coyoteTimer > 0) {
        this.vel.y = 8.4;
        this.grounded = false;
        this.coyoteTimer = 0;
        char.anim.playOneShot('jump', 0.08);
      }
    }

    // Gravity / Buoyancy
    if (this.inWater) {
      const targetSwimY = WATER_LEVEL - 1.05;
      const buoy = (targetSwimY - this.pos.y) * 14;
      this.vel.y += (buoy - this.vel.y * 4.5) * dt;
    } else {
      this.vel.y -= 22 * dt;
    }

    this.pos.addScaledVector(this.vel, dt);

    // Clamp to outer ocean boundary
    const maxBound = HALF_WORLD + 160;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -maxBound, maxBound);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -maxBound, maxBound);

    const newGroundY = terrain.getHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= newGroundY) {
      if (!this.wasGrounded && this.vel.y < -9 && !this.inWater) {
        this.landTimer = 0.22;
        char.anim.playOneShot('land', 0.08);
      }
      this.pos.y = newGroundY;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Update character transform & animation state machine
    char.root.position.copy(this.pos);
    char.root.rotation.y = this.yaw;

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.knockedDownTimer > 0) {
      char.anim.setLocomotionState('knockdown');
    } else if (this.carryingChest) {
      char.anim.setLocomotionState(horizSpeed > 0.4 ? 'carry' : 'idle');
    } else if (this.inWater) {
      char.anim.setLocomotionState('swim');
    } else if (!this.grounded && this.pos.y - newGroundY > 0.65) {
      char.anim.setLocomotionState('fall');
    } else if (this.wading && horizSpeed > 0.3) {
      char.anim.setLocomotionState('wade');
    } else if (horizSpeed > 6.8) {
      char.anim.setLocomotionState('sprint');
    } else if (horizSpeed > 4.2) {
      char.anim.setLocomotionState('run');
    } else if (horizSpeed > 0.35) {
      char.anim.setLocomotionState('walk');
    } else {
      char.anim.setLocomotionState('idle');
    }

    char.anim.update(dt, terrain, this.pos, this.yaw, this.grounded);

    const surface = this.inWater || this.wading
      ? 'water'
      : sample.splat[4] > 0.35 ? 'mud'
      : sample.splat[3] > 0.35 ? 'rock'
      : sample.splat[0] > 0.45 ? 'sand'
      : 'grass';

    return { surface, stepped: (this.grounded || this.wading) && horizSpeed > 0.6 };
  }

  public updateCamera(
    camera: THREE.PerspectiveCamera,
    camYaw: number,
    camPitch: number,
    terrain: IslandTerrainData,
    char: HumanoidCharacter,
    dt: number
  ): void {
    char.root.visible = !this.firstPerson;

    if (this.firstPerson) {
      const eye = this.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
      camera.position.copy(eye);
      const look = eye.clone().add(
        new THREE.Vector3(
          -Math.sin(camYaw) * Math.cos(camPitch),
          -Math.sin(camPitch),
          -Math.cos(camYaw) * Math.cos(camPitch)
        )
      );
      camera.lookAt(look);
      return;
    }

    const focus = this.pos.clone().add(new THREE.Vector3(0, 1.48, 0));
    const camDist = 5.4;
    const ideal = new THREE.Vector3(
      focus.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      focus.y + Math.sin(camPitch) * camDist + 0.45,
      focus.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
    );

    // Camera terrain collision: pull forward if terrain intersects boom
    for (let t = 0.25; t <= 1.0; t += 0.15) {
      const samplePos = focus.clone().lerp(ideal, t);
      const th = terrain.getHeight(samplePos.x, samplePos.z) + 0.45;
      if (samplePos.y < th) {
        ideal.y = Math.max(ideal.y, th + 0.35);
      }
    }

    camera.position.lerp(ideal, Math.min(1, dt * 15));
    camera.lookAt(focus);
  }
}
