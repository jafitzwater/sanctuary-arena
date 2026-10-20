import type { ClassDef } from './types';

/**
 * Melee bruiser. Skill keys are Q W E R, matching a typical MOBA row.
 * Desktop movement uses the mouse and the arrow keys so W can stay Leap.
 * A future class can pick different keys; wire the handlers in src/game/skills.
 */
export const barbarian: ClassDef = {
  id: 'barbarian',
  name: 'Barbarian',
  title: 'Warrior of Mount Arreat',
  role: 'melee',
  blurb:
    'A melee brawler. Bash stuns, Leap crosses the moor, War Cry rallies nearby Rogues, and Whirlwind carves through a pack.',
  stats: {
    hp: 760,
    mana: 230,
    ad: 66,
    armor: 16,
    moveSpeed: 268,
    attackRange: 74,
    attackInterval: 0.76,
    radius: 22,
    hpPerLevel: 82,
    manaPerLevel: 20,
    adPerLevel: 7,
    armorPerLevel: 1.5,
    regenHp: 2.6,
    regenMana: 4.6,
  },
  skills: [
    {
      id: 'bash',
      name: 'Bash',
      key: 'Q',
      digit: '1',
      cooldown: 6,
      mana: 18,
      maxRank: 4,
      unlockLevel: 1,
      description: 'Smash a nearby foe for heavy damage and a short stun. If nothing is in reach, your next attack bashes.',
    },
    {
      id: 'leap',
      name: 'Leap',
      key: 'W',
      digit: '2',
      cooldown: 9,
      mana: 22,
      maxRank: 4,
      unlockLevel: 2,
      description: 'Jump toward the pointer or your facing, damaging and slowing enemies where you land.',
    },
    {
      id: 'warcry',
      name: 'War Cry',
      key: 'E',
      digit: '3',
      cooldown: 13,
      mana: 28,
      maxRank: 4,
      unlockLevel: 3,
      description: 'A shout that empowers nearby allies and slows enemies around you.',
    },
    {
      id: 'whirlwind',
      name: 'Whirlwind',
      key: 'R',
      digit: '4',
      cooldown: 11,
      mana: 32,
      maxRank: 3,
      unlockLevel: 4,
      description: 'Spin through the fight, striking everyone nearby. You can move while spinning.',
    },
  ],
  colors: {
    cloth: '#6e2a22',
    skin: '#c48a62',
    metal: '#d5dbe4',
    fur: '#8a5a32',
    horn: '#f0e2bc',
  },
};
