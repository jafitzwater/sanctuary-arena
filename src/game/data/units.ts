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
 * (240/780) so they match the Barbarian's new life. Speeds stay under the
 * hero's run of 120.
 */
const ROGUE: UnitDef = {
    id: 'rogue',
    name: 'Rogue',
    hp: 105,
    ad: 7,
    armor: 4,
    moveSpeed: 57,
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
};

function caveBoss(id: string, name: string, hp: number): UnitDef {
  return {
    id,
    name,
    hp,
    ad: 33,
    armor: 6,
    moveSpeed: 60,
    attackRange: 56,
    attackInterval: 1,
    radius: 20,
    gold: 136,
    xp: 126,
    ranged: false,
    projectileSpeed: 0,
    aggro: 210,
    color: '#5a2a3a',
    accent: '#e0b070',
  };
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  rogue: ROGUE,
  'rogue-archer': {
    id: 'rogue-archer',
    name: 'Rogue Archer',
    hp: 74,
    ad: 6,
    armor: 2,
    moveSpeed: 54,
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
  // Items 2/6 wave mobs, batch 4. Source [JOSEPH] (joseph-answers-oct27.md, answer 5).
  // UnitDef has one damage number, so a damage range uses its midpoint [DERIVED].
  // Not implemented (NEEDS JOSEPH, no values given): every aura, Act 3 spell damage.
  // Fields Joseph did not set (armor, speed, range, gold, xp...) stay the Rogue's [TEMP].
  // [JOSEPH] "Valkyrie 120HP 15-25 dmg +defense aura." -> hp 120, ad 20 (midpoint).
  valkyrie: { ...ROGUE, id: 'valkyrie', name: 'Valkyrie', hp: 120, ad: 20 },
  // [JOSEPH] "Act2 merc 100HP 20-30 dmg poison/cold aura." -> hp 100, ad 25 (midpoint).
  'act2-mercenary': { ...ROGUE, id: 'act2-mercenary', name: 'Act 2 Mercenary', hp: 100, ad: 25 },
  // [JOSEPH] "Act3 merc 90HP low melee, strong spell dmg, lightning/fire aura." -> hp 90.
  // "low melee" has no number, so it keeps the Rogue's ad 7 [TEMP].
  'act3-mercenary': { ...ROGUE, id: 'act3-mercenary', name: 'Act 3 Mercenary', hp: 90 },
  // Item 15 cave bosses, batch 4. [JOSEPH] (joseph-answers-oct27.md, answer 2).
  // Countess "HP800 dmg25-40" -> ad 33 (midpoint, [DERIVED]). Radament "HP1200", Council
  // "3x ~1000HP", Izual "HP2000". Their damage is not given: ad 33 copies the Countess [TEMP].
  // Other fields copy the repo's den-boss values (Rakanishu: goatman x4 gold, x3 xp) [TEMP].
  countess: { ...caveBoss('countess', 'The Countess', 800), ad: 33 },
  radament: caveBoss('radament', 'Radament', 1200),
  'council-member': caveBoss('council-member', 'Council Member', 1000),
  izual: caveBoss('izual', 'Izual', 2000),
  fallen: { ...fromMon('fallen'), hp: 76, ad: 6, moveSpeed: 66 },
  zombie: { ...fromMon('zombie'), hp: 174, ad: 7, moveSpeed: 34 },
  quillrat: { ...fromMon('quillrat'), hp: 94, ad: 6, moveSpeed: 50 },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    hp: 88,
    ad: 7,
    armor: 4,
    moveSpeed: 56,
    attackRange: 46,
    attackInterval: 1.05,
    radius: 14,
    gold: 26,
    xp: 32,
    ranged: false,
    projectileSpeed: 0,
    aggro: 200,
    color: '#d9d3c4',
    accent: '#8a8478',
  },
  'hungry-dead': {
    id: 'hungry-dead',
    name: 'Hungry Dead',
    hp: 150,
    ad: 8,
    armor: 6,
    moveSpeed: 39,
    attackRange: 48,
    attackInterval: 1.15,
    radius: 18,
    gold: 32,
    xp: 40,
    ranged: false,
    projectileSpeed: 0,
    aggro: 180,
    color: '#6a8f62',
    accent: '#c6d6b0',
  },
  goatman: {
    id: 'goatman',
    name: 'Goatman',
    hp: 120,
    ad: 9,
    armor: 6,
    moveSpeed: 60,
    attackRange: 50,
    attackInterval: 1,
    radius: 16,
    gold: 34,
    xp: 42,
    ranged: false,
    projectileSpeed: 0,
    aggro: 210,
    color: '#7a3b28',
    accent: '#e0b070',
  },
  willowisp: {
    id: 'willowisp',
    name: 'Willowisp',
    hp: 70,
    ad: 8,
    armor: 0,
    moveSpeed: 72,
    attackRange: 180,
    attackInterval: 1.2,
    radius: 12,
    gold: 30,
    xp: 36,
    ranged: true,
    projectileSpeed: 420,
    aggro: 220,
    color: '#7ec8c4',
    accent: '#e8fff8',
  },
  mummy: {
    id: 'mummy',
    name: 'Greater Mummy',
    hp: 200,
    ad: 10,
    armor: 12,
    moveSpeed: 36,
    attackRange: 52,
    attackInterval: 1.25,
    radius: 18,
    gold: 40,
    xp: 48,
    ranged: false,
    projectileSpeed: 0,
    aggro: 190,
    color: '#c2ad78',
    accent: '#efe2b0',
  },
  demon: {
    id: 'demon',
    name: 'Demon',
    hp: 160,
    ad: 12,
    armor: 8,
    moveSpeed: 62,
    attackRange: 52,
    attackInterval: 1.05,
    radius: 17,
    gold: 44,
    xp: 52,
    ranged: false,
    projectileSpeed: 0,
    aggro: 230,
    color: '#8a1c28',
    accent: '#ffb070',
  },
};

export function unitDef(id: string): UnitDef {
  const def = UNIT_DEFS[id];
  if (!def) throw new Error(`Unknown unit "${id}"`);
  return def;
}
