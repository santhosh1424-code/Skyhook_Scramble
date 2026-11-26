import { IslandTerrainData } from '@shared/terrain';

self.onmessage = (ev: MessageEvent<{ seed: number }>) => {
  const seed = ev.data.seed;
  const terrain = new IslandTerrainData(seed);
  (self as unknown as Worker).postMessage(
    {
      seed: terrain.seed,
      heightGrid: terrain.heightGrid,
      riverGrid: terrain.riverGrid,
      landmarks: terrain.landmarks,
      volcanoCenter: terrain.volcanoCenter,
      lagoonCenter: terrain.lagoonCenter,
      swampCenter: terrain.swampCenter
    },
    [terrain.heightGrid.buffer, terrain.riverGrid.buffer]
  );
};
