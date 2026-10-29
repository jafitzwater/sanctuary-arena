import { BASE_MS } from '../moveSpeed';
import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';
import { STARTING_STATS } from './startingStats';
import { barbarian } from './barbarian';

const row = classes.find((entry) => entry.id === 'necromancer');
if (!row) throw new Error('Necromancer missing from CharStats import');

const moba = row.moba;

/**
 * [DOC][P] kits-final.md / design doc: "For the sorceress and the necromancer, once energy reaches 10,
 * that step drops from 5% to 2%. 10 energy is the placeholder." The Necromancer starts at 25 energy
 * ([JOSEPH] answer 6) and energy never drops, so his step is always 2%: 10/12/14/16/18% (kits-final
 * table "Energy 10 or more"). Read by combat.manaPct via SkillDef.manaStep (added by the Sorceress PR).
 */
export const NECRO_ENERGY_STEP_AT = 10;
export const NECRO_MANA_STEP = 0.02;

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
    anim: 'S1',
    param1: 0,
    param2: 0,
    srcDam: 0,
    starter: false,
    d2Id: 0,
    manaStep: NECRO_MANA_STEP,
    ...partial,
  };
}

/**
 * ORDER "Make Necromancer playable" (kits-final.md, Necromancer).
 * Doc: "Teeth, or minions." Path restriction: Teeth or Minions only.
 * Doc: "Teeth: teeth, bone spear, bone armor, bone spirit." Built here, as the Amazon and Sorceress PRs
 * built one path: Teeth (the first path the doc lists) [TEMP]. Minions ("raise skeleton, raise mage,
 * bone armor, and bone wall. 3 minions total ...") is not built: there is no summon/follower system,
 * and no path picker yet (NEEDS JOSEPH).
 * Doc: "Skills unlock at level 1, level 3, level 5, and level 7." -> teeth 1, bone spear 3, bone armor 5,
 * bone spirit 7 [DOC]. The Teeth path has four skills and no fifth, so nothing unlocks after level 7.
 * Doc: "Skills max at level 5." -> maxRank 5 [DOC]. Mana cost is the % rule with the 2% step [DOC][P].
 * [TEMP] Cooldowns and effects are unset in the doc ([U]); the handlers in skills/necromancer.ts use
 * existing mechanics (projectile, armor buff) with fixed placeholder numbers.
 * `mana`/`manaPerRank` mirror the Barbarian's fields and are not used by the % mana rule.
 */
const skillList: SkillDef[] = [
  skill({
    id: 'teeth',
    name: 'Teeth',
    short: 'Teeth',
    unlockLevel: 1,
    mana: 8,
    manaPerRank: 2,
    cooldown: 4, // [TEMP]
    starter: true,
    row: 1,
    d2Id: 67,
    description: 'Bone teeth fly at up to 3 nearby foes, plus 1 per rank. Each deals 60% of a basic hit, and each rank adds 8%.',
  }),
  skill({
    id: 'bone-spear',
    name: 'Bone Spear',
    short: 'Spear',
    unlockLevel: 3,
    mana: 12,
    manaPerRank: 2,
    cooldown: 7, // [TEMP]
    row: 2,
    d2Id: 84,
    description: 'A spear of bone at one foe, with longer reach. Rank 1 deals 140% of a basic hit, and each rank adds 12%.',
  }),
  skill({
    id: 'bone-armor',
    name: 'Bone Armor',
    short: 'Armor',
    unlockLevel: 5,
    mana: 14,
    manaPerRank: 2,
    cooldown: 14, // [TEMP]
    row: 3,
    d2Id: 68,
    description: 'Bone wraps you, raising your defense by 12, plus 4 per rank, for 8 s.',
  }),
  skill({
    id: 'bone-spirit',
    name: 'Bone Spirit',
    short: 'Spirit',
    unlockLevel: 7,
    mana: 18,
    manaPerRank: 2,
    cooldown: 12, // [TEMP]
    row: 4,
    d2Id: 93,
    description: 'A spirit that seeks one foe at long reach. Rank 1 deals 180% of a basic hit, and each rank adds 15%.',
  }),
];

/** [TEMP] Life scale the Barbarian uses (240 match life for the 780 CharStats life), applied to the Necromancer's 360. */
const LIFE_SCALE = barbarian.stats.hp / 780;

export const necromancer: ClassDef = {
  id: 'necromancer',
  name: 'Necromancer',
  title: 'Priest of Rathma',
  // [TEMP] NEEDS JOSEPH: the doc does not say how the Necromancer basic-attacks. He uses the existing
  // projectile basic attack (as the Amazon and Sorceress), so 'ranged' in the sim.
  role: 'ranged',
  blurb:
    'Teeth path: Teeth, Bone Spear, Bone Armor, and Bone Spirit. Skills learn themselves at levels 1, 3, 5 and 7. Press T to spend extra points.',
  token: row.token || 'NE',
  startingBelt: ['teeth', '', '', ''],
  stats: {
    hp: Math.round(moba.life * LIFE_SCALE), // [TEMP] 360 * 240/780 = 111
    mana: moba.mana, // CharStats import, as the Barbarian
    ad: 15, // [TEMP] same as the Barbarian
    armor: moba.baseArmor,
    // [JOSEPH] movement-speed-spec.md: "Necromancer 330"; 330 * UNIT_SCALE (1.0) = 330 px/s.
    moveSpeed: BASE_MS.necromancer,
    attackRange: 200, // [TEMP] same as the Amazon/Sorceress range
    attackInterval: 0.78, // [TEMP] same as the Barbarian
    radius: 22,
    hpPerLevel: 4, // [TEMP] same as the Barbarian
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: 0.8, // [TEMP] same as the Barbarian
    regenMana: moba.regenMana,
    // [JOSEPH] "Necromancer 15/15/15/25" (joseph-answers-oct27.md, answer 6).
    str: STARTING_STATS.necromancer.str,
    dex: STARTING_STATS.necromancer.dex,
    vit: STARTING_STATS.necromancer.vit,
    energy: STARTING_STATS.necromancer.energy,
    hpPerVit: 2, // [TEMP] Barbarian 4 scaled by CharStats life per vitality 12/24 (as the Sorceress)
    // [DOC] "1 energy adds 5% mana." The repo's flat CharStats mana per energy is kept [TEMP], as every class.
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    // [DOC] strength is melee only and dexterity is non-magic ranged; neither scales his bone spells.
    // [TEMP] NEEDS JOSEPH: the doc names no stat for magic damage, so his AD is flat.
    adPerStr: 0,
    adPerDex: 0,
    armorPerDex: moba.armorPerDex,
  },
  skills: skillList,
  colors: {
    cloth: '#2e2e26',
    skin: '#c8b89a',
    metal: '#d8d2bc',
    fur: '#1e1e18',
    horn: '#efe8d0',
  },
  projectileSpeed: 460, // [TEMP] the existing Rogue Archer arrow speed (as the Amazon/Sorceress)
};
