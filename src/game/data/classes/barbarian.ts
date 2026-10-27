import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';

const row = classes.find((entry) => entry.id === 'barbarian');
if (!row) throw new Error('Barbarian missing from CharStats import');

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
 * Gap-list items 11 and 12 (kits-final.md, Barbarian).
 * Doc: "One path. Top tier skill is whirlwind. In order: bash, shout, leap attack, battle orders, whirlwind."
 * Doc: "Skills unlock at level 1, level 3, level 5, and level 7. More than 4 skills use the remaining points after level 7."
 * Doc: "Skills max at level 5." -> maxRank 5.
 * Whirlwind's unlock level is not set by the doc ("after level 7"); the repo's existing 10 is kept (NEEDS JOSEPH).
 * Skill effects and cooldowns are unset in the doc ([U]); the repo's existing handlers are kept.
 */
const skillList: SkillDef[] = [
  skill({
    id: 'bash',
    name: 'Bash',
    short: 'Bash',
    unlockLevel: 1,
    mana: 8,
    manaPerRank: 2,
    cooldown: 5,
    starter: true,
    row: 1,
    d2Id: 126,
    description: 'A heavy blow. Rank 1 deals 150% of a basic hit, and each rank adds 15%.',
  }),
  skill({
    id: 'shout',
    name: 'Shout',
    short: 'Shout',
    unlockLevel: 3,
    mana: 12,
    manaPerRank: 0,
    cooldown: 14,
    row: 2,
    d2Id: 138,
    anim: 'S1',
    description: 'Raises your defense and nearby allies for 6 seconds. +10 armor, then +6 per rank.',
  }),
  skill({
    id: 'leap-attack',
    name: 'Leap Attack',
    short: 'Leap',
    unlockLevel: 5,
    mana: 14,
    manaPerRank: 2,
    cooldown: 9,
    row: 3,
    d2Id: 132,
    description: 'Jump to the aim point and strike on landing. Rank 1 deals 135% damage, and each rank adds 15%.',
  }),
  skill({
    id: 'battle-orders',
    name: 'Battle Orders',
    short: 'Orders',
    unlockLevel: 7,
    mana: 18,
    manaPerRank: 0,
    cooldown: 16,
    row: 4,
    d2Id: 149,
    anim: 'S1',
    description: 'Raises maximum life by 6% per rank for 8 seconds.',
  }),
  skill({
    id: 'whirlwind',
    name: 'Whirlwind',
    short: 'Whirl',
    unlockLevel: 10,
    mana: 22,
    manaPerRank: 4,
    cooldown: 11,
    row: 5,
    d2Id: 152,
    description: 'Spin and hit everyone nearby. Each hit is 32% of attack damage at rank 1 and rises by 4% per rank.',
  }),
];

/**
 * Joystick sectors are 45° wide: 0 east, then SE, S, SW, W, NW, N, NE.
 * The facing row stays put until the stick is 15° past that sector's edge.
 */
export const HERO_FACING_DEADBAND = (15 * Math.PI) / 180;

/**
 * Screen-space stick magnitude, 0 at rest and 1 at the edge of the well.
 * Below idle the hero stands. Through the run tilt the hero walks.
 * Above it the hero runs, after the gait hold.
 */
export const STICK_IDLE_TILT = 0.15;
export const STICK_RUN_TILT = 0.6;
/** Walk and run trade places only after the tilt stays across the run line this long. */
export const STICK_GAIT_HOLD_MS = 150;

/**
 * Stats and the 30-skill tree are the 1.13c CharStats / Skills rows, scaled
 * in tools/import-d2.mjs. Q W E R are belt slots, not fixed skills.
 */
export const barbarian: ClassDef = {
  id: 'barbarian',
  name: 'Barbarian',
  title: 'Warrior of Mount Arreat',
  role: 'melee',
  blurb:
    'Bash, Shout, Leap Attack, Battle Orders, and Whirlwind. Four of them sit on Q W E R. Press T to spend points and swap skills.',
  token: row.token || 'BA',
  startingBelt: ['bash', '', '', ''],
  stats: {
    // Life is the low hundreds, closer to a Diablo II Barbarian than the old 780.
    // Damage elsewhere is scaled by the same 240/780 ratio so fights last about as long.
    hp: 240,
    mana: moba.mana,
    ad: 15,
    armor: moba.baseArmor,
    moveSpeed: 216,
    attackRange: 74,
    attackInterval: 0.78,
    radius: 22,
    hpPerLevel: 4,
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: 0.8,
    regenMana: moba.regenMana,
    str: moba.str,
    dex: moba.dex,
    vit: moba.vit,
    energy: moba.energy,
    hpPerVit: 4,
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    adPerStr: 0.15,
    armorPerDex: moba.armorPerDex,
    walkSpeed: 144,
    runSpeed: 216,
  },
  skills: skillList,
  colors: {
    cloth: '#6e2a22',
    skin: '#c48a62',
    metal: '#d5dbe4',
    fur: '#8a5a32',
    horn: '#f0e2bc',
  },
};
