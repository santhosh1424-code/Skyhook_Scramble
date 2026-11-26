import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { QualityConfig } from '@shared/constants';

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.22 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      float dist = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.45, 0.9, dist) * uVignette;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `
};

export class PostProcessPipeline {
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private enabled = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera
  ) {}

  public configure(q: QualityConfig, width: number, height: number): void {
    this.enabled = q.postProcess;
    if (!this.enabled) {
      this.composer?.dispose();
      this.composer = null;
      return;
    }

    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
      this.ssaoPass.kernelRadius = 10;
      this.ssaoPass.minDistance = 0.005;
      this.ssaoPass.maxDistance = 0.12;
      this.composer.addPass(this.ssaoPass);

      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.24, 0.45, 0.88);
      this.composer.addPass(this.bloomPass);

      this.composer.addPass(new ShaderPass(ColorGradeShader));

      this.smaaPass = new SMAAPass();
      this.composer.addPass(this.smaaPass);
    }

    if (this.ssaoPass) this.ssaoPass.enabled = q.ssao;
    this.resize(width, height);
  }

  public resize(width: number, height: number): void {
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);
    this.ssaoPass?.setSize(width, height);
    this.bloomPass?.setSize(width, height);
    this.smaaPass?.setSize(Math.floor(width * pr), Math.floor(height * pr));
  }

  public render(): void {
    if (this.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
