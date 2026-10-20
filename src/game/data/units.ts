import monsters from './d2/monsters-act1.json';

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

const LOOK: Record<string, { name?: string; radius: number; aggro: number; color: string; accent: string }> = {
  fallen: { radius: 14, aggro: 210, color: '#8d1d24', accent: '#e07a3a' },
  zombie: { radius: 18, aggro: 190, color: '#5d7a52', accent: '#b7d4a8' },
  quillrat: { name: 'Quill Rat', radius: 15, aggro: 230, color: '#6b5344', accent: '#d2c2a4' },
};

function fromMon(id: string): UnitDef {
  const row = monsters.find((entry) => entry.id === id);
  if (!row) throw new Error(`Missing MonStats row ${id}`);
  const look = LOOK[id];
  return {
    id,
    name: look?.name ?? row.name,
    hp: row.moba.hp,
    ad: row.moba.ad,
    armor: row.moba.armor,
    moveSpeed: row.moba.moveSpeed,
    attackRange: row.moba.attackRange,
    attackInterval: row.moba.attackInterval,
    radius: look?.radius ?? 16,
    gold: row.moba.gold,
    xp: row.moba.xp,
    ranged: row.moba.ranged,
    projectileSpeed: row.moba.projectileSpeed,
    aggro: look?.aggro ?? 200,
    color: look?.color ?? '#888',
    accent: look?.accent ?? '#fff',
  };
}

/**
 * Lane creeps and Act I monsters. Fallen, Zombie, and Quill Rat shapes come
 * from MonStats. Life and damage are about 31% of the old skirmish figures
 * (240/780) so they match the Barbarian's new life. Speeds stay slower than
 * the hero's run of 216.
 */
export const UNIT_DEFS: Record<string, UnitDef> = {
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    hp: 105,
    ad: 7,
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
    hp: 74,
    ad: 6,
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
  fallen: { ...fromMon('fallen'), hp: 76, ad: 6 },
  zombie: { ...fromMon('zombie'), hp: 174, ad: 7 },
  quillrat: { ...fromMon('quillrat'), hp: 94, ad: 6 },
};

export function unitDef(id: string): UnitDef {
  const def = UNIT_DEFS[id];
  if (!def) throw new Error(`Unknown unit "${id}"`);
  return def;
}
