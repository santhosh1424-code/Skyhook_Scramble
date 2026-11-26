import * as THREE from 'three';
import { WATER_LEVEL } from '@shared/constants';
import { getWorldTextures } from './pbrTextures';

export interface WeatherState {
  timeOfDay: number; // 0..1 (0.25 sunrise, 0.5 noon, 0.75 sunset, 0.0 midnight)
  raining: boolean;
  stormIntensity: number; // 0..1
  windStrength: number;
}

export class WaterAndSkySystem {
  public readonly group = new THREE.Group();
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly weather: WeatherState = {
    timeOfDay: 0.36, // bright tropical late morning
    raining: false,
    stormIntensity: 0,
    windStrength: 1.0
  };

  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sunDisc: THREE.Mesh;
  private readonly godRayHalo: THREE.Mesh;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly waterMesh: THREE.Mesh;
  private readonly underwaterOverlay: THREE.Mesh;
  private readonly rainPoints: THREE.Points;
  private readonly rainPos: Float32Array;
  private readonly skyClouds: THREE.Group[] = [];
  private readonly shipWakeRings: THREE.Mesh[] = [];
  private stormTimer = 75;
  private readonly fogColor = new THREE.Color(0x9bd7f2);

  constructor(private readonly scene: THREE.Scene) {
    this.scene.add(this.group);

    this.hemiLight = new THREE.HemisphereLight(0xfff4d6, 0x2c5a7a, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1cf, 1.85);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 360;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.scene.fog = new THREE.FogExp2(this.fogColor.getHex(), 0.0012);

    // Atmospheric sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1b65b8) },
        uHorizonColor: { value: new THREE.Color(0x9eddf7) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
        uSunGlowColor: { value: new THREE.Color(0xffd78c) },
        uNightFactor: { value: 0 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlowColor;
        uniform float uNightFactor;
        varying vec3 vDir;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));
          float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uSunGlowColor * pow(sunDot, 10.0) * 0.45;
          col += uSunGlowColor * pow(sunDot, 120.0) * 0.9;

          // Subtle twinkling stars at night
          if (uNightFactor > 0.1 && vDir.y > 0.08) {
            float star = step(0.9965, hash(floor(vDir * 240.0)));
            col += vec3(star * uNightFactor * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2100, 32, 20), this.skyMat);
    this.group.add(skyDome);

    // Sun disc + sunrise/sunset god-ray halo
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(42, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false, transparent: true, opacity: 0.95 })
    );
    this.group.add(this.sunDisc);

    this.godRayHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 340),
      new THREE.MeshBasicMaterial({
        color: 0xffc773,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    this.group.add(this.godRayHalo);

    // Realistic Animated Ocean & Lagoon Water
    const tex = getWorldTextures();
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uNormalMap: { value: tex.waterNormal },
        uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(0xfff0c2) },
        uSkyColor: { value: new THREE.Color(0x6ec3f0) },
        uShallowColor: { value: new THREE.Color(0x28b8b8) },
        uDeepColor: { value: new THREE.Color(0x0b3a66) },
        uFogColor: { value: this.fogColor },
        uFogDensity: { value: 0.0012 }
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          vec3 p = position;
          float wave = sin(p.x * 0.07 + uTime * 1.4) * 0.14 + cos(p.z * 0.06 + uTime * 1.1) * 0.14;
          p.y += wave;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uNormalMap;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uShallowColor;
        uniform vec3 uDeepColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vWorldPos;

        void main() {
          vec2 uv1 = vWorldPos.xz * 0.018 + vec2(uTime * 0.018, uTime * 0.011);
          vec2 uv2 = vWorldPos.xz * 0.031 - vec2(uTime * 0.014, -uTime * 0.016);
          vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
          vec3 N = normalize(vec3(n1.x + n2.x, 2.2, n1.y + n2.y));

          vec3 V = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);

          float radial = length(vWorldPos.xz);
          float depthT = smoothstep(320.0, 960.0, radial);
          vec3 waterCol = mix(uShallowColor, uDeepColor, depthT);

          // Sun specular sparkle
          vec3 H = normalize(normalize(uSunDir) + V);
          float spec = pow(max(dot(N, H), 0.0), 96.0) * 1.4;

          // Subtle shore-crest shimmer
          float foamBand = smoothstep(0.55, 0.9, sin(vWorldPos.x * 0.15 + uTime * 2.0) * cos(vWorldPos.z * 0.15 - uTime * 1.6));
          vec3 col = mix(waterCol, uSkyColor, clamp(fresnel * 0.85, 0.0, 0.85)) + uSunColor * spec;
          col += vec3(0.85, 0.95, 1.0) * foamBand * 0.06;

          // Exponential distance fog
          float dist = length(cameraPosition - vWorldPos);
          float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

          gl_FragColor = vec4(col, 0.88);
        }
      `
    });
    const waterGeo = new THREE.PlaneGeometry(4200, 4200, 96, 96);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = WATER_LEVEL;
    this.group.add(this.waterMesh);

    // Underwater tint quad attached near camera when submerged
    this.underwaterOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ color: 0x0b5873, transparent: true, opacity: 0.42, depthTest: false })
    );
    this.underwaterOverlay.visible = false;
    this.scene.add(this.underwaterOverlay);

    // Rain particle system (only visible during storms)
    const rainCount = 900;
    this.rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 90;
      this.rainPos[i * 3 + 1] = Math.random() * 45;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: 0xcbe8ff, size: 0.35, transparent: true, opacity: 0.65 })
    );
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);

    // Drifting sky clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfafcff, roughness: 0.95, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 18; i++) {
      const cg = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(18 + p * 5, 1), cloudMat);
        puff.scale.set(1.6, 0.55, 1.1);
        puff.position.set((p - 1) * 18, (p % 2) * 3, (p % 2) * 4);
        cg.add(puff);
      }
      const a = (i / 18) * Math.PI * 2;
      const dist = 600 + (i % 4) * 260;
      cg.position.set(Math.cos(a) * dist, 195 + (i % 3) * 28, Math.sin(a) * dist);
      cg.userData = { a, dist, spd: 0.008 + (i % 3) * 0.004 };
      this.group.add(cg);
      this.skyClouds.push(cg);
    }
  }

  public setShipWakePositions(positions: { x: number; z: number }[]): void {
    this.shipWakeRings.forEach((r) => this.group.remove(r));
    this.shipWakeRings.length = 0;
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false });
    for (const p of positions) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6.2, 24), wakeMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, WATER_LEVEL + 0.14, p.z);
      this.group.add(ring);
      this.shipWakeRings.push(ring);
    }
  }

  public update(dt: number, elapsed: number, focusPos: THREE.Vector3, camera: THREE.Camera, drawDistance: number): void {
    // Full day/night cycle every ~10 minutes
    this.weather.timeOfDay = (this.weather.timeOfDay + dt / 600) % 1;
    const sunAngle = (this.weather.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    const sunDir = new THREE.Vector3(sunX, sunY, 0.32).normalize();

    // Storm toggle timer
    this.stormTimer -= dt;
    if (this.stormTimer <= 0) {
      this.weather.raining = !this.weather.raining;
      this.stormTimer = this.weather.raining ? 28 : 85;
    }
    const targetStorm = this.weather.raining ? 1 : 0;
    this.weather.stormIntensity = THREE.MathUtils.lerp(this.weather.stormIntensity, targetStorm, Math.min(1, dt * 0.4));
    this.weather.windStrength = 1.0 + this.weather.stormIntensity * 1.4;

    const dayHeight = Math.max(0, sunY);
    const twilight = Math.max(0, 1 - Math.abs(sunY) * 4.2);
    const nightFactor = Math.max(0, -sunY * 1.6);

    const dayTop = new THREE.Color(0x1b65b8);
    const nightTop = new THREE.Color(0x071226);
    const stormTop = new THREE.Color(0x3a4a5e);

    const dayHoriz = new THREE.Color(0x9eddf7);
    const sunsetHoriz = new THREE.Color(0xffa46b);
    const nightHoriz = new THREE.Color(0x122645);

    const topCol = dayTop.clone().lerp(nightTop, Math.min(1, nightFactor)).lerp(stormTop, this.weather.stormIntensity * 0.7);
    const horizCol = dayHoriz
      .clone()
      .lerp(sunsetHoriz, twilight * 0.78)
      .lerp(nightHoriz, Math.min(1, nightFactor))
      .lerp(stormTop, this.weather.stormIntensity * 0.65);

    this.skyMat.uniforms.uTopColor.value.copy(topCol);
    this.skyMat.uniforms.uHorizonColor.value.copy(horizCol);
    this.skyMat.uniforms.uSunDir.value.copy(sunDir);
    this.skyMat.uniforms.uNightFactor.value = Math.min(1, nightFactor);

    // Move sun & shadows around focusPos so shadow texels stay crisp
    this.sunLight.position.copy(focusPos).addScaledVector(sunDir, 150);
    this.sunLight.target.position.copy(focusPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = Math.max(0.18, dayHeight * 2.0 * (1 - this.weather.stormIntensity * 0.55));
    this.sunLight.color.setHex(0xfff1cf).lerp(new THREE.Color(0xff9654), twilight * 0.75);
    this.hemiLight.intensity = 0.32 + dayHeight * 0.75;

    this.sunDisc.position.copy(sunDir).multiplyScalar(1750);
    this.sunDisc.lookAt(0, 0, 0);
    this.sunDisc.visible = sunY > -0.15;

    this.godRayHalo.position.copy(sunDir).multiplyScalar(1700);
    this.godRayHalo.lookAt(camera.position);
    (this.godRayHalo.material as THREE.MeshBasicMaterial).opacity =
      sunY > -0.05 ? (0.1 + twilight * 0.3) * (1 - this.weather.stormIntensity * 0.8) : 0;

    // Fog density tracks drawDistance & storm & underwater
    const underwater = camera.position.y < WATER_LEVEL - 0.1;
    const baseDensity = (1.1 / Math.max(300, drawDistance)) * (1 + this.weather.stormIntensity * 0.85);
    const fog = this.scene.fog as THREE.FogExp2;
    if (underwater) {
      this.fogColor.setHex(0x0b526e);
      fog.density = 0.042;
      this.underwaterOverlay.visible = true;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      this.underwaterOverlay.position.copy(camera.position).addScaledVector(forward, 1.0);
      this.underwaterOverlay.lookAt(camera.position);
    } else {
      this.fogColor.copy(horizCol);
      fog.density = baseDensity;
      this.underwaterOverlay.visible = false;
    }
    fog.color.copy(this.fogColor);

    this.waterMat.uniforms.uTime.value = elapsed;
    this.waterMat.uniforms.uSunDir.value.copy(sunDir);
    this.waterMat.uniforms.uSkyColor.value.copy(horizCol);
    this.waterMat.uniforms.uFogColor.value.copy(this.fogColor);
    this.waterMat.uniforms.uFogDensity.value = fog.density;

    // Drift sky clouds & pulse ship wake foam rings
    for (const cg of this.skyClouds) {
      cg.userData.a += dt * cg.userData.spd * this.weather.windStrength;
      cg.position.x = Math.cos(cg.userData.a) * cg.userData.dist;
      cg.position.z = Math.sin(cg.userData.a) * cg.userData.dist;
    }
    for (let i = 0; i < this.shipWakeRings.length; i++) {
      const r = this.shipWakeRings[i];
      const wave = 1 + ((elapsed * 0.45 + i * 0.2) % 1) * 0.55;
      r.scale.setScalar(wave);
    }

    // Rain update around player/camera
    if (this.weather.stormIntensity > 0.15) {
      this.rainPoints.visible = true;
      this.rainPoints.position.set(focusPos.x, focusPos.y, focusPos.z);
      for (let i = 0; i < this.rainPos.length; i += 3) {
        this.rainPos[i + 1] -= dt * 36;
        this.rainPos[i] -= dt * 4 * this.weather.windStrength;
        if (this.rainPos[i + 1] < -5) {
          this.rainPos[i + 1] = 40;
          this.rainPos[i] = (Math.random() - 0.5) * 90;
          this.rainPos[i + 2] = (Math.random() - 0.5) * 90;
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    } else {
      this.rainPoints.visible = false;
    }
  }
}
