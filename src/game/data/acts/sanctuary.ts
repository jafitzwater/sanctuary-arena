import monsters from '../d2/monsters-act1.json';
import type { ActDef, PathDef, PathId, TowerSpawn } from './types';

const raven = monsters.find((entry) => entry.monId === 'bloodraven');
if (!raven) throw new Error('Blood Raven missing from MonStats import');

/**
 * Sanctuary. Three paths join the Rogue Encampment to Harrogath.
 * A diagonal river crosses the wilderness and blocks movement off the fords.
 * Each path has an outer tower,
 * an inner tower, and a seal tower. Two guardians stand at each Worldstone.
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
  lane: [
    { x: 980, y: 1960 },
    { x: 1680, y: 1560 },
    { x: 2360, y: 1240 },
    { x: 3040, y: 940 },
    { x: 3560, y: 760 },
  ],
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
  lane: [
    { x: 1100, y: 2280 },
    { x: 1900, y: 2480 },
    { x: 2780, y: 2260 },
    { x: 3400, y: 1680 },
    { x: 3680, y: 1040 },
  ],
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
  const seats: { team: 'ally' | 'enemy'; role: 'seal' | 'inner' | 'outer'; t: number; tier: 1 | 2 }[] = [
    { team: 'ally', role: 'seal', t: 0.2, tier: 1 },
    { team: 'ally', role: 'inner', t: 0.34, tier: 1 },
    { team: 'ally', role: 'outer', t: 0.48, tier: 2 },
    { team: 'enemy', role: 'outer', t: 0.56, tier: 2 },
    { team: 'enemy', role: 'inner', t: 0.7, tier: 1 },
    { team: 'enemy', role: 'seal', t: 0.84, tier: 1 },
  ];
  const side = (team: 'ally' | 'enemy') => (team === 'ally' ? 'Encampment' : 'Harrogath');
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
    const at = beside(path.lane, team === 'ally' ? 0.12 : 0.9, team === 'ally' ? 120 : -120);
    const side = team === 'ally' ? 'Encampment' : 'Harrogath';
    return {
      team,
      path: path.id,
      x: Math.round(at.x),
      y: Math.round(at.y),
      name: `${side} ${path.name} Seal`,
    };
  }),
);

const guardians: TowerSpawn[] = [
  { team: 'ally', tier: 3, role: 'guardian', x: 400, y: 1960, name: 'Encampment Guardian' },
  { team: 'ally', tier: 3, role: 'guardian', x: 760, y: 2280, name: 'Encampment Warden' },
  { team: 'enemy', tier: 3, role: 'guardian', x: 4000, y: 480, name: 'Harrogath Guardian' },
  { team: 'enemy', tier: 3, role: 'guardian', x: 3640, y: 860, name: 'Harrogath Warden' },
];

export const sanctuary: ActDef = {
  id: 'sanctuary',
  actNumber: 1,
  name: 'Sanctuary',
  subtitle: 'Rogue Encampment to Harrogath',
  width: 4400,
  height: 2800,
  laneWidth: 168,
  jungle: 110,
  plaza: 340,
  shopRadius: 320,
  fountainRadius: 240,
  roam: true,
  towns: { ally: 'Rogue Encampment', enemy: 'Harrogath' },
  victory: 'The Harrogath Worldstone is silent.',
  defeat: 'The Encampment Worldstone has fallen.',
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
  dens: [
    { id: 1, x: 1680, y: 160, unit: 'fallen', count: 3, respawn: 22, unique: 'Bishibosh' },
    { id: 2, x: 2480, y: 860, unit: 'skeleton', count: 3, respawn: 22 },
    { id: 3, x: 900, y: 1500, unit: 'quillrat', count: 3, respawn: 22 },
    { id: 4, x: 2060, y: 1960, unit: 'hungry-dead', count: 2, respawn: 24 },
    { id: 5, x: 2920, y: 1680, unit: 'goatman', count: 2, respawn: 24, boss: 'Rakanishu' },
    { id: 6, x: 1400, y: 2050, unit: 'mummy', count: 2, respawn: 26 },
  ],
  river: [
    { x: 180, y: 160 },
    { x: 1500, y: 860 },
    { x: 2500, y: 1560 },
    { x: 4220, y: 2640 },
  ],
  playerBase: {
    name: 'Encampment Worldstone',
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
    name: 'Harrogath Worldstone',
    x: 3880,
    y: 620,
    hp: 1108,
    ad: 18,
    armor: 20,
    attackRange: 250,
    attackInterval: 1.1,
    radius: 74,
    gold: 280,
    xp: 180,
  },
  towers: [...laneTowers(north), ...laneTowers(center), ...laneTowers(south), ...guardians],
  // Doc: "There is a 15 second wait to start. Players are blocked in base until those 15 seconds pass."
  openingWait: 15,
  waves: {
    interval: 22,
    // Doc: "The first wave of support mobs from each side comes 15 seconds after that." (15 + 15)
    first: 30,
    ally: [{ unit: 'rogue', count: 1 }],
    enemy: [{ unit: 'fallen', count: 1 }],
  },
  enemyChampion: {
    name: 'Blood Raven',
    title: 'The Corrupted Sister',
    hp: 298,
    ad: 13,
    armor: raven.moba.armor,
    moveSpeed: 93,
    attackRange: raven.moba.attackRange,
    attackInterval: raven.moba.attackInterval,
    projectileSpeed: raven.moba.projectileSpeed,
    radius: 20,
    gold: raven.moba.gold,
    xp: raven.moba.xp,
    color: '#6e2430',
    accent: '#e0c07a',
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
