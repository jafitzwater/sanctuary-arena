import { WAVE_INTERVAL } from '../waves';
import { CAVE_RESPAWN } from '../caves';
import type { ActDef, PathDef, PathId, TowerSpawn } from './types';


/**
 * Sanctuary. Three paths join two mirrored Rogue Encampments (batch 3 item 7).
 * Doc: "Bases mirror the different towns in the different acts. Example: rogue encampment on one side,
 * and on the other side a similar base, just different colors. Red is one side's primary glow. Blue is
 * the other. The three roadways are mirrored end to end."
 * Mirror = 180-degree turn about the map center: (x, y) -> (W - x, H - y), lane order reversed.
 * The river is ground paint only (item 23).
 * Doc: "Each roadway has 2 support towers, spread apart. A gap of ground exists between
 * the sides where no towers exist." Read per side: each side has an inner and an outer
 * tower on each path, and no towers stand between the two outer towers.
 * Doc: "Those rogue towers and fire towers are the same towers as the roadway support towers."
 * So there are no extra Worldstone guardian towers.
 * The seal behind the third tower is scenery until the seal rules land.
 */
function along(lane: { x: number; y: number }[], t: number): { x: number; y: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < lane.length; i++) {
    const len = Math.hypot(lane[i].x - lane[i - 1].x, lane[i].y - lane[i - 1].y);
    lengths.push(len);
    total += len;
  }
  let dist = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (dist <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? dist / lengths[i] : 0;
      return {
        x: lane[i].x + (lane[i + 1].x - lane[i].x) * f,
        y: lane[i].y + (lane[i + 1].y - lane[i].y) * f,
      };
    }
    dist -= lengths[i];
  }
  return lane[lane.length - 1];
}

const MAP_W = 4400;
const MAP_H = 2800;

/** Doc: "The three roadways are mirrored end to end." 180-degree turn about the map center. */
export function mirrorPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: MAP_W - p.x, y: MAP_H - p.y };
}

/** The mirrored copy of a lane, walked from the same (ally) end. */
export function mirrorLane(lane: { x: number; y: number }[]): { x: number; y: number }[] {
  return [...lane].reverse().map(mirrorPoint);
}

/** Average a lane with its own mirror, so it maps onto itself end to end. */
function symmetric(lane: { x: number; y: number }[]): { x: number; y: number }[] {
  const flip = mirrorLane(lane);
  return lane.map((p, i) => ({ x: Math.round((p.x + flip[i].x) / 2), y: Math.round((p.y + flip[i].y) / 2) }));
}

const north: PathDef = {
  id: 'north',
  name: 'Barricade',
  road: '#7f8c98',
  edge: '#3c4a56',
  lane: [
    { x: 780, y: 1760 },
    { x: 620, y: 980 },
    { x: 1180, y: 460 },
    { x: 2100, y: 340 },
    { x: 3000, y: 420 },
    { x: 3620, y: 820 },
  ],
  ally: [{ unit: 'rogue', count: 1 }],
  enemy: [{ unit: 'fallen', count: 2 }],
  later: {
    nightmare: [{ unit: 'skeleton', count: 2 }],
    hell: [
      { unit: 'goatman', count: 1 },
      { unit: 'demon', count: 1 },
    ],
  },
};

const center: PathDef = {
  id: 'center',
  name: 'Blood Moor',
  road: '#6a4e38',
  edge: '#3a2b22',
  lane: symmetric([
    { x: 980, y: 1960 },
    { x: 1680, y: 1560 },
    { x: 2360, y: 1240 },
    { x: 3040, y: 940 },
    { x: 3560, y: 760 },
  ]),
  ally: [
    { unit: 'rogue', count: 1 },
    { unit: 'rogue-archer', count: 1 },
  ],
  enemy: [
    { unit: 'fallen', count: 1 },
    { unit: 'zombie', count: 1 },
  ],
  later: {
    nightmare: [
      { unit: 'hungry-dead', count: 1 },
      { unit: 'skeleton', count: 1 },
    ],
    hell: [
      { unit: 'mummy', count: 1 },
      { unit: 'goatman', count: 1 },
    ],
  },
};

const south: PathDef = {
  id: 'south',
  name: 'Kurast',
  road: '#3d6a45',
  edge: '#1c3324',
  lane: mirrorLane(north.lane),
  ally: [{ unit: 'rogue', count: 1 }],
  enemy: [
    { unit: 'quillrat', count: 1 },
    { unit: 'fallen', count: 1 },
  ],
  later: {
    nightmare: [
      { unit: 'willowisp', count: 1 },
      { unit: 'quillrat', count: 1 },
    ],
    hell: [
      { unit: 'demon', count: 1 },
      { unit: 'willowisp', count: 1 },
    ],
  },
};

function laneTowers(path: PathDef): TowerSpawn[] {
  const seats: { team: 'ally' | 'enemy'; role: 'inner' | 'outer'; t: number; tier: 1 | 2 }[] = [
    // Item 7: mirrored seats (t and 1 - t). The 0.08 gap between the outer towers is kept.
    { team: 'ally', role: 'inner', t: 0.32, tier: 1 },
    { team: 'ally', role: 'outer', t: 0.46, tier: 2 },
    { team: 'enemy', role: 'outer', t: 0.54, tier: 2 },
    { team: 'enemy', role: 'inner', t: 0.68, tier: 1 },
  ];
  const side = (team: 'ally' | 'enemy') => (team === 'ally' ? 'Blue Encampment' : 'Red Encampment');
  return seats.map((seat) => {
    const at = along(path.lane, seat.t);
    return {
      team: seat.team,
      tier: seat.tier,
      role: seat.role,
      path: path.id,
      x: Math.round(at.x),
      y: Math.round(at.y),
      name: `${side(seat.team)} ${path.name} ${seat.role}`,
    };
  });
}

function beside(lane: { x: number; y: number }[], t: number, side: number): { x: number; y: number } {
  const at = along(lane, t);
  const prev = along(lane, Math.max(0, t - 0.02));
  const next = along(lane, Math.min(1, t + 0.02));
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: at.x + (-dy / mag) * side, y: at.y + (dx / mag) * side };
}

const seals = [north, center, south].flatMap((path) =>
  (['ally', 'enemy'] as const).map((team) => {
    const at = beside(path.lane, team === 'ally' ? 0.1 : 0.9, team === 'ally' ? 120 : -120);
    const side = team === 'ally' ? 'Blue Encampment' : 'Red Encampment';
    return {
      team,
      path: path.id,
      x: Math.round(at.x),
      y: Math.round(at.y),
      name: `${side} ${path.name} Seal`,
    };
  }),
);


export const sanctuary: ActDef = {
  id: 'sanctuary',
  actNumber: 1,
  name: 'Sanctuary',
  subtitle: 'Rogue Encampment, mirrored',
  width: MAP_W,
  height: MAP_H,
  laneWidth: 168,
  jungle: 110,
  plaza: 340,
  shopRadius: 320,
  fountainRadius: 240,
  roam: true,
  // [TEMP] Which side is blue and which is red is not set in the doc (NEEDS JOSEPH).
  towns: { ally: 'Rogue Encampment', enemy: 'Rogue Encampment' },
  victory: 'The Red Worldstone is silent.',
  defeat: 'The Blue Worldstone has fallen.',
  march: 'Minions leave both Worldstones.',
  lane: center.lane,
  paths: [north, center, south],
  seals,
  pits: [
    { id: 'herald', x: 1800, y: 700 },
    { id: 'dragon', x: 2300, y: 1900 },
  ],
  shrines: [
    { x: 1280, y: 1180, kind: 'might' },
    { x: 2480, y: 1500, kind: 'guard' },
    { x: 1760, y: 1760, kind: 'haste' },
    { x: 3180, y: 1500, kind: 'mana' },
  ],
  // Item 15 [DOC]/[JOSEPH]: the 6 wilderness dens are replaced by 4 cave bosses.
  // Coordinates reuse four of the old den spots, which sit off the roadways [TEMP].
  dens: [
    { id: 1, x: 2480, y: 860, unit: 'countess', count: 1, respawn: CAVE_RESPAWN, cave: true },
    { id: 2, x: 900, y: 1500, unit: 'radament', count: 1, respawn: CAVE_RESPAWN, cave: true },
    { id: 3, x: 2920, y: 1680, unit: 'council-member', count: 3, respawn: CAVE_RESPAWN, cave: true },
    { id: 4, x: 1400, y: 2050, unit: 'izual', count: 1, respawn: CAVE_RESPAWN, cave: true },
  ],
  // Mirrored with the roadways (paint only, item 23).
  river: [
    { x: 180, y: 160 },
    { x: 1500, y: 860 },
    { x: 2200, y: 1400 },
    { x: 2900, y: 1940 },
    { x: 4220, y: 2640 },
  ],
  playerBase: {
    name: 'Blue Worldstone',
    x: 520,
    y: 2100,
    hp: 1108,
    ad: 16,
    armor: 20,
    attackRange: 240,
    attackInterval: 1.15,
    radius: 74,
    gold: 280,
    xp: 180,
  },
  enemyBase: {
    // Item 7: mirror of the player base (520, 2100). Combat values copy the player base.
    name: 'Red Worldstone',
    x: 3880,
    y: 700,
    hp: 1108,
    ad: 16,
    armor: 20,
    attackRange: 240,
    attackInterval: 1.15,
    radius: 74,
    gold: 280,
    xp: 180,
  },
  towers: [...laneTowers(north), ...laneTowers(center), ...laneTowers(south)],
  // Doc: "There is a 15 second wait to start. Players are blocked in base until those 15 seconds pass."
  openingWait: 15,
  waves: {
    // Doc: "After the first wave, a new wave spawns every 60 seconds."
    interval: WAVE_INTERVAL,
    rotation: true,
    // Doc: "The first wave of support mobs from each side comes 15 seconds after that." (15 + 15)
    first: 30,
    ally: [{ unit: 'rogue', count: 1 }],
    enemy: [{ unit: 'fallen', count: 1 }],
  },
  theme: {
    decor: 'sanctuary',
    ground: '#141816',
    groundDeep: '#0c0e0d',
    shoulder: '#1c2420',
    road: '#5a4634',
    roadEdge: '#3a2e22',
    ally: '#d4b46a',
    enemy: '#c44536',
    fog: '#1a1214',
  },
};

export const SANCTUARY_PATHS: PathId[] = ['north', 'center', 'south'];
