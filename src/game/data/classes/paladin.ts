import { BASE_MS } from '../moveSpeed';
import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';
import { STARTING_STATS } from './startingStats';
import { barbarian } from './barbarian';

const row = classes.find((entry) => entry.id === 'paladin');
if (!row) throw new Error('Paladin missing from CharStats import');

const moba = row.moba;

function skill(partial: Pick<SkillDef, 'id' | 'name' | 'short' | 'unlockLevel' | 'mana' | 'manaPerRank' | 'cooldown' | 'description' | 'row'> & Partial<SkillDef>): SkillDef {
  return {
    key: '',
    digit: '',
    minMana: 0,
    maxRank: 5,
    reqLevel: partial.unlockLevel,
    tab: 1,
    tabName: 'Skills',
    col: 1,
    passive: false,
    prereqs: [],
    anim: 'A1',
    param1: 0,
    param2: 0,
    srcDam: 0,
    starter: false,
    d2Id: 0,
    ...partial,
  };
}

/**
 * ORDER "Make Paladin playable" (kits-final.md, Paladin).
 * Doc: "One path. In order: zeal, smite, charge, holy shield. Battle hammers is the top tier skill."
 * Doc: Path restriction: one path only -> one path, five skills (same shape as the Barbarian) [DOC].
 * Doc: "Skills unlock at level 1, level 3, level 5, and level 7. More than 4 skills use the remaining
 * points after level 7." -> zeal 1, smite 3, charge 5, holy shield 7 [DOC].
 * [TEMP] NEEDS JOSEPH Battle hammers: the doc only says "after level 7"; the Barbarian's top-tier
 * Whirlwind uses level 10, so Battle Hammers uses 10 too (NEEDS JOSEPH).
 * Doc: "Skills max at level 5." -> maxRank 5 [DOC]. Mana cost is the shared % rule (combat.manaCost) [DOC].
 * [TEMP] Cooldowns and effects are unset in the doc ([U]); the handlers in skills/paladin.ts use existing
 * mechanics (melee hit, stun, leap, armor buff, area damage) with fixed placeholder numbers.
 * `mana`/`manaPerRank` mirror the Barbarian's fields and are not used by the % mana rule.
 */
const skillList: SkillDef[] = [
  skill({
    id: 'zeal',
    name: 'Zeal',
    short: 'Zeal',
    unlockLevel: 1,
    mana: 8,
    manaPerRank: 2,
    cooldown: 5, // [TEMP]
    starter: true,
    row: 1,
    d2Id: 106,
    description: 'Three quick blows at one foe. Each deals 50% of a basic hit, and each rank adds 5%.',
  }),
  skill({
    id: 'smite',
    name: 'Smite',
    short: 'Smite',
    unlockLevel: 3,
    mana: 12,
    manaPerRank: 2,
    cooldown: 8, // [TEMP]
    row: 2,
    d2Id: 97,
    description: 'A shield blow that stuns one foe for 0.8 s. Rank 1 deals 110% of a basic hit, and each rank adds 10%.',
  }),
  skill({
    id: 'charge',
    name: 'Charge',
    short: 'Charge',
    unlockLevel: 5,
    mana: 14,
    manaPerRank: 2,
    cooldown: 10, // [TEMP]
    row: 3,
    d2Id: 107,
    description: 'Rush to a foe and strike on arrival, like Leap Attack. Rank 1 deals 135% damage, and each rank adds 15%.',
  }),
  skill({
    id: 'holy-shield',
    name: 'Holy Shield',
    short: 'Shield',
    unlockLevel: 7,
    mana: 18,
    manaPerRank: 0,
    cooldown: 16, // [TEMP]
    row: 4,
    d2Id: 117,
    anim: 'S1',
    description: 'Raises your own defense for 8 seconds. +15 armor, then +5 per rank.',
  }),
  skill({
    id: 'battle-hammers',
    name: 'Battle Hammers',
    short: 'Hammer',
    // Economy order [JOSEPH]: top-tier skill unlocks at 5, ranks at 9 and 13 (was unlockLevel 10, 5 ranks).
    unlockLevel: 5,
    maxRank: 3,
    rankLevels: [5, 9, 13],
    mana: 22,
    manaPerRank: 4,
    cooldown: 11, // [TEMP]
    row: 5,
    d2Id: 112,
    anim: 'S1',
    description: 'Hammers strike every foe nearby. Rank 1 deals 80% of a basic hit to each, and each rank adds 10%.',
  }),
];

/** [TEMP] Life scale the Barbarian uses (240 match life for the 780 CharStats life), applied to the Paladin's 630. */
const LIFE_SCALE = barbarian.stats.hp / 780;

export const paladin: ClassDef = {
  id: 'paladin',
  name: 'Paladin',
  title: 'Champion of the Light',
  // [TEMP] Zeal/Smite/Charge are melee skills -> melee basic attacks.
  role: 'melee',
  blurb:
    'Zeal, Smite, Charge, Holy Shield, and Battle Hammers. Skills learn themselves at levels 1, 3, 5, 7 and 10. Press T to spend extra points.',
  token: row.token || 'PA',
  startingBelt: ['zeal', '', '', ''],
  stats: {
    hp: Math.round(moba.life * LIFE_SCALE), // [TEMP] 630 * 240/780 = 194
    mana: moba.mana, // CharStats import, as the Barbarian
    ad: 15, // [TEMP] same as the Barbarian
    armor: moba.baseArmor,
    // [JOSEPH] movement-speed-spec.md: "Paladin 335"; 335 * UNIT_SCALE (144/345) ≈ 139.8 px/s.
    moveSpeed: BASE_MS.paladin,
    attackRange: 74, // [TEMP] same as the Barbarian (melee)
    attackInterval: 0.78, // [TEMP] same as the Barbarian
    radius: 22,
    hpPerLevel: 4, // [TEMP] same as the Barbarian
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: 0.8, // [TEMP] same as the Barbarian
    regenMana: moba.regenMana,
    // [JOSEPH] "Paladin 25/20/25/15" (joseph-answers-oct27.md, answer 6).
    str: STARTING_STATS.paladin.str,
    dex: STARTING_STATS.paladin.dex,
    vit: STARTING_STATS.paladin.vit,
    energy: STARTING_STATS.paladin.energy,
    hpPerVit: 3, // [TEMP] Barbarian 4 scaled by CharStats life per vitality 12/16 fourths
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    // [DOC] "Strength adds to attack power for melee only." The repo's flat 0.15 AD per strength is kept [TEMP].
    adPerStr: 0.15,
    armorPerDex: moba.armorPerDex,
  },
  skills: skillList,
  colors: {
    cloth: '#2f4a7a',
    skin: '#c8956c',
    metal: '#e2d6a8',
    fur: '#6a5030',
    horn: '#f2e8c8',
  },
};
