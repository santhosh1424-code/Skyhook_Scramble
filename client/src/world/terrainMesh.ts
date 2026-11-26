import * as THREE from 'three';
import { CHUNK_SIZE, HALF_WORLD, WORLD_SIZE } from '@shared/constants';
import { IslandTerrainData } from '@shared/terrain';
import { getWorldTextures } from './pbrTextures';

interface TerrainChunk {
  cx: number;
  cz: number;
  center: THREE.Vector3;
  bounds: THREE.Box3;
  lodMeshes: [THREE.Mesh, THREE.Mesh, THREE.Mesh];
}

export class ChunkedTerrain {
  public readonly group = new THREE.Group();
  private readonly chunks: TerrainChunk[] = [];
  private readonly pendingCoords: { cx: number; cz: number; distSq: number }[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();

  constructor(private readonly terrain: IslandTerrainData, spawnX = 0, spawnZ = 0) {
    this.material = this.createSplatMaterial();
    this.initProgressiveChunks(spawnX, spawnZ);
  }

  private createSplatMaterial(): THREE.MeshStandardMaterial {
    const tex = getWorldTextures();
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.04,
      vertexColors: true, // Vertex-baked Ambient Occlusion!
      map: tex.grass.map,
      normalMap: tex.grass.normalMap
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSandMap = { value: tex.sand.map };
      shader.uniforms.uGrassMap = { value: tex.grass.map };
      shader.uniforms.uDirtMap = { value: tex.dirt.map };
      shader.uniforms.uRockMap = { value: tex.rock.map };
      shader.uniforms.uMudMap = { value: tex.mud.map };
      shader.uniforms.uDetailMap = { value: tex.detailMap };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec4 aSplat0;
           attribute float aSplat1;
           varying vec4 vSplat0;
           varying float vSplat1;
           varying vec3 vWorldPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSplat0 = aSplat0;
           vSplat1 = aSplat1;
           vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uSandMap;
           uniform sampler2D uGrassMap;
           uniform sampler2D uDirtMap;
           uniform sampler2D uRockMap;
           uniform sampler2D uMudMap;
           uniform sampler2D uDetailMap;
           varying vec4 vSplat0;
           varying float vSplat1;
           varying vec3 vWorldPos;`
        )
        .replace(
          '#include <map_fragment>',
          `
           vec2 tUv = vWorldPos.xz * 0.095;
           vec3 cSand = texture2D(uSandMap, tUv).rgb;
           vec3 cGrass = texture2D(uGrassMap, tUv * 1.15).rgb;
           vec3 cDirt = texture2D(uDirtMap, tUv).rgb;
           vec3 cRock = texture2D(uRockMap, vWorldPos.xz * 0.065).rgb;
           vec3 cMud = texture2D(uMudMap, tUv).rgb;

           // Detail texture prevents close-up ground stretching
           float detail = texture2D(uDetailMap, vWorldPos.xz * 0.68).r * 0.36 + 0.82;

           vec3 splatCol =
             cSand * vSplat0.x +
             cGrass * vSplat0.y +
             cDirt * vSplat0.z +
             cRock * vSplat0.w +
             cMud * vSplat1;

           // Wet sand darkening line & higher sheen near shoreline
           float wetBand = 1.0 - smoothstep(-0.2, 1.55, vWorldPos.y);
           vec3 wetSand = cSand * vec3(0.55, 0.52, 0.46);
           splatCol = mix(splatCol, wetSand, wetBand * clamp(vSplat0.x + 0.35, 0.0, 1.0));

           diffuseColor.rgb *= splatCol * detail * 1.42;
          `
        );
    };
    mat.customProgramCacheKey = () => 'treasure-island-splat-ao-v2';
    return mat;
  }

  private buildChunkGeometry(startX: number, startZ: number, segs: number): THREE.BufferGeometry {
    const vertsPerSide = segs + 1;
    const count = vertsPerSide * vertsPerSide;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const splat0 = new Float32Array(count * 4);
    const splat1 = new Float32Array(count);

    const step = CHUNK_SIZE / segs;
    let ptr = 0;

    for (let iz = 0; iz <= segs; iz++) {
      for (let ix = 0; ix <= segs; ix++) {
        const wx = startX + ix * step;
        const wz = startZ + iz * step;
        const s = this.terrain.sample(wx, wz);

        positions[ptr * 3] = wx;
        positions[ptr * 3 + 1] = s.height;
        positions[ptr * 3 + 2] = wz;

        const eps = 3.5;
        const hL = this.terrain.getHeight(wx - eps, wz);
        const hR = this.terrain.getHeight(wx + eps, wz);
        const hD = this.terrain.getHeight(wx, wz - eps);
        const hU = this.terrain.getHeight(wx, wz + eps);
        const nx = hL - hR;
        const ny = 2 * eps;
        const nz = hD - hU;
        const inv = 1 / Math.hypot(nx, ny, nz);
        normals[ptr * 3] = nx * inv;
        normals[ptr * 3 + 1] = ny * inv;
        normals[ptr * 3 + 2] = nz * inv;

        // Vertex-baked Ambient Occlusion: crevices & steep slopes darken naturally
        const avgNeighbors = (hL + hR + hD + hU) * 0.25;
        const concavity = Math.max(0, avgNeighbors - s.height);
        const ao = Math.max(0.55, Math.min(1.0, 1.0 - concavity * 0.14 - s.slope * 0.18));
        colors[ptr * 3] = ao;
        colors[ptr * 3 + 1] = ao;
        colors[ptr * 3 + 2] = ao;

        uvs[ptr * 2] = ix / segs;
        uvs[ptr * 2 + 1] = iz / segs;

        splat0[ptr * 4] = s.splat[0];
        splat0[ptr * 4 + 1] = s.splat[1];
        splat0[ptr * 4 + 2] = s.splat[2];
        splat0[ptr * 4 + 3] = s.splat[3];
        splat1[ptr] = s.splat[4];

        ptr++;
      }
    }

    const indices: number[] = [];
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * vertsPerSide + ix;
        const b = a + 1;
        const c = (iz + 1) * vertsPerSide + ix;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aSplat0', new THREE.BufferAttribute(splat0, 4));
    geo.setAttribute('aSplat1', new THREE.BufferAttribute(splat1, 1));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  private createChunk(cx: number, cz: number): void {
    const startX = -HALF_WORLD + cx * CHUNK_SIZE;
    const startZ = -HALF_WORLD + cz * CHUNK_SIZE;
    const lodSegs: [number, number, number] = [24, 12, 6];

    const makeLod = (segs: number, idx: number): THREE.Mesh => {
      const geo = this.buildChunkGeometry(startX, startZ, segs);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = idx === 0;
      mesh.visible = idx === 2;
      this.group.add(mesh);
      return mesh;
    };

    const lodMeshes: [THREE.Mesh, THREE.Mesh, THREE.Mesh] = [
      makeLod(lodSegs[0], 0),
      makeLod(lodSegs[1], 1),
      makeLod(lodSegs[2], 2)
    ];

    const box = lodMeshes[0].geometry.boundingBox!.clone();
    const center = new THREE.Vector3();
    box.getCenter(center);

    this.chunks.push({ cx, cz, center, bounds: box, lodMeshes });
  }

  /** Build spawn-area chunks immediately so player starts playing instantly; stream rest in background */
  private initProgressiveChunks(spawnX: number, spawnZ: number): void {
    const gridCount = Math.round(WORLD_SIZE / CHUNK_SIZE);
    const list: { cx: number; cz: number; distSq: number }[] = [];

    for (let cz = 0; cz < gridCount; cz++) {
      for (let cx = 0; cx < gridCount; cx++) {
        const mx = -HALF_WORLD + (cx + 0.5) * CHUNK_SIZE;
        const mz = -HALF_WORLD + (cz + 0.5) * CHUNK_SIZE;
        const dx = mx - spawnX;
        const dz = mz - spawnZ;
        list.push({ cx, cz, distSq: dx * dx + dz * dz });
      }
    }
    list.sort((a, b) => a.distSq - b.distSq);

    // Build closest 36 chunks immediately (< 35ms), stream remaining 220 chunks asynchronously
    const immediate = list.slice(0, 36);
    const rest = list.slice(36);
    for (const c of immediate) this.createChunk(c.cx, c.cz);
    this.pendingCoords.push(...rest);
  }

  /** Called each frame or idle slice to build remaining chunks without main-thread hitching */
  public streamRemainingChunks(budgetPerFrame = 4): void {
    let built = 0;
    while (this.pendingCoords.length > 0 && built < budgetPerFrame) {
      const next = this.pendingCoords.shift()!;
      this.createChunk(next.cx, next.cz);
      built++;
    }
  }

  public addDigMound(x: number, y: number, z: number): void {
    const tex = getWorldTextures();
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.34, 8, 18),
      new THREE.MeshStandardMaterial({ map: tex.dirt.map, normalMap: tex.dirt.normalMap, roughness: 0.95 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    ring.receiveShadow = true;

    const pit = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1.0 })
    );
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.03;

    g.add(ring, pit);
    this.group.add(g);
  }

  public updateVisibility(camera: THREE.Camera, drawDistance: number): void {
    this.streamRemainingChunks(4);
    camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const camPos = camera.position;
    for (const chunk of this.chunks) {
      const dist = camPos.distanceTo(chunk.center);
      if (dist > drawDistance + CHUNK_SIZE || !this.frustum.intersectsBox(chunk.bounds)) {
        chunk.lodMeshes[0].visible = false;
        chunk.lodMeshes[1].visible = false;
        chunk.lodMeshes[2].visible = false;
        continue;
      }

      const targetLod = dist < 240 ? 0 : dist < 560 ? 1 : 2;
      chunk.lodMeshes[0].visible = targetLod === 0;
      chunk.lodMeshes[1].visible = targetLod === 1;
      chunk.lodMeshes[2].visible = targetLod === 2;
    }
  }

  public dispose(): void {
    for (const c of this.chunks) {
      c.lodMeshes.forEach((m) => m.geometry.dispose());
    }
    this.material.dispose();
  }
}
