import type { ActDef } from './data/acts/types';
import type { ClassDef } from './data/classes/types';

export type Team = 'ally' | 'enemy';
export type UnitKind = 'champion' | 'minion' | 'tower' | 'base';
export type Phase = 'playing' | 'victory' | 'defeat';

export interface LeapState {
  t: number;
  dur: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rank: number;
  kind: 'leap' | 'leap-attack';
}

export interface Unit {
  id: number;
  defId: string;
  kind: UnitKind;
  team: Team;
  name: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  attackRange: number;
  attackInterval: number;
  attackCd: number;
  aggro: number;
  gold: number;
  xp: number;
  alive: boolean;
  ranged: boolean;
  projectileSpeed: number;
  waypoint: number;
  targetId: number | null;
  facing: number;
  swing: number;
  hitFlash: number;
  stun: number;
  slow: number;
  slowPct: number;
  buffT: number;
  buffDmg: number;
  buffArmor: number;
  bashT: number;
  invuln: number;
  whirlT: number;
  whirlTick: number;
  whirlRank: number;
  leap: LeapState | null;
  /** PlrMode weapon class driving the attack pose: HTH, 1HS, 2HS, STF, 2HT. */
  wclass: string;
  castT: number;
  boT: number;
  frenzyT: number;
  berserkT: number;
  concentrateT: number;
  commandT: number;
  tauntT: number;
  findGold: number;
  combat: number;
  respawn: number;
  corpse: number;
  color: string;
  accent: string;
}

export interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  speed: number;
  damage: number;
  targetId: number;
  attackerId: number;
  life: number;
  color: string;
  radius: number;
}

export interface Fx {
  kind: 'ring' | 'slash' | 'text';
  x: number;
  y: number;
  r: number;
  life: number;
  t: number;
  color: string;
  text?: string;
  vy?: number;
  facing?: number;
}

export interface Loadout {
  weapon: string | null;
  offhand: string | null;
  armor: string | null;
  helm: string | null;
  belt: string | null;
}

export interface Sim {
  map: ActDef;
  classDef: ClassDef;
  seed: number;
  time: number;
  units: Unit[];
  projectiles: Projectile[];
  fx: Fx[];
  nextId: number;
  playerId: number;
  enemyChampionId: number;
  gold: number;
  xp: number;
  level: number;
  skillPoints: number;
  skillRanks: Record<string, number>;
  cooldowns: Record<string, number>;
  attributes: { str: number; dex: number; vit: number; energy: number };
  statPoints: number;
  /** Q W E R. Empty string is an open slot. */
  belt: string[];
  potions: { health: number; mana: number };
  loadout: Loadout;
  phase: Phase;
  waveIn: number;
  announcedWave: boolean;
  banner: { text: string; t: number } | null;
  tip: string;
  tipT: number;
  cs: number;
  kills: number;
  deaths: number;
  sfx: string[];
  shake: number;
}

export interface FrameInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  attack: boolean;
  targetId: number | null;
  destX: number | null;
  destY: number | null;
  cast: string | null;
  buy: string | null;
  potion: 'health' | 'mana' | null;
  upgrade: string | null;
  attribute: 'str' | 'dex' | 'vit' | 'energy' | null;
  assignSkill: string | null;
  assignSlot: number;
}

export function emptyInput(): FrameInput {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    attack: false,
    targetId: null,
    destX: null,
    destY: null,
    cast: null,
    buy: null,
    potion: null,
    upgrade: null,
    attribute: null,
    assignSkill: null,
    assignSlot: 0,
  };
}

export interface Camera {
  x: number;
  y: number;
  viewW: number;
  viewH: number;
  zoom: number;
  cssW: number;
  cssH: number;
  dpr: number;
}
