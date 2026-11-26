import * as THREE from 'three';
import { CHUNK_SIZE, HALF_WORLD, WORLD_SIZE } from '@shared/constants';
import { IslandTerrainData } from '@shared/terrain';
import { getWorldTextures } from './pbrTextures';

interface TerrainChunk {
  cx: number;
  cz: number;
  center: THREE.Vector3;
  bounds: THREE.Box3;
  lodMeshes: [THREE.Mesh, THREE.Mesh, THREE.Mesh]; // [high, med, low]
  activeLod: number;
}

export class ChunkedTerrain {
  public readonly group = new THREE.Group();
  private readonly chunks: TerrainChunk[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly digMounds: THREE.Mesh[] = [];

  constructor(private readonly terrain: IslandTerrainData) {
    this.material = this.createSplatMaterial();
    this.buildAllChunks();
  }

  private createSplatMaterial(): THREE.MeshStandardMaterial {
    const tex = getWorldTextures();
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.04,
      map: tex.grass.map,
      normalMap: tex.grass.normalMap
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSandMap = { value: tex.sand.map };
      shader.uniforms.uGrassMap = { value: tex.grass.map };
      shader.uniforms.uDirtMap = { value: tex.dirt.map };
      shader.uniforms.uRockMap = { value: tex.rock.map };
      shader.uniforms.uMudMap = { value: tex.mud.map };
      shader.uniforms.uRockNormal = { value: tex.rock.normalMap };

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
           varying vec4 vSplat0;
           varying float vSplat1;
           varying vec3 vWorldPos;`
        )
        .replace(
          '#include <map_fragment>',
          `
           vec2 tUv = vWorldPos.xz * 0.09;
           vec3 cSand = texture2D(uSandMap, tUv).rgb;
           vec3 cGrass = texture2D(uGrassMap, tUv * 1.15).rgb;
           vec3 cDirt = texture2D(uDirtMap, tUv).rgb;
           vec3 cRock = texture2D(uRockMap, vWorldPos.xz * 0.06).rgb;
           vec3 cMud = texture2D(uMudMap, tUv).rgb;

           vec3 splatCol =
             cSand * vSplat0.x +
             cGrass * vSplat0.y +
             cDirt * vSplat0.z +
             cRock * vSplat0.w +
             cMud * vSplat1;

           // Wet shoreline darkening near water level (0..1.4m)
           float shoreWet = 1.0 - smoothstep(-0.2, 1.4, vWorldPos.y);
           splatCol *= mix(1.0, 0.66, shoreWet);

           diffuseColor.rgb *= splatCol * 1.45;
          `
        );
    };
    mat.customProgramCacheKey = () => 'treasure-isle-splat-v1';
    return mat;
  }

  private buildChunkGeometry(startX: number, startZ: number, segs: number): THREE.BufferGeometry {
    const vertsPerSide = segs + 1;
    const count = vertsPerSide * vertsPerSide;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
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

        // Finite-difference normal
        const eps = 2.0;
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
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aSplat0', new THREE.BufferAttribute(splat0, 4));
    geo.setAttribute('aSplat1', new THREE.BufferAttribute(splat1, 1));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  private buildAllChunks(): void {
    const gridCount = Math.round(WORLD_SIZE / CHUNK_SIZE); // 16 x 16
    const lodSegs: [number, number, number] = [24, 12, 6];

    for (let cz = 0; cz < gridCount; cz++) {
      for (let cx = 0; cx < gridCount; cx++) {
        const startX = -HALF_WORLD + cx * CHUNK_SIZE;
        const startZ = -HALF_WORLD + cz * CHUNK_SIZE;

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

        this.chunks.push({
          cx,
          cz,
          center,
          bounds: box,
          lodMeshes,
          activeLod: 2
        });
      }
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
    this.digMounds.push(ring);
  }

  public updateVisibility(camera: THREE.Camera, drawDistance: number): void {
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
      chunk.activeLod = targetLod;
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
