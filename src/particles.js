import * as THREE from 'three';

// Lightweight pooled particle & ring-shockwave VFX system
// Designed to stay 60fps on ordinary laptops and respect Reduced Effects.

export class ParticleSystem {
  constructor(scene, maxParticles = 240) {
    this.scene = scene;
    this.maxParticles = maxParticles;
    this.reducedEffects = false;

    this.pool = [];
    this.rings = [];
    this.root = new THREE.Group();
    this.scene.add(this.root);

    const geo = new THREE.IcosahedronGeometry(0.24, 0);
    for (let i = 0; i < maxParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.pool.push({
        mesh,
        mat,
        active: false,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        gravity: 0,
        startScale: 1,
        endScale: 0.1
      });
    }
    this.cursor = 0;
  }

  setReducedEffects(val) {
    this.reducedEffects = !!val;
  }

  emitBurst(pos, count, opts = {}) {
    const actualCount = this.reducedEffects ? Math.max(1, Math.ceil(count * 0.3)) : count;
    const {
      color = 0xffffff,
      speed = 6,
      upSpeed = 4,
      life = 0.55,
      gravity = 12,
      startScale = 1,
      endScale = 0.05,
      spread = 1
    } = opts;

    for (let i = 0; i < actualCount; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.maxParticles;

      p.active = true;
      p.life = life * (0.75 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.startScale = startScale * (0.8 + Math.random() * 0.45);
      p.endScale = endScale;

      p.mat.color.setHex(Array.isArray(color) ? color[i % color.length] : color);
      p.mat.opacity = 0.92;

      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.5 * spread,
        pos.y + (Math.random() - 0.5) * 0.35 * spread,
        pos.z + (Math.random() - 0.5) * 0.5 * spread
      );
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.visible = true;

      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      p.vel.set(
        Math.cos(ang) * spd,
        upSpeed * (0.5 + Math.random() * 0.8),
        Math.sin(ang) * spd
      );
    }
  }

  emitRing(pos, color = 0x38e5ff, maxRadius = 4.5, duration = 0.45) {
    if (this.reducedEffects) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.8, 24),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    this.root.add(mesh);
    this.rings.push({ mesh, life: duration, maxLife: duration, maxRadius });
  }

  emitDust(pos) {
    this.emitBurst(pos, 6, {
      color: 0xf4efe0,
      speed: 3.2,
      upSpeed: 1.8,
      life: 0.36,
      gravity: 4,
      startScale: 0.9,
      endScale: 0.1
    });
  }

  emitGrappleSpark(pos) {
    this.emitBurst(pos, 10, {
      color: [0xffd166, 0x38e5ff],
      speed: 6.5,
      upSpeed: 3.5,
      life: 0.4,
      gravity: 8,
      startScale: 0.8,
      endScale: 0.05
    });
    this.emitRing(pos, 0xffd166, 2.8, 0.32);
  }

  emitCorePickup(pos) {
    this.emitBurst(pos, 18, {
      color: [0x38e5ff, 0xffffff, 0xffd166],
      speed: 8,
      upSpeed: 7,
      life: 0.65,
      gravity: 9,
      startScale: 1.15,
      endScale: 0.05
    });
    this.emitRing(pos, 0x38e5ff, 5.2, 0.5);
  }

  emitScoreConfetti(pos, teamColorHex) {
    this.emitBurst(pos, 36, {
      color: [teamColorHex, 0xffd166, 0x38e5ff, 0xff5d73, 0x4be89e],
      speed: 11,
      upSpeed: 13,
      life: 1.15,
      gravity: 14,
      startScale: 1.25,
      endScale: 0.2,
      spread: 2.2
    });
    this.emitRing(pos, teamColorHex, 7.5, 0.6);
  }

  emitLightningImpact(pos) {
    this.emitBurst(pos, 22, {
      color: [0x9bf6ff, 0xffe600, 0xffffff],
      speed: 10,
      upSpeed: 8,
      life: 0.5,
      gravity: 14,
      startScale: 1.0,
      endScale: 0.05
    });
    this.emitRing(pos, 0xffe600, 4.5, 0.38);
  }

  emitFallPuff(pos) {
    this.emitBurst(pos, 14, {
      color: [0xffffff, 0xbef5ff],
      speed: 6,
      upSpeed: 6,
      life: 0.65,
      gravity: -2,
      startScale: 1.4,
      endScale: 0.2,
      spread: 1.8
    });
  }

  update(dt) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.startScale, p.endScale, t));
      p.mat.opacity = Math.max(0, 1 - t);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.root.remove(r.mesh);
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(1 + t * r.maxRadius);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }
  }

  clear() {
    this.pool.forEach((p) => {
      p.active = false;
      p.mesh.visible = false;
    });
    this.rings.forEach((r) => this.root.remove(r.mesh));
    this.rings = [];
  }
}
