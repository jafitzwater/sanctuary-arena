export interface SkillDef {
  id: string;
  name: string;
  /** Unused when the belt assigns Q W E R. Kept so a class can still pin a key. */
  key: string;
  digit: string;
  cooldown: number;
  /** Mana at rank 1, already scaled for the match. */
  mana: number;
  manaPerRank: number;
  /**
   * Mana % step per rank after rank 1. Missing means the shared 5% step. The Sorceress sets 2%
   * (doc: "once energy reaches 10, that step drops from 5% to 2%") [DOC][P].
   */
  manaStep?: number;
  minMana: number;
  maxRank: number;
  /** Match level required before the first point can be spent. */
  unlockLevel: number;
  /**
   * Skill rework order [JOSEPH]: the class's top-tier skill (last in the flat list). No rank gates:
   * the 5/9/13 rank levels from the economy order are removed. Only used to keep the four other
   * skills on Q W E R (combat.fillEmptyBelt).
   */
  topTier?: boolean;
  /** Diablo II reqlevel, before the match-length scale. */
  reqLevel: number;
  description: string;
  short: string;
  tab: number;
  tabName: string;
  row: number;
  col: number;
  passive: boolean;
  prereqs: string[];
  anim: string;
  param1: number;
  param2: number;
  srcDam: number;
  starter: boolean;
  d2Id: number;
}

export interface ClassStats {
  hp: number;
  mana: number;
  ad: number;
  armor: number;
  /** [JOSEPH] Base MS at level 1 in LoL units (data/moveSpeed.ts BASE_MS); the world speed is totalMS(). */
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
  str: number;
  dex: number;
  vit: number;
  energy: number;
  hpPerVit: number;
  manaPerEnergy: number;
  statPointsPerLevel: number;
  adPerStr: number;
  /** Flat AD per extra dexterity point (ranged classes). Missing means 0. */
  adPerDex?: number;
  armorPerDex: number;
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
  /** Four belt slots. Empty string means the slot is unassigned. */
  startingBelt: string[];
  /** PlrMode animation token, such as BA for the Barbarian. */
  token: string;
  colors: ClassColors;
  /** Arrow speed for a ranged class's basic attacks (role 'ranged'). */
  projectileSpeed?: number;
}
