export interface SkillDef {
  id: string;
  name: string;
  /** Keyboard key, a single letter. Avoid W/A/S/D if the class should keep WASD movement. */
  key: string;
  /** Alternate digit hotkey, "1" through "4". */
  digit: string;
  cooldown: number;
  mana: number;
  maxRank: number;
  /** Hero level required before the first point can be spent. */
  unlockLevel: number;
  description: string;
}

export interface ClassStats {
  hp: number;
  mana: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  /** Center-to-edge reach of basic attacks, before the target's radius. */
  attackRange: number;
  attackInterval: number;
  radius: number;
  hpPerLevel: number;
  manaPerLevel: number;
  adPerLevel: number;
  armorPerLevel: number;
  regenHp: number;
  regenMana: number;
}

export interface ClassColors {
  cloth: string;
  skin: string;
  metal: string;
  fur: string;
  horn: string;
}

/**
 * Everything the simulator needs to spawn a champion, aside from skill
 * behavior. Skill behavior is registered by id in src/game/skills.
 */
export interface ClassDef {
  id: string;
  name: string;
  title: string;
  role: 'melee' | 'ranged' | 'caster';
  blurb: string;
  stats: ClassStats;
  skills: SkillDef[];
  colors: ClassColors;
}
