import * as THREE from 'three';
import { GADGETS } from './config.js';

function toon(color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity });
}

export function createHatMesh(hatType, accentColor) {
  const g = new THREE.Group();
  if (hatType === 'bandana') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.44, 0.24, 12), toon(accentColor));
    band.position.y = 0.24;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 5), toon(accentColor));
    knot.position.set(0, 0.22, -0.45);
    knot.rotation.x = -1.2;
    g.add(band, knot);
  } else if (hatType === 'crown') {
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.36, 0.32, 6),
      toon(0xffd13b, 0x805500, 0.35)
    );
    crown.position.y = 0.36;
    g.add(crown);
  } else if (hatType === 'plume') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.1, 12), toon(0x1b2845));
    base.position.y = 0.25;
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 10), toon(0x1b2845));
    dome.position.y = 0.44;
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.68, 6), toon(accentColor));
    feather.position.set(0.32, 0.62, -0.1);
    feather.rotation.z = -0.5;
    g.add(base, dome, feather);
  } else {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.68, 0.12, 3), toon(0x202a3c));
    brim.position.y = 0.28;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.28, 8), toon(accentColor));
    crown.position.y = 0.38;
    g.add(brim, crown);
  }
  return g;
}

export class Pirate {
  constructor(scene, opts) {
    this.scene = scene;
    this.id = opts.id;
    this.name = opts.name;
    this.isBot = !!opts.isBot;
    this.isRemote = !!opts.isRemote;
    this.teamId = opts.teamId;
    this.teamName = opts.teamName;
    this.teamColor = opts.teamColor;
    this.teamColorHex = opts.teamColorHex;
    this.shape = opts.shape;
    this.accentHex = opts.accentHex ?? opts.teamColorHex;
    this.hatType = opts.hatType || 'tricorn';
    this.emoteStyle = opts.emoteStyle || 'spin';
    this.gadgetId = opts.gadgetId || 'smoke';
    this.homePos = opts.homePos.clone();

    this.pos = this.homePos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.targetNetPos = this.pos.clone();
    this.targetNetYaw = 0;

    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = false;
    this.wasGrounded = false;
    this.coyoteTimer = 0;
    this.climbTimer = 0;
    this.stunTimer = 0;
    this.shieldTimer = 0;
    this.emoteTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.gadgetCooldown = 0;
    this.hasCore = false;
    this.score = 0;
    this.ridingPlatform = null;
    this.squashY = 1;

    // Grapple state
    this.grappleActive = false;
    this.grappleTarget = new THREE.Vector3();
    this.grappleTimer = 0;

    // Bot AI memory
    this.aiStateTimer = 0;
    this.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
    this.aiStuckTimer = 0;
    this.aiLastPos = this.pos.clone();

    this.buildMesh();
  }

  buildMesh() {
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    const coat = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.52, 6, 10),
      toon(this.teamColorHex)
    );
    coat.position.y = 0.9;
    coat.castShadow = true;
    this.bodyPivot.add(coat);

    const sash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.18, 10),
      toon(this.accentHex)
    );
    sash.position.y = 0.72;
    this.bodyPivot.add(sash);

    // Fluttering scarf tail on back
    this.scarf = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.55, 0.08),
      toon(this.accentHex)
    );
    this.scarf.position.set(0, 1.15, -0.42);
    this.scarf.rotation.x = 0.35;
    this.bodyPivot.add(this.scarf);

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 1.68;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), toon(0xffd7b5));
    skull.castShadow = true;
    this.head.add(skull);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), toon(0x111111));
    eyeL.position.set(-0.14, 0.04, 0.36);
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), toon(0x151515));
    patch.position.set(0.14, 0.04, 0.37);
    this.head.add(eyeL, patch);
    this.head.add(createHatMesh(this.hatType, this.accentHex));
    this.bodyPivot.add(this.head);

    this.armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.36, 4, 6), toon(this.teamColorHex));
    this.armL.position.set(-0.56, 0.96, 0);
    this.armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.36, 4, 6), toon(this.teamColorHex));
    this.armR.position.set(0.56, 0.96, 0);
    this.legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 6), toon(0x283548));
    this.legL.position.set(-0.2, 0.32, 0);
    this.legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 6), toon(0x283548));
    this.legR.position.set(0.2, 0.32, 0);
    this.bodyPivot.add(this.armL, this.armR, this.legL, this.legR);

    // Shield Bubble visual
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 16, 14),
      new THREE.MeshBasicMaterial({
        color: 0x38e5ff,
        transparent: true,
        opacity: 0.3,
        wireframe: true
      })
    );
    this.shieldMesh.position.y = 1.05;
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    this.scene.add(this.group);

    // Ground drop shadow blob for crisp 3D platform alignment
    this.dropShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 16),
      new THREE.MeshBasicMaterial({ color: 0x091628, transparent: true, opacity: 0.34, depthWrite: false })
    );
    this.dropShadow.rotation.x = -Math.PI / 2;
    this.dropShadow.visible = false;
    this.scene.add(this.dropShadow);

    // Grapple rope line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]);
    this.grappleLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffd166 })
    );
    this.grappleLine.visible = false;
    this.scene.add(this.grappleLine);
  }

  respawn(particles = null) {
    if (particles) particles.emitFallPuff(this.pos);
    this.pos.copy(this.homePos).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 2.2, (Math.random() - 0.5) * 2.5));
    this.vel.set(0, 0, 0);
    this.grappleActive = false;
    this.grappleLine.visible = false;
    this.stunTimer = 0.25;
    if (particles) particles.emitDust(this.pos);
  }

  startGrapple(targetVec, particles = null) {
    this.grappleActive = true;
    this.grappleTarget.copy(targetVec);
    this.grappleTimer = 1.05;
    this.grounded = false;
    if (particles) particles.emitGrappleSpark(targetVec);
  }

  stopGrapple() {
    this.grappleActive = false;
    this.grappleLine.visible = false;
  }

  triggerEmote() {
    this.emoteTimer = 1.6;
  }

  updateDropShadow(world) {
    let bestY = -Infinity;
    for (const p of world.platforms) {
      if (!p.active) continue;
      if (isPointOverPlatform(this.pos.x, this.pos.z, p, 0.2) && p.topY <= this.pos.y + 0.3) {
        if (p.topY > bestY) bestY = p.topY;
      }
    }
    if (bestY > -50) {
      const dist = Math.max(0, this.pos.y - bestY);
      const scale = THREE.MathUtils.clamp(1 - dist * 0.055, 0.35, 1);
      this.dropShadow.visible = true;
      this.dropShadow.position.set(this.pos.x, bestY + 0.04, this.pos.z);
      this.dropShadow.scale.setScalar(scale);
      this.dropShadow.material.opacity = 0.36 * scale;
    } else {
      this.dropShadow.visible = false;
    }
  }

  updateVisuals(dt, elapsed, reducedMotion, world) {
    if (this.isRemote) {
      this.pos.lerp(this.targetNetPos, Math.min(1, dt * 14));
      let diff = this.targetNetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 14);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    // Squash & stretch recovery
    this.squashY = THREE.MathUtils.lerp(this.squashY, 1, Math.min(1, dt * 12));
    const xzScale = reducedMotion ? 1 : 1 / Math.sqrt(Math.max(0.65, this.squashY));
    this.bodyPivot.scale.set(xzScale, reducedMotion ? 1 : this.squashY, xzScale);

    this.shieldMesh.visible = this.shieldTimer > 0;
    if (this.shieldTimer > 0) {
      this.shieldMesh.rotation.y += dt * 2.5;
    }

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (!reducedMotion) {
      this.scarf.rotation.x = 0.3 + Math.min(0.95, horizSpeed * 0.07) + Math.sin(elapsed * 12) * 0.12;
    }

    if (this.emoteTimer > 0 && !reducedMotion) {
      this.emoteTimer -= dt;
      if (this.emoteStyle === 'spin') {
        this.group.rotation.y += elapsed * 12;
        this.armL.rotation.x = -2.2;
        this.armR.rotation.x = -2.2;
      } else if (this.emoteStyle === 'bounce') {
        this.group.position.y += Math.abs(Math.sin(elapsed * 12)) * 0.45;
        this.armL.rotation.z = 0.9;
        this.armR.rotation.z = -0.9;
      } else {
        this.armL.rotation.x = -2.6 + Math.sin(elapsed * 14) * 0.3;
        this.armR.rotation.x = -2.6 - Math.sin(elapsed * 14) * 0.3;
      }
    } else if (!this.grounded) {
      this.armL.rotation.x = -0.95;
      this.armR.rotation.x = -0.95;
      this.legL.rotation.x = 0.35;
      this.legR.rotation.x = -0.35;
    } else if (horizSpeed > 0.7 && !reducedMotion) {
      const swing = Math.sin(elapsed * 13) * 0.78;
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
    } else {
      this.armL.rotation.set(0, 0, 0);
      this.armR.rotation.set(0, 0, 0);
      this.legL.rotation.set(0, 0, 0);
      this.legR.rotation.set(0, 0, 0);
    }

    if (this.grappleActive) {
      const handPos = this.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
      const positions = this.grappleLine.geometry.attributes.position.array;
      positions[0] = handPos.x;
      positions[1] = handPos.y;
      positions[2] = handPos.z;
      positions[3] = this.grappleTarget.x;
      positions[4] = this.grappleTarget.y;
      positions[5] = this.grappleTarget.z;
      this.grappleLine.geometry.attributes.position.needsUpdate = true;
      this.grappleLine.visible = true;
    } else {
      this.grappleLine.visible = false;
    }

    if (world) this.updateDropShadow(world);
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.grappleLine);
    this.scene.remove(this.dropShadow);
  }
}

export class StormCore {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.pos = new THREE.Vector3(0, 6, 0);
    this.vel = new THREE.Vector3();
    this.carrier = null;
    this.pickupCooldown = 0;

    this.group = new THREE.Group();
    this.orbMat = toon(0x38e5ff, 0x00b4d8, 0.95);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 1), this.orbMat);
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.09, 6, 22),
      toon(0xffd166, 0xff9f1c, 0.6)
    );
    const ring2 = ring1.clone();
    ring2.rotation.x = Math.PI / 2;

    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0x38e5ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.6, 38, 10, 1, true), this.beamMat);
    this.beam.position.y = 19;

    this.group.add(orb, ring1, ring2, this.beam);
    this.orb = orb;
    this.ring1 = ring1;
    this.ring2 = ring2;
    this.scene.add(this.group);

    this.decoys = [];
    for (let i = 0; i < 2; i++) {
      const dg = new THREE.Group();
      const dOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), toon(0xd18bff, 0x7b2cbf, 0.75));
      const dBeam = this.beam.clone();
      dg.add(dOrb, dBeam);
      dg.visible = false;
      this.scene.add(dg);
      this.decoys.push(dg);
    }

    this.trailTimer = 0;
  }

  reset(spawnPos) {
    if (this.carrier) this.carrier.hasCore = false;
    this.carrier = null;
    this.pos.copy(spawnPos);
    this.vel.set(0, 0, 0);
    this.pickupCooldown = 0.4;
  }

  dropFromCarrier(impulseVec) {
    if (!this.carrier) return;
    this.carrier.hasCore = false;
    this.pos.copy(this.carrier.pos).add(new THREE.Vector3(0, 2.2, 0));
    this.vel.copy(impulseVec || new THREE.Vector3((Math.random() - 0.5) * 8, 9, (Math.random() - 0.5) * 8));
    this.carrier = null;
    this.pickupCooldown = 1.05;
  }

  update(dt, elapsed, world, players, mutation, sound, allowPickup = true) {
    if (this.pickupCooldown > 0) this.pickupCooldown -= dt;

    // Tint core & beam based on active mutation so mutations are unmistakable!
    const mutColor = mutation.colorHex || 0x38e5ff;
    this.orbMat.color.setHex(mutColor);
    this.beamMat.color.setHex(mutColor);

    if (this.carrier) {
      this.pos.copy(this.carrier.pos).add(new THREE.Vector3(0, 2.85, 0));
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.14;
        this.particles?.emitBurst(this.pos, 2, {
          color: mutColor,
          speed: 1.8,
          upSpeed: 2.0,
          life: 0.4,
          gravity: -1,
          startScale: 0.75
        });
      }
    } else if (allowPickup) {
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.vel.x *= 0.96;
      this.vel.z *= 0.96;

      for (const p of world.platforms) {
        if (!p.active) continue;
        if (isPointOverPlatform(this.pos.x, this.pos.z, p, 0.35)) {
          if (this.pos.y <= p.topY + 0.75 && this.pos.y >= p.bottomY - 0.5 && this.vel.y <= 0) {
            this.pos.y = p.topY + 0.75;
            this.vel.y = mutation.bouncy ? 11.8 : 0;
          }
        }
      }

      if (this.pos.y < -14) {
        this.reset(world.coreSpawnPos);
        sound.showSubtitle('[Storm Core returned to Central Shrine]');
      }

      if (this.pickupCooldown <= 0) {
        for (const pl of players) {
          if (pl.stunTimer > 0) continue;
          if (pl.pos.distanceTo(this.pos) < 2.05) {
            this.carrier = pl;
            pl.hasCore = true;
            sound.pickupCore();
            this.particles?.emitCorePickup(this.pos);
            break;
          }
        }
      }
    }

    this.group.position.copy(this.pos);
    this.orb.rotation.y += dt * 2.6;
    this.ring1.rotation.x += dt * 2.3;
    this.ring1.rotation.y += dt * 1.5;
    this.ring2.rotation.z += dt * 2.6;

    this.decoys.forEach((dg, idx) => {
      if (mutation.decoys && this.carrier) {
        dg.visible = true;
        const ang = elapsed * 2.4 + idx * Math.PI;
        dg.position.set(
          this.pos.x + Math.cos(ang) * 5.2,
          this.pos.y + Math.sin(elapsed * 3 + idx) * 1.0,
          this.pos.z + Math.sin(ang) * 5.2
        );
      } else {
        dg.visible = false;
      }
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.decoys.forEach((d) => this.scene.remove(d));
  }
}

export class GadgetManager {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.smokes = [];
    this.springs = [];
    this.pullBeams = [];
  }

  clear() {
    this.smokes.forEach((s) => this.scene.remove(s.mesh));
    this.springs.forEach((s) => this.scene.remove(s.mesh));
    this.pullBeams.forEach((b) => this.scene.remove(b.line));
    this.smokes = [];
    this.springs = [];
    this.pullBeams = [];
  }

  useGadget(user, players, core, sound, allowCoreDrop = true) {
    if (user.gadgetCooldown > 0 || user.stunTimer > 0) return false;
    const def = GADGETS[user.gadgetId];
    user.gadgetCooldown = def.cooldown;
    sound.gadget(user.gadgetId);

    if (user.gadgetId === 'smoke') {
      const g = new THREE.Group();
      g.position.copy(user.pos).add(new THREE.Vector3(0, 1.4, 0));
      const mat = new THREE.MeshToonMaterial({ color: 0xe5eef7, transparent: true, opacity: 0.88 });
      for (let i = 0; i < 7; i++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55 + (i % 2) * 0.65, 1), mat);
        puff.position.set((Math.random() - 0.5) * 2.8, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 2.8);
        g.add(puff);
      }
      this.scene.add(g);
      this.smokes.push({ mesh: g, timer: 4.5, mat });
      user.vel.y = Math.max(user.vel.y, 10.2);
      this.particles?.emitRing(user.pos, 0xe5eef7, 4.2, 0.4);
    } else if (user.gadgetId === 'spring') {
      const pad = new THREE.Group();
      pad.position.copy(user.pos).add(new THREE.Vector3(0, 0.18, 0));
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.4, 0.32, 14),
        toon(0xff9f1c, 0xff5400, 0.55)
      );
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.14, 6, 16),
        toon(0xffd166, 0xff9f1c, 0.5)
      );
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.2;
      pad.add(base, coil);
      this.scene.add(pad);
      this.springs.push({ mesh: pad, pos: pad.position.clone(), ownerId: user.id, timer: 14.0 });
    } else if (user.gadgetId === 'shield') {
      user.shieldTimer = 3.5;
      this.particles?.emitRing(user.pos, 0x38e5ff, 3.2, 0.35);
    } else if (user.gadgetId === 'pull') {
      let best = null;
      let bestDist = 13.5;
      for (const p of players) {
        if (p.id === user.id || p.teamId === user.teamId) continue;
        const d = p.pos.distanceTo(user.pos);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      if (best) {
        const pullDir = user.pos.clone().sub(best.pos).normalize();
        if (best.shieldTimer <= 0) {
          best.vel.addScaledVector(pullDir, 17);
          best.vel.y = Math.max(best.vel.y, 6.8);
          if (allowCoreDrop && best.hasCore) {
            core.dropFromCarrier(pullDir.multiplyScalar(7).add(new THREE.Vector3(0, 9.5, 0)));
          }
          this.particles?.emitBurst(best.pos, 10, { color: 0xff5d73, speed: 6, upSpeed: 4 });
        }
        const geo = new THREE.BufferGeometry().setFromPoints([
          user.pos.clone().add(new THREE.Vector3(0, 1.1, 0)),
          best.pos.clone().add(new THREE.Vector3(0, 1.1, 0))
        ]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5d73 }));
        this.scene.add(line);
        this.pullBeams.push({ line, timer: 0.28 });
      }
    }
    return true;
  }

  update(dt, players, sound) {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.timer -= dt;
      s.mesh.rotation.y += dt * 0.7;
      s.mesh.scale.setScalar(1 + (4.5 - s.timer) * 0.08);
      s.mat.opacity = Math.min(0.88, s.timer * 0.35);
      if (s.timer <= 0) {
        this.scene.remove(s.mesh);
        this.smokes.splice(i, 1);
      }
    }

    for (let i = this.springs.length - 1; i >= 0; i--) {
      const sp = this.springs[i];
      sp.timer -= dt;
      for (const pl of players) {
        if (pl.id === sp.ownerId) continue;
        if (pl.pos.distanceTo(sp.pos) < 1.9 && pl.shieldTimer <= 0) {
          pl.vel.y = 22.0;
          pl.grounded = false;
          pl.squashY = 1.35;
          this.particles?.emitRing(sp.pos, 0xff9f1c, 4.5, 0.4);
          sound.bounce();
          sp.timer = 0;
          break;
        }
      }
      if (sp.timer <= 0) {
        this.scene.remove(sp.mesh);
        this.springs.splice(i, 1);
      }
    }

    for (let i = this.pullBeams.length - 1; i >= 0; i--) {
      this.pullBeams[i].timer -= dt;
      if (this.pullBeams[i].timer <= 0) {
        this.scene.remove(this.pullBeams[i].line);
        this.pullBeams.splice(i, 1);
      }
    }
  }
}

export function isPointOverPlatform(x, z, p, pad = 0.25) {
  if (p.shape === 'cylinder') {
    const dx = x - p.x;
    const dz = z - p.z;
    return dx * dx + dz * dz <= (p.radius + pad) * (p.radius + pad);
  }
  return Math.abs(x - p.x) <= p.halfW + pad && Math.abs(z - p.z) <= p.halfD + pad;
}

export function stepPiratePhysics(
  pirate,
  inputMoveVec,
  wantsJump,
  wantsGrapple,
  wantsDash,
  world,
  mutation,
  dt,
  sound,
  particles,
  isLocalPlayer,
  camForward = null
) {
  if (pirate.gadgetCooldown > 0) pirate.gadgetCooldown = Math.max(0, pirate.gadgetCooldown - dt);
  if (pirate.dashCooldown > 0) pirate.dashCooldown = Math.max(0, pirate.dashCooldown - dt);
  if (pirate.dashTimer > 0) pirate.dashTimer = Math.max(0, pirate.dashTimer - dt);
  if (pirate.shieldTimer > 0) pirate.shieldTimer = Math.max(0, pirate.shieldTimer - dt);
  if (pirate.stunTimer > 0) pirate.stunTimer = Math.max(0, pirate.stunTimer - dt);
  if (pirate.climbTimer > 0) pirate.climbTimer = Math.max(0, pirate.climbTimer - dt);

  pirate.wasGrounded = pirate.grounded;

  if (pirate.grounded && pirate.ridingPlatform) {
    pirate.pos.x += pirate.ridingPlatform.vx * dt;
    pirate.pos.y += pirate.ridingPlatform.vy * dt;
    pirate.pos.z += pirate.ridingPlatform.vz * dt;
  }

  // Dash / Tackle Burst
  if (wantsDash && pirate.dashCooldown <= 0 && pirate.stunTimer <= 0) {
    pirate.dashCooldown = 3.2;
    pirate.dashTimer = 0.22;
    const dir = inputMoveVec.lengthSq() > 0.05
      ? inputMoveVec.clone().normalize()
      : new THREE.Vector3(Math.sin(pirate.yaw), 0, Math.cos(pirate.yaw));
    pirate.vel.x = dir.x * 21;
    pirate.vel.z = dir.z * 21;
    pirate.vel.y = Math.max(pirate.vel.y, 3.2);
    pirate.squashY = 0.78;
    if (isLocalPlayer) {
      sound.dash();
      particles?.emitDust(pirate.pos);
    }
  }

  // Grapple action
  if (wantsGrapple && !pirate.grappleActive && pirate.stunTimer <= 0) {
    const target = findBestGrapplePoint(pirate.pos, world.grapplePoints, 26, camForward);
    if (target) {
      pirate.startGrapple(target.pos, isLocalPlayer ? particles : null);
      if (isLocalPlayer) sound.grapple();
    }
  }

  if (pirate.grappleActive) {
    pirate.grappleTimer -= dt;
    const toTarget = pirate.grappleTarget.clone().sub(pirate.pos);
    const dist = toTarget.length();
    if (dist < 2.2 || pirate.grappleTimer <= 0 || wantsJump) {
      pirate.stopGrapple();
      if (wantsJump) pirate.vel.y = 12.2;
    } else {
      toTarget.normalize();
      pirate.vel.lerp(toTarget.multiplyScalar(24), Math.min(1, dt * 8.5));
      pirate.yaw = Math.atan2(pirate.vel.x, pirate.vel.z);
    }
  }

  const moveSpeed = pirate.hasCore ? 10.8 * mutation.speedMult : 10.8;
  const gravMult = pirate.hasCore ? mutation.gravityMult : 1.0;

  if (!pirate.grappleActive && pirate.stunTimer <= 0 && pirate.dashTimer <= 0) {
    const accel = pirate.grounded ? 15 : 7.0;
    pirate.vel.x = THREE.MathUtils.lerp(pirate.vel.x, inputMoveVec.x * moveSpeed, Math.min(1, dt * accel));
    pirate.vel.z = THREE.MathUtils.lerp(pirate.vel.z, inputMoveVec.z * moveSpeed, Math.min(1, dt * accel));
    if (inputMoveVec.lengthSq() > 0.04) {
      const targetYaw = Math.atan2(inputMoveVec.x, inputMoveVec.z);
      let diff = targetYaw - pirate.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      pirate.yaw += diff * Math.min(1, dt * 13);
    }
  }

  for (const wz of world.windZones) {
    const dx = pirate.pos.x - wz.pos.x;
    const dz = pirate.pos.z - wz.pos.z;
    if (
      dx * dx + dz * dz <= wz.radius * wz.radius &&
      pirate.pos.y >= wz.pos.y &&
      pirate.pos.y <= wz.pos.y + wz.height
    ) {
      const windMult = pirate.hasCore && mutation.id === 'floaty' ? 1.45 : 1.0;
      pirate.vel.addScaledVector(wz.force, dt * windMult);
      pirate.grounded = false;
    }
  }

  if (pirate.grounded) pirate.coyoteTimer = 0.15;
  else pirate.coyoteTimer = Math.max(0, pirate.coyoteTimer - dt);

  if (wantsJump && pirate.coyoteTimer > 0 && pirate.stunTimer <= 0) {
    pirate.vel.y = 12.8;
    pirate.grounded = false;
    pirate.coyoteTimer = 0;
    pirate.squashY = 1.28;
    if (isLocalPlayer) {
      sound.jump();
      particles?.emitDust(pirate.pos);
    }
  }

  pirate.vel.y -= 28 * gravMult * dt;

  const prevY = pirate.pos.y;
  pirate.pos.addScaledVector(pirate.vel, dt);

  pirate.grounded = false;
  pirate.ridingPlatform = null;

  for (const p of world.platforms) {
    if (!p.active) continue;
    if (!isPointOverPlatform(pirate.pos.x, pirate.pos.z, p, 0.38)) continue;

    if (prevY >= p.topY - 0.35 && pirate.pos.y <= p.topY + 0.08 && pirate.vel.y <= 0.5) {
      pirate.pos.y = p.topY;
      if (pirate.hasCore && mutation.bouncy) {
        pirate.vel.y = 13.0;
        pirate.squashY = 0.72;
        if (isLocalPlayer) {
          sound.bounce();
          particles?.emitDust(pirate.pos);
        }
      } else {
        if (!pirate.wasGrounded && pirate.vel.y < -8) {
          pirate.squashY = 0.75;
          if (isLocalPlayer) particles?.emitDust(pirate.pos);
        }
        pirate.vel.y = 0;
        pirate.grounded = true;
        pirate.ridingPlatform = p;
      }
      world.triggerCrumbleUnder(p);
      break;
    }

    if (pirate.pos.y < p.topY - 0.1 && pirate.pos.y >= p.topY - 1.9 && pirate.vel.y > -9) {
      pirate.pos.y = p.topY + 0.12;
      pirate.vel.y = 4.8;
      pirate.climbTimer = 0.25;
      pirate.squashY = 1.15;
      if (isLocalPlayer) sound.climb();
      break;
    }
  }

  if (pirate.pos.y < -17) {
    pirate.respawn(particles);
    return 'fell';
  }
  return null;
}

export function findBestGrapplePoint(pos, grapplePoints, maxDist = 26, camForward = null) {
  let best = null;
  let bestScore = Infinity;
  for (const gp of grapplePoints) {
    const toGp = gp.pos.clone().sub(pos);
    const d = toGp.length();
    if (d <= maxDist && d > 3.0) {
      let penalty = 0;
      if (camForward) {
        const dot = toGp.normalize().dot(camForward);
        if (dot < -0.15) continue; // Prefer points ahead of camera
        penalty = (1 - dot) * 14;
      }
      const score = d + penalty;
      if (score < bestScore) {
        bestScore = score;
        best = gp;
      }
    }
  }
  return best;
}
