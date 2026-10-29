import { BASE_MS } from '../moveSpeed';
import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';
import { STARTING_STATS } from './startingStats';
import { barbarian } from './barbarian';

const row = classes.find((entry) => entry.id === 'amazon');
if (!row) throw new Error('Amazon missing from CharStats import');

const moba = row.moba;

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
 * ORDER "Make Amazon playable" (kits-final.md, Amazon).
 * Doc: "Ranged or melee. The gear follows." "Magic arrow: magic arrow, multi shot, ice shot, fire shot."
 * Doc: Path restriction: Lance or Magic Arrow only; one path at a time.
 * Doc: "Skills unlock at level 1, level 3, level 5, and level 7." -> 1/3/5/7 [DOC] (kits-final reading).
 * Skill rework order [JOSEPH]: "ALL SKILLS MAX RANK 3" -> maxRank 3 (was doc "Skills max at level 5" -> 5) [DOC]. Mana cost is the shared % rule (combat.manaCost) [DOC].
 * [TEMP][JOSEPH] Path: the Magic Arrow (bow) path is the one wired, because the order calls the Amazon a
 * "dex/bow build". There is no path-choice system, so the Lance path (jab, charged strike, poison strike,
 * multi strike) is not playable yet. Each path has 4 skills in the doc; there is no fifth Amazon skill.
 * Skill rework order (2026-10-29) [JOSEPH]: no paths; one flat list. The four bow skills keep 1/3/5/7 and
 * Strafe is the top-tier skill [JOSEPH], unlock L9 [JOSEPH] (skill follow-ups order; values [TEMP], skills/amazon.ts).
 * [TEMP] Cooldowns and effects are unset in the doc ([U]); the handlers in skills/amazon.ts use existing
 * mechanics (arrows = the existing projectile, ice = the existing slow) with fixed placeholder numbers.
 * `mana`/`manaPerRank` mirror the Barbarian's fields and are not used by the % mana rule.
 */
const skillList: SkillDef[] = [
  skill({
    id: 'magic-arrow',
    name: 'Magic Arrow',
    short: 'Arrow',
    unlockLevel: 1,
    mana: 8,
    manaPerRank: 2,
    cooldown: 5, // [TEMP]
    starter: true,
    row: 1,
    d2Id: 6,
    description: 'A magic arrow at one foe. Rank 1 deals 120% of a basic hit, and each rank adds 10%.',
  }),
  skill({
    id: 'multi-shot',
    name: 'Multi Shot',
    short: 'Multi',
    unlockLevel: 3,
    mana: 12,
    manaPerRank: 2,
    cooldown: 8, // [TEMP]
    row: 2,
    d2Id: 12,
    description: 'Arrows at up to 2 + rank foes in range. Each deals 60% of a basic hit, and each rank adds 8%.',
  }),
  skill({
    id: 'ice-shot',
    name: 'Ice Shot',
    short: 'Ice',
    unlockLevel: 5,
    mana: 14,
    manaPerRank: 2,
    cooldown: 9, // [TEMP]
    row: 3,
    d2Id: 11,
    description: 'A cold arrow that slows its target 30% for 1.5 s. Rank 1 deals 100% of a basic hit, and each rank adds 10%.',
  }),
  skill({
    id: 'fire-shot',
    name: 'Fire Shot',
    short: 'Fire',
    unlockLevel: 7,
    mana: 18,
    manaPerRank: 2,
    cooldown: 12, // [TEMP]
    row: 4,
    d2Id: 7,
    description: 'A burning arrow. Rank 1 deals 140% of a basic hit, and each rank adds 15%.',
  }),
  skill({
    id: 'strafe',
    name: 'Strafe', // [JOSEPH] top-tier skill
    short: 'Strafe',
    unlockLevel: 9, // [JOSEPH] skill follow-ups order
    topTier: true,
    mana: 22, // [TEMP] mirror field, as the other top tiers (cost is the % rule)
    manaPerRank: 4,
    cooldown: 11, // [TEMP] skill follow-ups balance band
    row: 5,
    d2Id: 26,
    description: 'A volley of arrows at up to 5 foes in reach. Each deals 90% of a basic hit, and each rank adds 10%.', // [TEMP]
  }),
];

/** [TEMP] Life scale the Barbarian uses (240 match life for the 780 CharStats life), applied to the Amazon's 540. */
const LIFE_SCALE = barbarian.stats.hp / 780;

export const amazon: ClassDef = {
  id: 'amazon',
  name: 'Amazon',
  title: 'Sister of the Sightless Eye',
  // [TEMP] Magic Arrow path -> ranged basic attacks (doc: "Ranged or melee. The gear follows.").
  role: 'ranged',
  blurb:
    'Magic Arrow, Multi Shot, Ice Shot, Fire Shot, and Strafe. Skills learn themselves at levels 1, 3, 5, 7 and 9. Press T to spend extra points.',
  token: row.token || 'AM',
  startingBelt: ['magic-arrow', '', '', ''],
  stats: {
    hp: Math.round(moba.life * LIFE_SCALE), // [TEMP] 540 * 240/780 = 166
    mana: moba.mana, // CharStats import, as the Barbarian
    ad: 15, // [TEMP] same as the Barbarian
    armor: moba.baseArmor,
    // [JOSEPH] movement-speed-spec.md: "Amazon 340"; 340 * UNIT_SCALE (1.0) = 340 px/s.
    moveSpeed: BASE_MS.amazon,
    attackRange: 200, // [TEMP] the existing Rogue Archer bow range
    attackInterval: 0.78, // [TEMP] same as the Barbarian
    radius: 22,
    hpPerLevel: 4, // [TEMP] same as the Barbarian
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: 0.8, // [TEMP] same as the Barbarian
    regenMana: moba.regenMana,
    // [JOSEPH] "Amazon Str20 Dex25 Vit20 Ene15" (joseph-answers-oct27.md, answer 6).
    str: STARTING_STATS.amazon.str,
    dex: STARTING_STATS.amazon.dex,
    vit: STARTING_STATS.amazon.vit,
    energy: STARTING_STATS.amazon.energy,
    hpPerVit: 3, // [TEMP] Barbarian 4 scaled by CharStats 18/24
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    // [TEMP] Doc: "1 dexterity adds 5% ranged attack power (for example an Amazon bow)". The repo's flat
    // per-point formula is kept (NEEDS JOSEPH): the Barbarian's 0.15 AD per strength moves to dexterity.
    adPerStr: 0,
    adPerDex: 0.15,
    armorPerDex: moba.armorPerDex,
  },
  skills: skillList,
  projectileSpeed: 460, // [TEMP] the existing Rogue Archer arrow speed
  colors: {
    cloth: '#5a6a3a',
    skin: '#d2a07a',
    metal: '#c9cfd8',
    fur: '#7a5a3a',
    horn: '#e8dcb8',
  },
};
