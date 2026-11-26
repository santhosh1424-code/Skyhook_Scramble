import { createRng } from './prng.js';
import type { IslandTerrainData } from './terrain.js';

export interface ClueNode {
  index: number;
  kind: 'map_piece' | 'riddle_note' | 'compass_bearing' | 'rock_carving';
  title: string;
  riddle: string;
  landmarkName: string;
  x: number;
  y: number;
  z: number;
}

export interface TreasureHuntPlan {
  treasurePos: { x: number; y: number; z: number };
  clues: ClueNode[];
}

function compassDirection(dx: number, dz: number): string {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const dirs = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  return dirs[Math.round(deg / 45) % 8];
}

export function generateTreasureHunt(terrain: IslandTerrainData): TreasureHuntPlan {
  const rng = createRng(terrain.seed + 31337);

  // Pick a random dry, walkable spot on the island for the buried chest (never shown on map!)
  let tx = 140;
  let ty = 12;
  let tz = -80;
  for (let attempt = 0; attempt < 180; attempt++) {
    const ang = rng() * Math.PI * 2;
    const dist = 120 + rng() * 520;
    const cx = Math.cos(ang) * dist;
    const cz = Math.sin(ang) * dist;
    const s = terrain.sample(cx, cz);
    if (s.height > 2.8 && s.height < 42 && s.slope < 0.28) {
      tx = cx;
      ty = s.height;
      tz = cz;
      break;
    }
  }

  // Gather distinct clue-hosting landmarks
  const pool = terrain.landmarks.filter((l) =>
    ['shipwreck', 'cave', 'temple_ruins', 'pirate_fort', 'camp', 'port_village'].includes(l.kind)
  );

  // Deterministic shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const lm0 = pool[0] || terrain.landmarks[0];
  const lm1 = pool[1] || terrain.landmarks[1];
  const lm2 = pool[2] || terrain.landmarks[2];

  // Clue 4: Carved "X" rock marker ~10m near the actual buried treasure
  const rockAng = rng() * Math.PI * 2;
  const rx = tx + Math.cos(rockAng) * 10;
  const rz = tz + Math.sin(rockAng) * 10;
  const ry = terrain.getHeight(rx, rz);

  const dir1 = compassDirection(lm1.x - lm0.x, lm1.z - lm0.z);
  const dir2 = compassDirection(lm2.x - lm1.x, lm2.z - lm1.z);
  const dirTreasure = compassDirection(tx - lm2.x, tz - lm2.z);
  const distTreasure = Math.round(Math.hypot(tx - lm2.x, tz - lm2.z));

  const clues: ClueNode[] = [
    {
      index: 0,
      kind: 'map_piece',
      title: 'Torn Map Scrap',
      riddle: `Seek the first torn chart inside ${lm0.name}.`,
      landmarkName: lm0.name,
      x: lm0.x + 1.5,
      y: terrain.getHeight(lm0.x + 1.5, lm0.z + 1.5),
      z: lm0.z + 1.5
    },
    {
      index: 1,
      kind: 'riddle_note',
      title: 'Captain’s Riddle Note',
      riddle: `"March ${dir1} toward ${lm1.name} where old stones whisper."`,
      landmarkName: lm1.name,
      x: lm1.x - 1.5,
      y: terrain.getHeight(lm1.x - 1.5, lm1.z + 1.5),
      z: lm1.z + 1.5
    },
    {
      index: 2,
      kind: 'compass_bearing',
      title: 'Brass Compass Bearing',
      riddle: `"Head ${dir2} to ${lm2.name} for the final surveyor's bearing."`,
      landmarkName: lm2.name,
      x: lm2.x + 1.2,
      y: terrain.getHeight(lm2.x + 1.2, lm2.z - 1.4),
      z: lm2.z - 1.4
    },
    {
      index: 3,
      kind: 'rock_carving',
      title: 'Carved "X" Stone',
      riddle: `"Pace ${distTreasure}m ${dirTreasure} from ${lm2.name} to the carved X rock — dig nearby!"`,
      landmarkName: 'Hidden X Carving',
      x: rx,
      y: ry,
      z: rz
    }
  ];

  return {
    treasurePos: { x: tx, y: ty, z: tz },
    clues
  };
}
