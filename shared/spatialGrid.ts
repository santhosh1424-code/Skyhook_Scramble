// O(1) 2D Spatial Hash Grid for tree, rock, and landmark collision without scanning all objects

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

export class SpatialCollisionGrid {
  private readonly cells = new Map<number, CircleCollider[]>();
  private readonly cellSize = 16;

  private key(cx: number, cz: number): number {
    return ((cx + 512) << 12) ^ (cz + 512);
  }

  public clear(): void {
    this.cells.clear();
  }

  public insert(x: number, z: number, r: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const k = this.key(cx, cz);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push({ x, z, r });
  }

  public resolveXZ(pos: { x: number; z: number }, agentRadius = 0.42): void {
    const cx = Math.floor(pos.x / this.cellSize);
    const cz = Math.floor(pos.z / this.cellSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.cells.get(this.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const col of bucket) {
          const ox = pos.x - col.x;
          const oz = pos.z - col.z;
          const minD = col.r + agentRadius;
          const dSq = ox * ox + oz * oz;
          if (dSq < minD * minD && dSq > 1e-6) {
            const d = Math.sqrt(dSq);
            const push = minD - d;
            pos.x += (ox / d) * push;
            pos.z += (oz / d) * push;
          }
        }
      }
    }
  }
}
