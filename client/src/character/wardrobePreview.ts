import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ClothingLoadout } from '@shared/constants';
import { HumanoidCharacter } from './humanoidRig';

// Standalone live rotatable 3D wardrobe preview for Lobby & In-Game Wardrobe chest
export class WardrobePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly character: HumanoidCharacter;
  private yaw = 0.25;
  private dragging = false;
  private lastX = 0;
  private rafId = 0;
  private lastTime = performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    baseGltf: GLTF,
    clothingGltf: GLTF,
    initialLoadout: ClothingLoadout
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 360, false);

    this.camera = new THREE.PerspectiveCamera(40, (canvas.clientWidth || 320) / (canvas.clientHeight || 360), 0.1, 20);
    this.camera.position.set(0, 1.18, 2.75);
    this.camera.lookAt(0, 0.96, 0);

    const hemi = new THREE.HemisphereLight(0xfff4dd, 0x2c4a66, 1.1);
    const key = new THREE.DirectionalLight(0xffefd2, 1.8);
    key.position.set(2, 3.5, 3);
    const rim = new THREE.DirectionalLight(0x6bd4ff, 0.8);
    rim.position.set(-2.5, 2, -2);
    this.scene.add(hemi, key, rim);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.76, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: 0x4f3520, roughness: 0.85 })
    );
    plinth.position.y = -0.07;
    this.scene.add(plinth);

    this.character = new HumanoidCharacter(baseGltf, clothingGltf, initialLoadout);
    this.scene.add(this.character.root);

    this.bindDrag();
    this.start();
  }

  private bindDrag(): void {
    const start = (x: number) => {
      this.dragging = true;
      this.lastX = x;
    };
    const move = (x: number) => {
      if (!this.dragging) return;
      this.yaw += (x - this.lastX) * 0.012;
      this.lastX = x;
    };
    const end = () => {
      this.dragging = false;
    };

    this.canvas.addEventListener('mousedown', (e) => start(e.clientX));
    window.addEventListener('mousemove', (e) => move(e.clientX));
    window.addEventListener('mouseup', end);

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches[0]) start(e.touches[0].clientX);
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches[0]) move(e.touches[0].clientX);
    }, { passive: true });
    this.canvas.addEventListener('touchend', end);
  }

  public setLoadout(loadout: ClothingLoadout): void {
    this.character.applyLoadout(loadout);
  }

  public resize(): void {
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 360;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private start(): void {
    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.character.root.rotation.y = this.yaw;
      this.character.anim.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
  }
}
