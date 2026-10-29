import { BASE_MS } from '../moveSpeed';
import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';
import { STARTING_STATS } from './startingStats';
import { barbarian } from './barbarian';

const row = classes.find((entry) => entry.id === 'sorceress');
if (!row) throw new Error('Sorceress missing from CharStats import');

const moba = row.moba;

/**
 * [DOC][P] kits-final.md / design doc: "For the sorceress and the necromancer, once energy reaches 10,
 * that step drops from 5% to 2%. 10 energy is the placeholder." The Sorceress starts at 35 energy
 * ([JOSEPH] answer 6) and energy never drops, so her step is always 2%: 10/12/14/16/18% (kits-final
 * table "Energy 10 or more"). Read by combat.manaPct via SkillDef.manaStep.
 */
export const SORC_ENERGY_STEP_AT = 10;
export const SORC_MANA_STEP = 0.02;

function skill(partial: Pick<SkillDef, 'id' | 'name' | 'short' | 'unlockLevel' | 'mana' | 'manaPerRank' | 'cooldown' | 'description' | 'row'> & Partial<SkillDef>): SkillDef {
  return {
    key: '',
    digit: '',
    minMana: 0,
    maxRank: 3, // Skill rework order [JOSEPH]: all skills max rank 3.
    reqLevel: partial.unlockLevel,
    tab: 1,
    tabName: 'Skills',
    col: 1,
    passive: false,
    prereqs: [],
    anim: 'S1',
    param1: 0,
    param2: 0,
    srcDam: 0,
    starter: false,
    d2Id: 0,
    manaStep: SORC_MANA_STEP,
    ...partial,
  };
}

/**
 * ORDER "Skill rework (no paths)" (2026-10-29) item 2 [JOSEPH]: one flat list, in this order:
 * "Frost Bolt (L1), Lightning (L3), Teleport (L5), Fire Blast (L7), Blizzard (L9)".
 * Frost Bolt is the existing Ice Bolt (id 'ice-bolt' kept, display renamed) and Blizzard reuses its
 * handler. Lightning and Fire Blast are new [TEMP] placeholders in the same style (skills/sorceress.ts).
 * Frozen Nova and Frozen Orb are not in the list and were deleted (data and handlers).
 * Teleport moves from the top tier (unlock 5, ranks 5/9/13) to a normal L5 skill; Blizzard (was L5) is
 * the top tier at L9. All skills max rank 3 [JOSEPH]; mana cost is the % rule with the 2% step [DOC][P].
 * [TEMP] Cooldowns and effects are unset in the doc ([U]); handlers use existing mechanics.
 * `mana`/`manaPerRank` mirror the Barbarian's fields and are not used by the % mana rule.
 */
const skillList: SkillDef[] = [
  skill({
    id: 'ice-bolt',
    name: 'Frost Bolt', // [JOSEPH] display name; id kept
    short: 'Frost',
    unlockLevel: 1,
    mana: 8,
    manaPerRank: 2,
    cooldown: 4, // [TEMP]
    starter: true,
    row: 1,
    d2Id: 39,
    description: 'A bolt of frost at one foe that slows it 25% for 1.5 s. Rank 1 deals 110% of a basic hit, and each rank adds 10%.',
  }),
  skill({
    id: 'lightning',
    name: 'Lightning',
    short: 'Light',
    unlockLevel: 3, // [JOSEPH]
    mana: 12,
    manaPerRank: 2,
    cooldown: 7, // [TEMP] skill follow-ups balance band
    row: 2,
    d2Id: 49,
    description: 'A lightning strike hits one foe at once. Rank 1 deals 130% of a basic hit, and each rank adds 13%.', // [TEMP]
  }),
  skill({
    id: 'teleport',
    name: 'Teleport',
    short: 'Tele',
    unlockLevel: 5, // [JOSEPH]
    mana: 22,
    manaPerRank: 0,
    cooldown: 12, // [TEMP]
    row: 3,
    d2Id: 54,
    description: 'Instantly move to a chosen spot up to 260 away, plus 20 per rank.',
  }),
  skill({
    id: 'fire-blast',
    name: 'Fire Blast',
    short: 'Fire',
    unlockLevel: 7, // [JOSEPH]
    mana: 18, // [TEMP] mirror field, as the other level-7 skills (cost is the % rule)
    manaPerRank: 2,
    cooldown: 11, // [TEMP] skill follow-ups balance band
    row: 4,
    d2Id: 36,
    description: 'Fire bursts on one foe and burns every foe around it. Rank 1 deals 140% of a basic hit, and each rank adds 15%.', // [TEMP]
  }),
  skill({
    id: 'blizzard',
    name: 'Blizzard',
    short: 'Blizz',
    unlockLevel: 9, // [JOSEPH] top tier (was 5)
    topTier: true,
    mana: 14,
    manaPerRank: 2,
    cooldown: 12, // [TEMP]
    row: 5,
    d2Id: 59,
    description: 'Ice falls on a chosen spot, hitting every foe there and slowing them 35% for 2 s. Rank 1 deals 120% of a basic hit, and each rank adds 15%.',
  }),
];

/** [TEMP] Life scale the Barbarian uses (240 match life for the 780 CharStats life), applied to the Sorceress's 300. */
const LIFE_SCALE = barbarian.stats.hp / 780;

export const sorceress: ClassDef = {
  id: 'sorceress',
  name: 'Sorceress',
  title: 'Zann Esu Sorceress',
  // [TEMP] NEEDS JOSEPH: the doc does not say how the Sorceress basic-attacks. She uses the existing
  // projectile basic attack (as the Amazon), so 'ranged' in the sim.
  role: 'ranged',
  blurb:
    'Frost Bolt, Lightning, Teleport, Fire Blast, and Blizzard. Skills learn themselves at levels 1, 3, 5, 7 and 9. Press T to spend extra points.',
  token: row.token || 'SO',
  startingBelt: ['ice-bolt', '', '', ''],
  stats: {
    hp: Math.round(moba.life * LIFE_SCALE), // [TEMP] 300 * 240/780 = 92
    mana: moba.mana, // CharStats import, as the Barbarian
    ad: 15, // [TEMP] same as the Barbarian
    armor: moba.baseArmor,
    // [JOSEPH] movement-speed-spec.md: "Sorceress 325"; 325 * UNIT_SCALE (1.0) = 325 px/s.
    moveSpeed: BASE_MS.sorceress,
    attackRange: 200, // [TEMP] same as the Amazon bow range
    attackInterval: 0.78, // [TEMP] same as the Barbarian
    radius: 22,
    hpPerLevel: 4, // [TEMP] same as the Barbarian
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: 0.8, // [TEMP] same as the Barbarian
    regenMana: moba.regenMana,
    // [JOSEPH] "Sorceress 10/15/10/35" (joseph-answers-oct27.md, answer 6).
    str: STARTING_STATS.sorceress.str,
    dex: STARTING_STATS.sorceress.dex,
    vit: STARTING_STATS.sorceress.vit,
    energy: STARTING_STATS.sorceress.energy,
    hpPerVit: 2, // [TEMP] Barbarian 4 scaled by CharStats life per vitality 12/24
    // [DOC] "1 energy adds 5% mana." The repo's flat CharStats mana per energy is kept [TEMP], as every class.
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    // [DOC] strength is melee only and dexterity is non-magic ranged; neither scales her bolts.
    // [TEMP] NEEDS JOSEPH: the doc names no stat for magic damage, so her AD is flat.
    adPerStr: 0,
    adPerDex: 0,
    armorPerDex: moba.armorPerDex,
  },
  skills: skillList,
  colors: {
    cloth: '#5a3a7a',
    skin: '#d8a882',
    metal: '#9fc4ff',
    fur: '#3a2a4a',
    horn: '#e8e0ff',
  },
  projectileSpeed: 460, // [TEMP] the existing Rogue Archer arrow speed (as the Amazon)
};
