import * as THREE from 'three';
import type { IslandTerrainData } from '@shared/terrain';

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'land'
  | 'swim'
  | 'wade'
  | 'climb'
  | 'dig'
  | 'slash'
  | 'carry'
  | 'open_chest'
  | 'victory'
  | 'emote_wave'
  | 'emote_cheer'
  | 'emote_dance'
  | 'emote_bow'
  | 'hit'
  | 'knockdown'
  | 'getup';

function qTrack(bone: string, times: number[], eulers: [number, number, number][]): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [rx, ry, rz] of eulers) {
    e.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

function posYTrack(bone: string, times: number[], ys: number[], basePos = [0, 0.94, 0]): THREE.VectorKeyframeTrack {
  const values: number[] = [];
  for (const y of ys) {
    values.push(basePos[0], basePos[1] + y, basePos[2]);
  }
  return new THREE.VectorKeyframeTrack(`${bone}.position`, times, values);
}

function buildClipLibrary(): Record<AnimName, THREE.AnimationClip> {
  // Base relaxed arm-down pose from T-pose (~1.22 rad down around Z)
  const L_DOWN = -1.24;
  const R_DOWN = 1.24;

  const makeLocomotion = (name: string, dur: number, stride: number, armSwing: number, bob: number, lean: number, kneeBend = 0.45) =>
    new THREE.AnimationClip(name, dur, [
      posYTrack('Hips', [0, dur * 0.25, dur * 0.5, dur * 0.75, dur], [0, bob, 0, bob, 0]),
      qTrack('Spine', [0, dur * 0.5, dur], [[lean, 0.06, 0], [lean, -0.06, 0], [lean, 0.06, 0]]),
      qTrack('UpperArmL', [0, dur * 0.5, dur], [[armSwing, 0, L_DOWN], [-armSwing, 0, L_DOWN], [armSwing, 0, L_DOWN]]),
      qTrack('UpperArmR', [0, dur * 0.5, dur], [[-armSwing, 0, R_DOWN], [armSwing, 0, R_DOWN], [-armSwing, 0, R_DOWN]]),
      qTrack('ForearmL', [0, dur], [[0, -0.35, 0], [0, -0.35, 0]]),
      qTrack('ForearmR', [0, dur], [[0, 0.35, 0], [0, 0.35, 0]]),
      qTrack('ThighL', [0, dur * 0.5, dur], [[-stride, 0, 0], [stride, 0, 0], [-stride, 0, 0]]),
      qTrack('ThighR', [0, dur * 0.5, dur], [[stride, 0, 0], [-stride, 0, 0], [stride, 0, 0]]),
      qTrack('ShinL', [0, dur * 0.25, dur * 0.5, dur * 0.75, dur], [[0.1, 0, 0], [kneeBend, 0, 0], [0.05, 0, 0], [kneeBend * 0.5, 0, 0], [0.1, 0, 0]]),
      qTrack('ShinR', [0, dur * 0.25, dur * 0.5, dur * 0.75, dur], [[0.05, 0, 0], [kneeBend * 0.5, 0, 0], [0.1, 0, 0], [kneeBend, 0, 0], [0.05, 0, 0]])
    ]);

  return {
    idle: new THREE.AnimationClip('idle', 2.4, [
      posYTrack('Hips', [0, 1.2, 2.4], [0, -0.015, 0]),
      qTrack('Chest', [0, 1.2, 2.4], [[0.02, 0, 0], [-0.02, 0, 0], [0.02, 0, 0]]),
      qTrack('UpperArmL', [0, 1.2, 2.4], [[0.04, 0, L_DOWN], [-0.04, 0, L_DOWN - 0.04], [0.04, 0, L_DOWN]]),
      qTrack('UpperArmR', [0, 1.2, 2.4], [[-0.04, 0, R_DOWN], [0.04, 0, R_DOWN + 0.04], [-0.04, 0, R_DOWN]])
    ]),
    walk: makeLocomotion('walk', 0.9, 0.42, 0.34, 0.03, 0.05, 0.35),
    run: makeLocomotion('run', 0.62, 0.68, 0.64, 0.055, 0.14, 0.65),
    sprint: makeLocomotion('sprint', 0.44, 0.92, 0.95, 0.075, 0.24, 0.95),
    wade: makeLocomotion('wade', 1.05, 0.46, 0.48, 0.04, 0.1, 0.72),
    swim: new THREE.AnimationClip('swim', 1.1, [
      qTrack('Hips', [0, 1.1], [[1.28, 0, 0], [1.28, 0, 0]]),
      qTrack('UpperArmL', [0, 0.55, 1.1], [[-1.3, 0, -0.5], [0.7, 0, -1.1], [-1.3, 0, -0.5]]),
      qTrack('UpperArmR', [0, 0.55, 1.1], [[0.7, 0, 1.1], [-1.3, 0, 0.5], [0.7, 0, 1.1]]),
      qTrack('ThighL', [0, 0.55, 1.1], [[0.35, 0, 0], [-0.35, 0, 0], [0.35, 0, 0]]),
      qTrack('ThighR', [0, 0.55, 1.1], [[-0.35, 0, 0], [0.35, 0, 0], [-0.35, 0, 0]])
    ]),
    jump: new THREE.AnimationClip('jump', 0.5, [
      qTrack('UpperArmL', [0, 0.5], [[-0.8, 0, -0.5], [-0.8, 0, -0.5]]),
      qTrack('UpperArmR', [0, 0.5], [[-0.8, 0, 0.5], [-0.8, 0, 0.5]]),
      qTrack('ThighL', [0, 0.5], [[-0.5, 0, 0], [-0.5, 0, 0]]),
      qTrack('ShinL', [0, 0.5], [[0.7, 0, 0], [0.7, 0, 0]])
    ]),
    fall: new THREE.AnimationClip('fall', 0.6, [
      qTrack('UpperArmL', [0, 0.3, 0.6], [[0, 0, -0.35], [0.2, 0, -0.2], [0, 0, -0.35]]),
      qTrack('UpperArmR', [0, 0.3, 0.6], [[0, 0, 0.35], [-0.2, 0, 0.2], [0, 0, 0.35]]),
      qTrack('ThighL', [0, 0.6], [[-0.25, 0, 0], [-0.25, 0, 0]]),
      qTrack('ThighR', [0, 0.6], [[0.2, 0, 0], [0.2, 0, 0]])
    ]),
    land: new THREE.AnimationClip('land', 0.28, [
      posYTrack('Hips', [0, 0.14, 0.28], [0, -0.14, 0]),
      qTrack('ThighL', [0, 0.14, 0.28], [[0, 0, 0], [-0.55, 0, 0], [0, 0, 0]]),
      qTrack('ShinL', [0, 0.14, 0.28], [[0, 0, 0], [0.9, 0, 0], [0, 0, 0]]),
      qTrack('ThighR', [0, 0.14, 0.28], [[0, 0, 0], [-0.55, 0, 0], [0, 0, 0]]),
      qTrack('ShinR', [0, 0.14, 0.28], [[0, 0, 0], [0.9, 0, 0], [0, 0, 0]])
    ]),
    climb: new THREE.AnimationClip('climb', 0.6, [
      posYTrack('Hips', [0, 0.3, 0.6], [-0.1, 0.08, 0]),
      qTrack('UpperArmL', [0, 0.3, 0.6], [[-1.5, 0, -0.4], [-0.8, 0, L_DOWN], [-0.2, 0, L_DOWN]]),
      qTrack('UpperArmR', [0, 0.3, 0.6], [[-1.5, 0, 0.4], [-0.8, 0, R_DOWN], [-0.2, 0, R_DOWN]]),
      qTrack('ThighL', [0, 0.3, 0.6], [[-0.9, 0, 0], [-0.4, 0, 0], [0, 0, 0]])
    ]),
    dig: new THREE.AnimationClip('dig', 0.85, [
      qTrack('Spine', [0, 0.4, 0.85], [[0.2, 0, 0], [0.55, 0, 0], [0.2, 0, 0]]),
      qTrack('UpperArmR', [0, 0.35, 0.65, 0.85], [[-0.5, 0, R_DOWN], [-1.1, 0.2, 0.8], [-0.2, 0.3, 0.7], [-0.5, 0, R_DOWN]]),
      qTrack('UpperArmL', [0, 0.35, 0.65, 0.85], [[-0.4, 0, L_DOWN], [-0.9, -0.2, -0.8], [-0.3, -0.3, -0.7], [-0.4, 0, L_DOWN]])
    ]),
    slash: new THREE.AnimationClip('slash', 0.42, [
      qTrack('Chest', [0, 0.14, 0.3, 0.42], [[0, -0.45, 0], [0.15, 0.55, 0], [0.1, 0.3, 0], [0, 0, 0]]),
      qTrack('UpperArmR', [0, 0.14, 0.3, 0.42], [[-0.8, -0.6, 0.6], [-1.2, 0.8, 0.2], [-0.3, 0.3, R_DOWN], [0, 0, R_DOWN]])
    ]),
    carry: new THREE.AnimationClip('carry', 0.75, [
      qTrack('Spine', [0, 0.75], [[-0.08, 0, 0], [-0.08, 0, 0]]),
      qTrack('UpperArmL', [0, 0.75], [[-0.9, 0.3, -0.8], [-0.9, 0.3, -0.8]]),
      qTrack('UpperArmR', [0, 0.75], [[-0.9, -0.3, 0.8], [-0.9, -0.3, 0.8]]),
      qTrack('ThighL', [0, 0.38, 0.75], [[-0.32, 0, 0], [0.32, 0, 0], [-0.32, 0, 0]]),
      qTrack('ThighR', [0, 0.38, 0.75], [[0.32, 0, 0], [-0.32, 0, 0], [0.32, 0, 0]])
    ]),
    open_chest: new THREE.AnimationClip('open_chest', 1.0, [
      qTrack('Spine', [0, 0.5, 1.0], [[0.45, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
      qTrack('UpperArmL', [0, 0.5, 1.0], [[-0.8, 0, -0.7], [-1.4, 0, -0.5], [0, 0, L_DOWN]]),
      qTrack('UpperArmR', [0, 0.5, 1.0], [[-0.8, 0, 0.7], [-1.4, 0, 0.5], [0, 0, R_DOWN]])
    ]),
    victory: new THREE.AnimationClip('victory', 1.2, [
      posYTrack('Hips', [0, 0.3, 0.6, 0.9, 1.2], [0, 0.16, 0, 0.14, 0]),
      qTrack('UpperArmL', [0, 0.6, 1.2], [[0, 0, 0.3], [-0.2, 0, 0.5], [0, 0, 0.3]]),
      qTrack('UpperArmR', [0, 0.6, 1.2], [[0, 0, -0.3], [-0.2, 0, -0.5], [0, 0, -0.3]])
    ]),
    emote_wave: new THREE.AnimationClip('emote_wave', 1.1, [
      qTrack('UpperArmR', [0, 0.3, 0.6, 0.9, 1.1], [[0, 0, 0.2], [0, 0, -0.2], [0, 0, 0.2], [0, 0, -0.2], [0, 0, R_DOWN]]),
      qTrack('UpperArmL', [0, 1.1], [[0, 0, L_DOWN], [0, 0, L_DOWN]])
    ]),
    emote_cheer: new THREE.AnimationClip('emote_cheer', 1.0, [
      posYTrack('Hips', [0, 0.25, 0.5, 0.75, 1.0], [0, 0.12, 0, 0.12, 0]),
      qTrack('UpperArmL', [0, 0.5, 1.0], [[0, 0, 0.35], [0, 0, 0.55], [0, 0, 0.35]]),
      qTrack('UpperArmR', [0, 0.5, 1.0], [[0, 0, -0.35], [0, 0, -0.55], [0, 0, -0.35]])
    ]),
    emote_dance: new THREE.AnimationClip('emote_dance', 1.2, [
      posYTrack('Hips', [0, 0.3, 0.6, 0.9, 1.2], [0, -0.08, 0, -0.08, 0]),
      qTrack('Hips', [0, 0.3, 0.6, 0.9, 1.2], [[0, 0.25, 0], [0, -0.25, 0], [0, 0.25, 0], [0, -0.25, 0], [0, 0.25, 0]]),
      qTrack('UpperArmL', [0, 0.6, 1.2], [[-0.6, 0, -0.3], [0.4, 0, -0.8], [-0.6, 0, -0.3]]),
      qTrack('UpperArmR', [0, 0.6, 1.2], [[0.4, 0, 0.8], [-0.6, 0, 0.3], [0.4, 0, 0.8]])
    ]),
    emote_bow: new THREE.AnimationClip('emote_bow', 1.2, [
      qTrack('Spine', [0, 0.6, 1.2], [[0, 0, 0], [0.65, 0, 0], [0, 0, 0]]),
      qTrack('UpperArmR', [0, 0.6, 1.2], [[0, 0, R_DOWN], [-0.4, 0.6, 0.8], [0, 0, R_DOWN]]),
      qTrack('UpperArmL', [0, 1.2], [[0, 0, L_DOWN], [0, 0, L_DOWN]])
    ]),
    hit: new THREE.AnimationClip('hit', 0.35, [
      qTrack('Spine', [0, 0.15, 0.35], [[0, 0, 0], [-0.35, 0.2, 0], [0, 0, 0]])
    ]),
    knockdown: new THREE.AnimationClip('knockdown', 0.9, [
      posYTrack('Hips', [0, 0.35, 0.9], [0, -0.68, -0.72]),
      qTrack('Hips', [0, 0.35, 0.9], [[0, 0, 0], [-1.45, 0, 0], [-1.48, 0, 0]])
    ]),
    getup: new THREE.AnimationClip('getup', 0.7, [
      posYTrack('Hips', [0, 0.35, 0.7], [-0.72, -0.3, 0]),
      qTrack('Hips', [0, 0.35, 0.7], [[-1.48, 0, 0], [-0.5, 0, 0], [0, 0, 0]])
    ])
  };
}

let sharedClips: Record<AnimName, THREE.AnimationClip> | null = null;

export class HumanoidAnimController {
  public readonly mixer: THREE.AnimationMixer;
  public currentState: AnimName = 'idle';
  private readonly actions = new Map<AnimName, THREE.AnimationAction>();
  private oneShotTimer = 0;

  private readonly hipsBone?: THREE.Bone;
  private readonly thighLBone?: THREE.Bone;
  private readonly thighRBone?: THREE.Bone;
  private readonly footLBone?: THREE.Bone;
  private readonly footRBone?: THREE.Bone;

  constructor(root: THREE.Object3D, bones: THREE.Bone[]) {
    if (!sharedClips) sharedClips = buildClipLibrary();
    this.mixer = new THREE.AnimationMixer(root);

    for (const [name, clip] of Object.entries(sharedClips) as [AnimName, THREE.AnimationClip][]) {
      const action = this.mixer.clipAction(clip);
      const isOneShot = ['jump', 'land', 'climb', 'dig', 'slash', 'open_chest', 'hit', 'knockdown', 'getup', 'emote_wave', 'emote_cheer', 'emote_dance', 'emote_bow', 'victory'].includes(name);
      if (isOneShot) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = name === 'knockdown';
      }
      this.actions.set(name, action);
    }

    this.actions.get('idle')?.play();

    this.hipsBone = bones.find((b) => b.name === 'Hips');
    this.thighLBone = bones.find((b) => b.name === 'ThighL');
    this.thighRBone = bones.find((b) => b.name === 'ThighR');
    this.footLBone = bones.find((b) => b.name === 'FootL');
    this.footRBone = bones.find((b) => b.name === 'FootR');
  }

  public playOneShot(name: AnimName, fade = 0.1): void {
    const next = this.actions.get(name);
    const prev = this.actions.get(this.currentState);
    if (!next) return;
    this.oneShotTimer = next.getClip().duration * 0.92;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, true);
    this.currentState = name;
  }

  public setLocomotionState(name: AnimName): void {
    if (this.oneShotTimer > 0) return;
    if (this.currentState === name) return;
    const next = this.actions.get(name);
    const prev = this.actions.get(this.currentState);
    if (!next) return;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.16, true);
    this.currentState = name;
  }

  public update(dt: number, terrain?: IslandTerrainData, charWorldPos?: THREE.Vector3, charYaw = 0, grounded = true, enableFootIK = true): void {
    if (this.oneShotTimer > 0) {
      this.oneShotTimer = Math.max(0, this.oneShotTimer - dt);
    }
    this.mixer.update(dt);

    // Slope Foot IK (desktop only)
    if (enableFootIK && terrain && charWorldPos && grounded && this.hipsBone && this.thighLBone && this.thighRBone) {
      const cos = Math.cos(charYaw);
      const sin = Math.sin(charYaw);
      const footOffset = 0.14;
      const hL = terrain.getHeight(charWorldPos.x + cos * footOffset, charWorldPos.z - sin * footOffset);
      const hR = terrain.getHeight(charWorldPos.x - cos * footOffset, charWorldPos.z + sin * footOffset);
      const diff = THREE.MathUtils.clamp(hL - hR, -0.35, 0.35);

      this.hipsBone.position.y -= Math.abs(diff) * 0.35;
      if (diff > 0.04) {
        this.thighLBone.rotation.x -= diff * 0.65;
        if (this.footLBone) this.footLBone.rotation.x += diff * 0.4;
      } else if (diff < -0.04) {
        this.thighRBone.rotation.x -= Math.abs(diff) * 0.65;
        if (this.footRBone) this.footRBone.rotation.x += Math.abs(diff) * 0.4;
      }
    }
  }
}
