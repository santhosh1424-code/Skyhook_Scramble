import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BODY_TYPES, DEFAULT_LOADOUT, type ClothingLoadout } from '@shared/constants';
import { getWorldTextures } from '@client/world/pbrTextures';
import { HumanoidAnimController } from './animationController';

export interface CharacterWetnessUniforms {
  uWetness: { value: number };
  uMud: { value: number };
}

export class HumanoidCharacter {
  public readonly root = new THREE.Group();
  public readonly anim: HumanoidAnimController;
  public readonly skeleton: THREE.Skeleton;
  public readonly bones: THREE.Bone[];
  public readonly wetnessUniforms: CharacterWetnessUniforms = {
    uWetness: { value: 0 },
    uMud: { value: 0 }
  };

  private readonly modelScene: THREE.Object3D;
  private readonly bodyMesh: THREE.SkinnedMesh;
  private readonly headBone: THREE.Bone;
  private readonly faceFeatureGroup = new THREE.Group();
  private readonly equippedClothing = new Map<string, THREE.SkinnedMesh>();
  private readonly clothingSource: GLTF;

  public loadout: ClothingLoadout;
  public wetness = 0;
  public mud = 0;
  public wetnessEnabled = true;

  constructor(baseGltf: GLTF, clothingGltf: GLTF, loadout: ClothingLoadout = DEFAULT_LOADOUT) {
    this.clothingSource = clothingGltf;
    this.loadout = structuredClone(loadout);

    this.modelScene = SkeletonUtils.clone(baseGltf.scene);
    this.root.add(this.modelScene);

    const foundBody = this.modelScene.getObjectByName('HumanoidBody') as THREE.SkinnedMesh;
    this.bodyMesh = foundBody;
    this.skeleton = foundBody.skeleton;
    this.bones = this.skeleton.bones;
    this.headBone = this.bones.find((b) => b.name === 'Head')!;

    // Facial details (eyes, brows, beard variations) bound to Head bone
    this.headBone.add(this.faceFeatureGroup);

    this.applyWetnessShader(this.createSkinMaterial(this.loadout.skinTone));
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;

    this.anim = new HumanoidAnimController(this.modelScene, this.bones);
    this.applyLoadout(this.loadout);
  }

  private applyWetnessShader(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWetness = this.wetnessUniforms.uWetness;
      shader.uniforms.uMud = this.wetnessUniforms.uMud;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCharLocalY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCharLocalY = position.y;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uWetness;
           uniform float uMud;
           varying float vCharLocalY;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           roughnessFactor = mix(roughnessFactor, 0.18, uWetness * 0.85);`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           diffuseColor.rgb *= mix(1.0, 0.68, uWetness);
           float mudMask = uMud * (1.0 - smoothstep(0.0, 0.85, vCharLocalY));
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.18, 0.11), clamp(mudMask, 0.0, 0.85));`
        );
    };
    mat.customProgramCacheKey = () => 'pirate-wetness-mud-v1';
    return mat;
  }

  private createSkinMaterial(hex: string): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.72,
      metalness: 0.02
    });
    this.bodyMesh.material = this.applyWetnessShader(mat);
    return mat;
  }

  private createClothingMaterial(slot: string, tintHex: string): THREE.MeshStandardMaterial {
    const tex = getWorldTextures();
    const isMetal = slot === 'belt' || slot === 'heldItem';
    const isLeather = slot === 'boots' || slot === 'gloves' || slot === 'backItem';
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tintHex),
      normalMap: isMetal ? tex.metalNormal : isLeather ? tex.leatherNormal : tex.clothNormal,
      roughness: isMetal ? 0.32 : isLeather ? 0.58 : 0.84,
      metalness: isMetal ? 0.78 : 0.04
    });
    return this.applyWetnessShader(mat);
  }

  public applyLoadout(nextLoadout: ClothingLoadout): void {
    this.loadout = structuredClone(nextLoadout);

    // 1. Body Type proportions
    const bodyDef = BODY_TYPES.find((b) => b.id === this.loadout.bodyType) || BODY_TYPES[0];
    this.modelScene.scale.set(bodyDef.widthScale, bodyDef.heightScale, bodyDef.widthScale);

    // 2. Skin tone & facial hair
    this.createSkinMaterial(this.loadout.skinTone);
    this.rebuildFaceFeatures();

    // 3. Swap modular skinned clothing meshes bound to the SAME shared skeleton!
    for (const mesh of this.equippedClothing.values()) {
      this.modelScene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.equippedClothing.clear();

    const entries = Object.entries(this.loadout.slots) as [string, { item: string; tint: string }][];
    for (const [slotName, cfg] of entries) {
      if (!cfg.item || cfg.item === 'none') continue;
      const srcMesh = this.clothingSource.scene.getObjectByName(cfg.item) as THREE.SkinnedMesh | undefined;
      if (!srcMesh || !srcMesh.isSkinnedMesh) continue;

      const clone = new THREE.SkinnedMesh(srcMesh.geometry, this.createClothingMaterial(slotName, cfg.tint));
      clone.name = `${slotName}_${cfg.item}`;
      clone.castShadow = true;
      clone.receiveShadow = true;
      clone.bind(this.skeleton, new THREE.Matrix4());
      this.modelScene.add(clone);
      this.equippedClothing.set(slotName, clone);
    }
  }

  private rebuildFaceFeatures(): void {
    while (this.faceFeatureGroup.children.length > 0) {
      this.faceFeatureGroup.remove(this.faceFeatureGroup.children[0]);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.25 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.35 });
    const hairTint = this.loadout.slots.hair?.tint || '#3b2618';
    const beardMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hairTint), roughness: 0.9 });

    for (const side of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), whiteMat);
      sclera.position.set(side * 0.036, 0.06, 0.095);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), eyeMat);
      pupil.position.set(side * 0.036, 0.06, 0.108);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.009, 0.014), beardMat);
      brow.position.set(side * 0.036, 0.086, 0.102);
      brow.rotation.z = this.loadout.faceStyle === 1 ? side * -0.15 : 0;
      this.faceFeatureGroup.add(sclera, pupil, brow);
    }

    // Beard styles: 0 = clean, 1 = goatee/mustache, 2 = full pirate beard
    if (this.loadout.beardStyle >= 1) {
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.016, 0.025), beardMat);
      stache.position.set(0, 0.018, 0.104);
      this.faceFeatureGroup.add(stache);
    }
    if (this.loadout.beardStyle === 2) {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.14, 7), beardMat);
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.045, 0.075);
      this.faceFeatureGroup.add(beard);
    }
  }

  public updateEnvironmentSurface(dt: number, inWater: boolean, raining: boolean, inMud: boolean): void {
    if (!this.wetnessEnabled) {
      this.wetnessUniforms.uWetness.value = 0;
      this.wetnessUniforms.uMud.value = 0;
      return;
    }
    if (inWater || raining) {
      this.wetness = Math.min(1, this.wetness + dt * (inWater ? 1.8 : 0.25));
    } else {
      this.wetness = Math.max(0, this.wetness - dt * 0.08);
    }
    if (inMud) {
      this.mud = Math.min(1, this.mud + dt * 0.6);
    } else if (inWater) {
      this.mud = Math.max(0, this.mud - dt * 1.4); // Water washes mud off!
    } else {
      this.mud = Math.max(0, this.mud - dt * 0.04);
    }
    this.wetnessUniforms.uWetness.value = this.wetness;
    this.wetnessUniforms.uMud.value = this.mud;
  }
}
