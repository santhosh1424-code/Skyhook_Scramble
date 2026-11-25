import * as THREE from 'three';

function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshToonMaterial({
    color,
    emissive,
    emissiveIntensity
  });
}

function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class SkyWorld {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.platforms = [];
    this.movingBridges = [];
    this.crumbleTiles = [];
    this.windZones = [];
    this.lightningZones = [];
    this.grapplePoints = [];
    this.airships = [];
    this.clouds = [];
    this.flags = [];

    this.coreSpawnPos = new THREE.Vector3(0, 6.2, 0);
    this.layoutName = 'ring';
    this.modifierId = 'normal';
    this.lightningCooldown = 5.0;
    this.rng = makeRng(1337);

    this.buildSkyDome();
  }

  buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(230, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1f82e6) },
        midColor: { value: new THREE.Color(0x6fd0ff) },
        bottomColor: { value: new THREE.Color(0xffe7b8) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = mix(bottomColor, midColor, smoothstep(-0.22, 0.15, h));
          col = mix(col, topColor, smoothstep(0.15, 0.72, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Warm sun disc in the sky
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(18, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff5bd, transparent: true, opacity: 0.92, fog: false })
    );
    sunDisc.position.set(95, 110, 75);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
  }

  clear() {
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    this.platforms = [];
    this.movingBridges = [];
    this.crumbleTiles = [];
    this.windZones = [];
    this.lightningZones = [];
    this.grapplePoints = [];
    this.airships = [];
    this.clouds = [];
    this.flags = [];
  }

  build(layoutChoice, participants, isTeamMode, opts = {}) {
    this.clear();
    const seed = opts.seed ?? Math.floor(Math.random() * 999999);
    this.rng = makeRng(seed);
    this.modifierId = opts.modifierId || 'normal';

    const layouts = ['ring', 'peaks', 'gauntlet', 'caldera'];
    this.layoutName =
      layoutChoice === 'random'
        ? layouts[Math.floor(this.rng() * layouts.length)]
        : layoutChoice;

    this.addBackdropCloudsAndVista();
    this.buildCentralShrine();

    if (this.layoutName === 'ring') {
      this.buildRingLayout();
    } else if (this.layoutName === 'peaks') {
      this.buildPeaksLayout();
    } else if (this.layoutName === 'caldera') {
      this.buildCalderaLayout();
    } else {
      this.buildGauntletLayout();
    }

    // Apply Round Modifier extras
    if (this.modifierId === 'gale') {
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.addWindZone(
          Math.cos(ang) * 18,
          1.5,
          Math.sin(ang) * 18,
          4.2,
          15,
          new THREE.Vector3(Math.cos(ang) * 6, 26, Math.sin(ang) * 6)
        );
      }
    } else if (this.modifierId === 'fragile') {
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.addCrumblePlatform(Math.cos(ang) * 34, 4.2, Math.sin(ang) * 34, 4.2, 4.2);
      }
    }

    this.buildAirships(participants, isTeamMode);
  }

  addBackdropCloudsAndVista() {
    const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    for (let i = 0; i < 28; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const r = 3.2 + ((i + p) % 3) * 1.5;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat);
        m.position.set((p - 1) * 3.5, (p % 2) * 1.15, ((p * 2) % 3) * 1.2);
        g.add(m);
      }
      const angle = (i / 28) * Math.PI * 2;
      const dist = 68 + (i % 5) * 18;
      g.position.set(Math.cos(angle) * dist, -14 + (i % 6) * 8, Math.sin(angle) * dist);
      g.userData.speed = 0.35 + (i % 3) * 0.25;
      g.userData.angle = angle;
      g.userData.dist = dist;
      this.root.add(g);
      this.clouds.push(g);
    }

    // Distant non-playable vista islands for horizon depth
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.22;
      const dist = 96 + (i % 3) * 20;
      const r = 7 + (i % 3) * 4;
      const iy = -4 + (i % 4) * 7;

      const vg = new THREE.Group();
      vg.position.set(Math.cos(ang) * dist, iy, Math.sin(ang) * dist);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1.4, 9), toonMat(0x52c471));
      const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 1.7, 7), toonMat(0x7c6352));
      under.rotation.x = Math.PI;
      under.position.y = -r * 0.85 - 0.7;
      vg.add(top, under);

      // Tiny ruin or waterfall ribbon
      if (i % 2 === 0) {
        const wf = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, r * 1.8, 0.5),
          new THREE.MeshBasicMaterial({ color: 0x9cf0ff, transparent: true, opacity: 0.58 })
        );
        wf.position.set(0, -r * 0.9, r * 0.75);
        vg.add(wf);
      }
      this.root.add(vg);
    }
  }

  addIslandCylinder(x, y, z, radius, height, topColor = 0x57d668, rockColor = 0x85644b) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    // Rich grassy turf cap with overhanging rim
    const capH = 0.95;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.03, capH, 16),
      toonMat(topColor)
    );
    cap.position.y = -capH / 2;
    cap.receiveShadow = true;
    cap.castShadow = true;
    g.add(cap);

    // Earth layer band
    const earth = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.97, radius * 0.86, 1.5, 12),
      toonMat(0x9a7250)
    );
    earth.position.y = -capH - 0.75;
    earth.receiveShadow = true;
    g.add(earth);

    // Tapered craggy floating rock underside
    const rockH = Math.max(3.0, height);
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.88, rockH, 9),
      toonMat(rockColor)
    );
    rock.rotation.x = Math.PI;
    rock.position.y = -capH - 1.4 - rockH / 2;
    rock.castShadow = true;
    g.add(rock);

    // Decorative edge boulders
    const boulderCount = radius >= 9 ? 5 : 3;
    for (let i = 0; i < boulderCount; i++) {
      const a = (i / boulderCount) * Math.PI * 2 + this.rng() * 0.6;
      const br = 0.5 + this.rng() * 0.45;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(br, 0), toonMat(0x8896a6));
      b.position.set(Math.cos(a) * (radius - 0.6), br * 0.25, Math.sin(a) * (radius - 0.6));
      b.castShadow = true;
      g.add(b);
    }

    this.root.add(g);

    const plat = {
      shape: 'cylinder',
      x,
      topY: y,
      bottomY: y - height,
      z,
      radius,
      vx: 0,
      vy: 0,
      vz: 0,
      active: true,
      mesh: g
    };
    this.platforms.push(plat);
    return plat;
  }

  addBoxPlatform(x, y, z, w, d, h = 0.9, color = 0xc98c53) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(color));
    mesh.position.set(x, y - h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    const plat = {
      shape: 'box',
      x,
      topY: y,
      bottomY: y - h,
      z,
      halfW: w / 2,
      halfD: d / 2,
      vx: 0,
      vy: 0,
      vz: 0,
      active: true,
      mesh
    };
    this.platforms.push(plat);
    return plat;
  }

  addRuinsArch(x, y, z, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    const stoneMat = toonMat(0x8899ad);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 3.8, 0.85), stoneMat);
    p1.position.set(-1.6, 1.9, 0);
    p1.castShadow = true;
    const p2 = p1.clone();
    p2.position.set(1.6, 1.9, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.75, 1.0), stoneMat);
    lintel.position.set(0, 4.0, 0);
    lintel.castShadow = true;
    const rune = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38),
      toonMat(0x38e5ff, 0x00a8e8, 0.8)
    );
    rune.position.set(0, 3.2, 0);
    g.add(p1, p2, lintel, rune);
    this.root.add(g);
  }

  addGrappleBuoy(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.2, 8, 18),
      toonMat(0xffcc33, 0x664400, 0.35)
    );
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      toonMat(0x38e5ff, 0x00a8e8, 0.75)
    );
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.35, 20),
      new THREE.MeshBasicMaterial({ color: 0x38e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    g.add(ring, gem, halo);
    this.root.add(g);

    this.grapplePoints.push({
      pos: new THREE.Vector3(x, y, z),
      mesh: g,
      ring,
      gem,
      halo
    });
  }

  addPalmDecor(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.42, 4.5, 7),
      toonMat(0x8d5524)
    );
    trunk.position.y = 2.25;
    trunk.rotation.z = 0.08;
    trunk.castShadow = true;
    g.add(trunk);

    const leafMat = toonMat(0x28c764);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.5, 5), leafMat);
      const ang = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(ang) * 0.9 - 0.15, 4.45, Math.sin(ang) * 0.9);
      frond.rotation.z = -Math.cos(ang) * 1.1;
      frond.rotation.x = Math.sin(ang) * 1.1;
      frond.castShadow = true;
      g.add(frond);
    }

    this.root.add(g);

    this.grapplePoints.push({
      pos: new THREE.Vector3(x, y + 4.6, z),
      mesh: g
    });
  }

  addMovingBridge(ax, ay, az, bx, by, bz, w = 4.4, d = 4.4, speed = 0.75, phase = 0) {
    const plat = this.addBoxPlatform(ax, ay, az, w, d, 0.85, 0xd89c54);
    // Plank rails & glowing sky balloon above bridge
    const railMat = toonMat(0x7c4820);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.25), railMat);
    r1.position.set(0, 0.5, d / 2 - 0.15);
    const r2 = r1.clone();
    r2.position.z = -d / 2 + 0.15;

    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), toonMat(0xe6ccb2));
    rope.position.y = 1.8;

    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 12, 10),
      toonMat(0xff6b6b, 0x440000, 0.15)
    );
    balloon.scale.set(1, 1.18, 1);
    balloon.position.set(0, 3.4, 0);
    balloon.castShadow = true;

    plat.mesh.add(r1, r2, rope, balloon);

    this.movingBridges.push({
      plat,
      a: new THREE.Vector3(ax, ay, az),
      b: new THREE.Vector3(bx, by, bz),
      speed,
      phase
    });
  }

  addCrumblePlatform(x, y, z, w = 4.0, d = 4.0) {
    const mat = toonMat(0x9aa8b8);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), mat);
    mesh.position.set(x, y - 0.425, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Visual crack X on top so players recognize fragile tiles immediately
    const crackMat = toonMat(0x52606d);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.08, 0.22), crackMat);
    c1.position.y = 0.44;
    c1.rotation.y = Math.PI / 4;
    const c2 = c1.clone();
    c2.rotation.y = -Math.PI / 4;
    mesh.add(c1, c2);

    this.root.add(mesh);

    const plat = {
      shape: 'box',
      x,
      topY: y,
      bottomY: y - 0.85,
      z,
      halfW: w / 2,
      halfD: d / 2,
      vx: 0,
      vy: 0,
      vz: 0,
      active: true,
      mesh
    };
    this.platforms.push(plat);

    this.crumbleTiles.push({
      plat,
      mat,
      basePos: new THREE.Vector3(x, y - 0.425, z),
      state: 'solid',
      timer: 0
    });
  }

  addWindZone(x, y, z, radius = 4.2, height = 14, forceVec = new THREE.Vector3(0, 22, 0)) {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.72, height, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xbef5ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    cyl.position.y = height / 2;
    g.add(cyl);

    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.78, 0.11, 6, 18),
        new THREE.MeshBasicMaterial({ color: 0xe6fcff, transparent: true, opacity: 0.65 })
      );
      r.rotation.x = Math.PI / 2;
      r.position.y = (i / 4) * height;
      g.add(r);
      rings.push(r);
    }

    this.root.add(g);
    this.windZones.push({
      pos: new THREE.Vector3(x, y, z),
      radius,
      height,
      force: forceVec,
      rings
    });
  }

  buildCentralShrine() {
    this.addIslandCylinder(0, 2.5, 0, 12.8, 9.5, 0x5be06b, 0x7a5c44);
    this.addIslandCylinder(0, 4.4, 0, 4.8, 2.2, 0x8de8ff, 0x546e7a);
    this.coreSpawnPos.set(0, 5.9, 0);

    // 4 shrine pillars with grapple crystals + glowing rune arches
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(ang) * 9.5;
      const pz = Math.sin(ang) * 9.5;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.9, 5.6, 8),
        toonMat(0x7c8ea6)
      );
      pillar.position.set(px, 5.2, pz);
      pillar.castShadow = true;
      this.root.add(pillar);
      this.addGrappleBuoy(px, 8.9, pz);
    }
    this.addRuinsArch(0, 2.5, -10.2, 0);
    this.addRuinsArch(0, 2.5, 10.2, Math.PI);
  }

  buildRingLayout() {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const dist = 26;
      const ix = Math.cos(ang) * dist;
      const iz = Math.sin(ang) * dist;
      const iy = 2.8 + (i % 2) * 1.9;

      this.addIslandCylinder(ix, iy, iz, 7.0, 7.5, 0x60d866, 0x836148);
      if (i % 2 === 0) this.addPalmDecor(ix + 1.8, iy, iz - 1.5);
      else this.addRuinsArch(ix, iy, iz, ang);

      const mx = Math.cos(ang) * 16.5;
      const mz = Math.sin(ang) * 16.5;
      if (i % 2 === 0) {
        this.addMovingBridge(
          Math.cos(ang) * 14.5, 3.0, Math.sin(ang) * 14.5,
          Math.cos(ang) * 20.0, iy, Math.sin(ang) * 20.0,
          4.4, 4.4, 0.85, i
        );
      } else {
        this.addCrumblePlatform(mx, 2.9, mz, 4.0, 4.0);
        this.addGrappleBuoy(mx, 8.3, mz);
      }

      const midAng = ang + Math.PI / 6;
      this.addWindZone(Math.cos(midAng) * 25, -1.5, Math.sin(midAng) * 25, 3.9, 14, new THREE.Vector3(0, 23, 0));
      this.addGrappleBuoy(Math.cos(midAng) * 35, 9.2, Math.sin(midAng) * 35);
    }
  }

  buildPeaksLayout() {
    const sides = [-1, 1];
    sides.forEach((side, idx) => {
      this.addIslandCylinder(side * 22, 4.6, 0, 7.4, 8.5, 0x56d378, 0x735b49);
      this.addIslandCylinder(side * 33, 7.9, idx === 0 ? 5 : -5, 6.4, 9.5, 0x78e284, 0x6d5848);
      this.addPalmDecor(side * 33, 7.9, idx === 0 ? 5 : -5);
      this.addRuinsArch(side * 22, 4.6, idx === 0 ? -3.5 : 3.5, Math.PI / 2);

      this.addMovingBridge(side * 13.5, 3.4, 0, side * 16.5, 4.6, 0, 4.4, 4.4, 0.9, idx * 2);
      this.addWindZone(side * 27, 2.0, idx === 0 ? 4 : -4, 4.3, 15, new THREE.Vector3(0, 25, 0));
      this.addGrappleBuoy(side * 24, 11.4, idx === 0 ? -7 : 7);
    });

    [-1, 1].forEach((dir) => {
      this.addCrumblePlatform(0, 3.2, dir * 16.5, 4.3, 4.3);
      this.addIslandCylinder(0, 3.8, dir * 26, 6.8, 7.5, 0x62d96c, 0x805f46);
      this.addCrumblePlatform(0, 4.0, dir * 36.5, 4.2, 4.2);
      this.addGrappleBuoy(0, 9.6, dir * 20);
    });
  }

  buildGauntletLayout() {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);

      this.addCrumblePlatform(cos * 16.5, 2.9, sin * 16.5, 4.2, 4.2);
      this.addIslandCylinder(cos * 25, 3.6, sin * 25, 6.4, 7.5, 0x5cd86c, 0x7d5d44);
      this.addMovingBridge(
        cos * 33 - sin * 4, 4.0, sin * 33 + cos * 4,
        cos * 33 + sin * 4, 4.0, sin * 33 - cos * 4,
        4.6, 4.6, 1.0, i
      );
      this.addPalmDecor(cos * 25, 3.6, sin * 25);
      this.addGrappleBuoy(cos * 39, 9.2, sin * 39);
      this.addWindZone(cos * 33, 1.0, sin * 33, 4.5, 11, new THREE.Vector3(-sin * 12, 11, cos * 12));
    }
  }

  buildCalderaLayout() {
    // Spiral rising ring + high outer overlooks + strong diagonal wind jets
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = i % 2 === 0 ? 21 : 31;
      const iy = 2.6 + (i % 4) * 1.4;
      const ix = Math.cos(ang) * dist;
      const iz = Math.sin(ang) * dist;

      if (i % 2 === 0) {
        this.addIslandCylinder(ix, iy, iz, 5.6, 7, 0x62df7a, 0x7b5c43);
        if (i % 4 === 0) this.addPalmDecor(ix, iy, iz);
      } else {
        this.addMovingBridge(
          Math.cos(ang - 0.16) * 28, iy, Math.sin(ang - 0.16) * 28,
          Math.cos(ang + 0.16) * 28, iy + 1.2, Math.sin(ang + 0.16) * 28,
          4.5, 4.5, 0.95, i
        );
        this.addGrappleBuoy(ix * 1.1, iy + 5.8, iz * 1.1);
      }
    }
    this.addWindZone(0, -1.0, 0, 5.5, 15, new THREE.Vector3(0, 20, 0));
  }

  buildAirships(participants, isTeamMode) {
    const anchors = [];
    if (isTeamMode) {
      const seenTeams = new Set();
      participants.forEach((p) => {
        if (!seenTeams.has(p.teamId)) {
          seenTeams.add(p.teamId);
          anchors.push({
            teamId: p.teamId,
            ownerId: null,
            color: p.teamColorHex,
            colorCss: p.teamColor,
            shape: p.shape,
            label: p.teamName
          });
        }
      });
    } else {
      participants.forEach((p) => {
        anchors.push({
          teamId: p.teamId,
          ownerId: p.id,
          color: p.teamColorHex,
          colorCss: p.teamColor,
          shape: p.shape,
          label: p.name.replace(' [BOT]', '')
        });
      });
    }

    const radius = isTeamMode ? 48 : 50;
    anchors.forEach((info, idx) => {
      const ang = (idx / anchors.length) * Math.PI * 2;
      const ax = Math.cos(ang) * radius;
      const az = Math.sin(ang) * radius;
      const ay = 4.6;

      const ship = this.createAirshipMesh(ax, ay, az, ang, info, isTeamMode ? 1.28 : 0.95);
      this.airships.push(ship);

      const bx = Math.cos(ang) * (radius - 9.5);
      const bz = Math.sin(ang) * (radius - 9.5);
      this.addGrappleBuoy(bx, ay + 4.8, bz);
    });
  }

  createAirshipMesh(x, y, z, angle, info, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = -angle + Math.PI / 2;

    const deckW = 7.6 * scale;
    const deckD = 11.0 * scale;

    const hull = new THREE.Mesh(new THREE.BoxGeometry(deckW, 1.55 * scale, deckD), toonMat(0x8e562e));
    hull.position.y = -0.78 * scale;
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);

    // Keel & bow prow
    const keel = new THREE.Mesh(new THREE.ConeGeometry(deckW * 0.55, 3.0 * scale, 6), toonMat(0x6e4121));
    keel.rotation.x = Math.PI / 2;
    keel.position.set(0, -0.7 * scale, deckD / 2 + 1.1 * scale);
    g.add(keel);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(deckW + 0.4, 0.45 * scale, deckD + 0.4), toonMat(info.color));
    trim.position.y = -0.14;
    g.add(trim);

    // Mast + fluttering team banner flag
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 5.2 * scale, 6), toonMat(0x5b3719));
    mast.position.set(0, 2.5 * scale, -deckD * 0.22);
    g.add(mast);

    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 1.05 * scale, 0.12), toonMat(info.color));
    flag.position.set(1.1 * scale, 4.5 * scale, -deckD * 0.22);
    g.add(flag);
    this.flags.push(flag);

    // Overhead dirigible balloon
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(3.15 * scale, 14, 12), toonMat(info.color));
    balloon.scale.set(0.95, 0.75, 1.85);
    balloon.position.y = 6.6 * scale;
    balloon.castShadow = true;
    g.add(balloon);

    // Spinning propeller
    const prop = new THREE.Mesh(new THREE.BoxGeometry(3.4 * scale, 0.36 * scale, 0.26 * scale), toonMat(0xffd166));
    prop.position.set(0, 0.4, -deckD / 2 - 0.5);
    g.add(prop);

    // Delivery Ring + Soft vertical beacon
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.55 * scale, 0.24, 8, 24),
      toonMat(info.color, info.color, 0.85)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22;
    g.add(ring);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3 * scale, 2.3 * scale, 5.5, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: info.color,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    beacon.position.y = 2.75;
    g.add(beacon);

    this.root.add(g);

    this.platforms.push({
      shape: 'cylinder',
      x,
      topY: y,
      bottomY: y - 2.0,
      z,
      radius: 5.0 * scale,
      vx: 0,
      vy: 0,
      vz: 0,
      active: true,
      mesh: g
    });

    this.grapplePoints.push({
      pos: new THREE.Vector3(x, y + 3.6 * scale, z),
      mesh: balloon
    });

    return {
      ...info,
      pos: new THREE.Vector3(x, y, z),
      deliveryRadius: 3.35 * scale,
      group: g,
      ringMesh: ring,
      propMesh: prop
    };
  }

  spawnLightningStrike(targetPos) {
    const g = new THREE.Group();
    g.position.set(targetPos.x, targetPos.y + 0.15, targetPos.z);

    const warnRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe600, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    warnRing.rotation.x = -Math.PI / 2;

    const fillDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 20),
      new THREE.MeshBasicMaterial({ color: 0xff9f1c, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
    );
    fillDisc.rotation.x = -Math.PI / 2;
    fillDisc.scale.setScalar(0.05);

    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.75, 26, 6),
      new THREE.MeshBasicMaterial({ color: 0xaaf8ff, transparent: true, opacity: 0 })
    );
    bolt.position.y = 13;

    g.add(warnRing, fillDisc, bolt);
    this.root.add(g);

    this.lightningZones.push({
      pos: targetPos.clone(),
      radius: 3.4,
      duration: 1.9,
      timer: 1.9,
      struck: false,
      cleanupTimer: 0.55,
      group: g,
      warnRing,
      fillDisc,
      bolt
    });
  }

  update(dt, elapsed, players, corePos, activeMutation, isOvertime, onLightningStrike) {
    this.clouds.forEach((c) => {
      c.userData.angle += dt * 0.015 * c.userData.speed;
      c.position.x = Math.cos(c.userData.angle) * c.userData.dist;
      c.position.z = Math.sin(c.userData.angle) * c.userData.dist;
    });

    this.flags.forEach((f, idx) => {
      f.rotation.y = Math.sin(elapsed * 5 + idx) * 0.28;
    });

    // Moving bridges
    this.movingBridges.forEach((mb) => {
      const t = (Math.sin(elapsed * mb.speed + mb.phase) + 1) * 0.5;
      const nx = THREE.MathUtils.lerp(mb.a.x, mb.b.x, t);
      const ny = THREE.MathUtils.lerp(mb.a.y, mb.b.y, t);
      const nz = THREE.MathUtils.lerp(mb.a.z, mb.b.z, t);

      mb.plat.vx = (nx - mb.plat.x) / Math.max(dt, 0.001);
      mb.plat.vy = (ny - mb.plat.topY) / Math.max(dt, 0.001);
      mb.plat.vz = (nz - mb.plat.z) / Math.max(dt, 0.001);

      mb.plat.x = nx;
      mb.plat.topY = ny;
      mb.plat.bottomY = ny - 0.85;
      mb.plat.z = nz;
      mb.plat.mesh.position.set(nx, ny - 0.425, nz);
    });

    // Crumble platforms with orange warning flash
    this.crumbleTiles.forEach((ct) => {
      if (ct.state === 'shaking') {
        ct.timer -= dt;
        ct.mat.color.setHex(Math.sin(elapsed * 30) > 0 ? 0xff7b47 : 0x9aa8b8);
        ct.plat.mesh.position.x = ct.basePos.x + (Math.random() - 0.5) * 0.25;
        ct.plat.mesh.position.z = ct.basePos.z + (Math.random() - 0.5) * 0.25;
        if (ct.timer <= 0) {
          ct.state = 'fallen';
          ct.plat.active = false;
          ct.timer = 5.2;
          ct.plat.mesh.visible = false;
          this.particles?.emitDust(ct.basePos);
        }
      } else if (ct.state === 'fallen') {
        ct.timer -= dt;
        if (ct.timer <= 0) {
          ct.state = 'solid';
          ct.plat.active = true;
          ct.plat.mesh.visible = true;
          ct.mat.color.setHex(0x9aa8b8);
          ct.plat.mesh.position.copy(ct.basePos);
        }
      }
    });

    this.windZones.forEach((wz) => {
      wz.rings.forEach((r, idx) => {
        r.position.y = (r.position.y + dt * 6.0) % wz.height;
        r.rotation.z += dt * (2.0 + idx * 0.3);
      });
    });

    this.airships.forEach((ship, i) => {
      ship.propMesh.rotation.z += dt * 13;
      ship.ringMesh.scale.setScalar(1 + Math.sin(elapsed * 4.5 + i) * 0.07);
    });

    this.grapplePoints.forEach((gp) => {
      if (gp.gem) gp.gem.rotation.y += dt * 2.4;
      if (gp.halo) gp.halo.lookAt(0, gp.pos.y + 4, 0);
    });

    // Lightning spawning (mod-aware & overtime-aware)
    this.lightningCooldown -= dt;
    if (this.lightningCooldown <= 0) {
      let interval = 5.8;
      if (this.modifierId === 'thunderhead') interval = 3.2;
      if (activeMutation.lightningMagnet) interval = 2.6;
      if (isOvertime) interval = 2.2;
      this.lightningCooldown = interval;

      const target =
        activeMutation.lightningMagnet && corePos
          ? new THREE.Vector3(
              corePos.x + (Math.random() - 0.5) * 9,
              Math.max(2.5, corePos.y),
              corePos.z + (Math.random() - 0.5) * 9
            )
          : new THREE.Vector3((Math.random() - 0.5) * 44, 3.0, (Math.random() - 0.5) * 44);
      this.spawnLightningStrike(target);
    }

    for (let i = this.lightningZones.length - 1; i >= 0; i--) {
      const lz = this.lightningZones[i];
      if (!lz.struck) {
        lz.timer -= dt;
        const progress = 1 - Math.max(0, lz.timer) / lz.duration;
        lz.fillDisc.scale.setScalar(Math.max(0.05, progress));
        lz.warnRing.scale.setScalar(1 + Math.sin(elapsed * 22) * 0.1);
        if (lz.timer <= 0) {
          lz.struck = true;
          lz.bolt.material.opacity = 0.96;
          this.particles?.emitLightningImpact(lz.pos);
          onLightningStrike(lz.pos, lz.radius);
        }
      } else {
        lz.cleanupTimer -= dt;
        lz.bolt.material.opacity = Math.max(0, lz.cleanupTimer * 1.8);
        if (lz.cleanupTimer <= 0) {
          this.root.remove(lz.group);
          this.lightningZones.splice(i, 1);
        }
      }
    }
  }

  triggerCrumbleUnder(plat) {
    const found = this.crumbleTiles.find((c) => c.plat === plat);
    if (found && found.state === 'solid') {
      found.state = 'shaking';
      found.timer = 1.05;
    }
  }
}
