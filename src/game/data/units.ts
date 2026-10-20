export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  attackRange: number;
  attackInterval: number;
  radius: number;
  gold: number;
  xp: number;
  ranged: boolean;
  projectileSpeed: number;
  aggro: number;
  color: string;
  accent: string;
}

/**
 * Lane creeps and Act I monsters. Acts reference these ids from their wave
 * tables. Add a new monster here, point a wave at it, and give it a sprite
 * in render.ts — the spawner stays the same.
 */
export const UNIT_DEFS: Record<string, UnitDef> = {
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    hp: 340,
    ad: 22,
    armor: 4,
    moveSpeed: 102,
    attackRange: 52,
    attackInterval: 1.02,
    radius: 15,
    gold: 24,
    xp: 30,
    ranged: false,
    projectileSpeed: 0,
    aggro: 200,
    color: '#3e5e78',
    accent: '#d4b46a',
  },
  'rogue-archer': {
    id: 'rogue-archer',
    name: 'Rogue Archer',
    hp: 240,
    ad: 20,
    armor: 2,
    moveSpeed: 98,
    attackRange: 200,
    attackInterval: 1.22,
    radius: 15,
    gold: 22,
    xp: 28,
    ranged: true,
    projectileSpeed: 460,
    aggro: 230,
    color: '#35506a',
    accent: '#e6d3a1',
  },
  fallen: {
    id: 'fallen',
    name: 'Fallen',
    hp: 270,
    ad: 20,
    armor: 2,
    moveSpeed: 118,
    attackRange: 48,
    attackInterval: 0.92,
    radius: 14,
    gold: 28,
    xp: 34,
    ranged: false,
    projectileSpeed: 0,
    aggro: 210,
    color: '#8d1d24',
    accent: '#e07a3a',
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    hp: 560,
    ad: 32,
    armor: 8,
    moveSpeed: 70,
    attackRange: 50,
    attackInterval: 1.32,
    radius: 18,
    gold: 36,
    xp: 46,
    ranged: false,
    projectileSpeed: 0,
    aggro: 190,
    color: '#5d7a52',
    accent: '#b7d4a8',
  },
};

export function unitDef(id: string): UnitDef {
  const def = UNIT_DEFS[id];
  if (!def) throw new Error(`Unknown unit "${id}"`);
  return def;
}
