import { WAVE_INTERVAL } from '../waves';
import { CAVE_RESPAWN } from '../caves';
import type { ActDef, PathDef, PathId, TowerSpawn } from './types';
import { MAP_SCALE, scaleAct } from '../mapScale';


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

/**
 * ORDER "Map size and Diablo 2 theme from reference" item 1 [JOSEPH]: "playable map 12,000 x 12,000 units (square).
 * Nexus-to-Nexus about 15,000-16,000 (diagonal path length along lane)." Item 2: layout from map-reference.png -
 * Blue base bottom-left, Red base top-right, top lane up the left edge then along the top edge, bottom lane along the
 * bottom edge then up the right edge, mid lane on the diagonal, the (lava) river crossing it from top-left to
 * bottom-right. Counts and combat values are the pre-order ones; only coordinates moved. Was 4400 x 2800.
 */
export const MAP_W = 12000;
export const MAP_H = 12000;

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
  // Map 12k item 2: up the left edge, round the top-left corner, along the top edge (reference "Top Lane").
  // The first and last points keep the old offsets from each base (+260,-340 / -260,+120) and the first 400 units
  // leave the camp in the old directions, so the camp gate and palisade are the same 6-tile slot as before.
  lane: [
    { x: 910, y: 11010 },
    { x: 830, y: 10620 },
    { x: 900, y: 9000 },
    { x: 880, y: 5000 },
    { x: 900, y: 2400 },
    { x: 1150, y: 1500 },
    { x: 1500, y: 1150 },
    { x: 2400, y: 900 },
    { x: 5000, y: 880 },
    { x: 9000, y: 900 },
    { x: 10754, y: 553 },
    { x: 11090, y: 770 },
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
  // Map 12k item 2: the straight diagonal of the reference "Mid Lane" (first point keeps the old +390,-100 mouth offset after symmetric()).
  lane: symmetric([
    { x: 1040, y: 11250 },
    { x: 1401, y: 11078 },
    { x: 6000, y: 6000 },
    { x: 10599, y: 922 },
    { x: 10960, y: 750 },
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

/**
 * t315u (9,000 map): a seal stands this far (world units, as played) beside its lane centre. The seal's footprint
 * does not scale with the map, so the offset is held at 120 played units instead of shrinking to 90 (which would
 * put the seal 13 units onto the narrower road).
 */
const SEAL_SIDE = 120 / MAP_SCALE;

const seals = [north, center, south].flatMap((path) =>
  (['ally', 'enemy'] as const).map((team) => {
    const at = beside(path.lane, team === 'ally' ? 0.1 : 0.9, team === 'ally' ? SEAL_SIDE : -SEAL_SIDE);
    const side = team === 'ally' ? 'Blue Encampment' : 'Red Encampment';
    return {
      team,
      path: path.id,
      x: at.x,
      y: at.y,
      name: `${side} ${path.name} Seal`,
    };
  }),
);


/** The map as designed (scale 1). The game uses `sanctuary`, which is this times MAP_SCALE. */
export const SANCTUARY_DESIGN: ActDef = {
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
  // Map 12k item 2: herald above the river on the top side, dragon below it on the bottom side (as before), mirrored.
  pits: [
    { id: 'herald', x: 4300, y: 3200 },
    { id: 'dragon', x: 7700, y: 8800 },
  ],
  // Map 12k item 2: same 4 shrines, each kept in the same jungle quarter it stood in before
  // (might: left, guard: right, haste: bottom, mana: right).
  shrines: [
    { x: 2800, y: 6400, kind: 'might' },
    { x: 8800, y: 4200, kind: 'guard' },
    { x: 6000, y: 9400, kind: 'haste' },
    { x: 9200, y: 5600, kind: 'mana' },
  ],
  // Item 15 [DOC]/[JOSEPH]: the 6 wilderness dens are replaced by 4 cave bosses.
  // Pass 3 order item 2 [TEMP]: caves moved deep into the open middle jungle, clear of every
  // tower's range (+60) and the roads, as two mirrored pairs (W - x, H - y).
  // Map 12k item 2: same two mirrored pairs in the same quarters as before (Countess + Radament in the left
  // jungle, Council + Izual in the right jungle), deep in the jungle, far outside every tower's range.
  dens: [
    { id: 1, x: 3200, y: 5600, unit: 'countess', count: 1, respawn: CAVE_RESPAWN, cave: true },
    { id: 2, x: 2200, y: 7600, unit: 'radament', count: 1, respawn: CAVE_RESPAWN, cave: true },
    { id: 3, x: 9800, y: 4400, unit: 'council-member', count: 3, respawn: CAVE_RESPAWN, cave: true },
    { id: 4, x: 8800, y: 6400, unit: 'izual', count: 1, respawn: CAVE_RESPAWN, cave: true },
  ],
  // Mirrored with the roadways (paint only, item 23). Map 12k item 3: drawn as one continuous lava river,
  // top-left corner to bottom-right corner across the mid lane, as in the reference.
  river: [
    { x: 1600, y: 1600 },
    { x: 3200, y: 2300 },
    { x: 4800, y: 4600 },
    { x: 6000, y: 6000 },
    { x: 7200, y: 7400 },
    { x: 8800, y: 9700 },
    { x: 10400, y: 10400 },
  ],
  playerBase: {
    name: 'Blue Worldstone',
    // Map 12k: bottom-left corner of the reference (was 520, 2100 on the 4400 x 2800 map).
    x: 650,
    y: 11350,
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
    // Item 7: mirror of the player base (650, 11350). Combat values copy the player base.
    name: 'Red Worldstone',
    x: 11350,
    y: 650,
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

/**
 * Wild Rift pass 2, item 1 [JOSEPH]: one global MAP_SCALE (0.75 [TEMP]) shrinks the physical map; layout,
 * proportions and gameplay values are unchanged (data/mapScale.ts).
 */
export const sanctuary: ActDef = scaleAct(SANCTUARY_DESIGN, MAP_SCALE);

export const SANCTUARY_PATHS: PathId[] = ['north', 'center', 'south'];
