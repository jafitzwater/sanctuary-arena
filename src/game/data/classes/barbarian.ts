import type { ClassDef, SkillDef } from './types';
import classes from '../d2/charstats.json';
import skills from '../d2/skills-barbarian.json';

const row = classes.find((entry) => entry.id === 'barbarian');
if (!row) throw new Error('Barbarian missing from CharStats import');

const moba = row.moba;

const skillList: SkillDef[] = skills.map((skill) => ({
  ...skill,
  key: '',
  digit: '',
}));

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
    'The 1.13c Barbarian tree: Combat Skills, Combat Masteries, and Warcries. Bash starts on Q. Press T to spend points and choose the other three belt skills.',
  token: row.token || 'BA',
  startingBelt: ['bash', '', '', ''],
  stats: {
    hp: moba.life,
    mana: moba.mana,
    ad: moba.baseAd,
    armor: moba.baseArmor,
    moveSpeed: moba.runSpeed,
    attackRange: 74,
    attackInterval: 0.78,
    radius: 22,
    hpPerLevel: moba.hpPerLevel,
    manaPerLevel: moba.manaPerLevel,
    adPerLevel: 0,
    armorPerLevel: 0,
    regenHp: moba.regenHp,
    regenMana: moba.regenMana,
    str: moba.str,
    dex: moba.dex,
    vit: moba.vit,
    energy: moba.energy,
    hpPerVit: moba.hpPerVit,
    manaPerEnergy: moba.manaPerEnergy,
    statPointsPerLevel: moba.statPointsPerLevel,
    adPerStr: moba.adPerStr,
    armorPerDex: moba.armorPerDex,
    walkSpeed: moba.walkSpeed,
    runSpeed: moba.runSpeed,
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
