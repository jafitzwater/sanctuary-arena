import type { Team } from '../../types';

export interface WaveGroup {
  unit: string;
  count: number;
}

export type PathId = 'north' | 'center' | 'south';

export interface PathDef {
  id: PathId;
  name: string;
  road: string;
  edge: string;
  lane: { x: number; y: number }[];
  ally: WaveGroup[];
  enemy: WaveGroup[];
  /** Stronger lane packs once the match leaves Normal. */
  later?: { nightmare: WaveGroup[]; hell: WaveGroup[] };
}

export interface SealSpawn {
  team: 'ally' | 'enemy';
  path: PathId;
  x: number;
  y: number;
  name: string;
}

export interface PitSpawn {
  id: 'dragon' | 'herald';
  x: number;
  y: number;
}

export interface ShrineSpawn {
  x: number;
  y: number;
  /** might raises damage, guard raises armor, haste raises speed, mana refills mana. */
  kind: 'might' | 'guard' | 'haste' | 'mana';
}

export interface DenSpawn {
  id: number;
  x: number;
  y: number;
  unit: string;
  count: number;
  respawn: number;
  /** Named leader of the pack. */
  unique?: string;
  /** A single super unique instead of a pack. */
  boss?: string;
}

export interface TowerSpawn {
  team: Team;
  /** 1 is a seal or inner tower, 2 is an outer tower, 3 is a Worldstone guardian. */
  tier: 1 | 2 | 3;
  x: number;
  y: number;
  name: string;
  path?: PathId;
  role?: 'outer' | 'inner' | 'seal' | 'guardian';
}

export interface BaseSpawn {
  name: string;
  x: number;
  y: number;
  hp: number;
  ad: number;
  armor: number;
  attackRange: number;
  attackInterval: number;
  radius: number;
  gold: number;
  xp: number;
}

export interface EnemyChampionDef {
  name: string;
  title: string;
  hp: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  attackRange: number;
  attackInterval: number;
  projectileSpeed: number;
  radius: number;
  gold: number;
  xp: number;
  color: string;
  accent: string;
}

export interface ActTheme {
  /** Renderer scenery set. Add a new id in render.ts when a new act needs new props. */
  decor: 'act1-moor' | 'sanctuary';
  ground: string;
  groundDeep: string;
  shoulder: string;
  road: string;
  roadEdge: string;
  ally: string;
  enemy: string;
  fog: string;
}

/**
 * One act map. The simulator understands a lane polyline, two bases, towers,
 * a wave table, and an optional enemy champion. Jungle is the extra shoulder
 * of walkable ground beside the road — not a second lane.
 */
export interface ActDef {
  id: string;
  actNumber: number;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  lane: { x: number; y: number }[];
  /** When set, minions march every path. `lane` stays the central road. */
  paths?: PathDef[];
  /** Blood river. Sanctuary blocks it except where a road or clearing crosses. */
  river?: { x: number; y: number }[];
  /** Neutral packs in the wilderness. They respawn on their own timer. */
  dens?: DenSpawn[];
  seals?: SealSpawn[];
  pits?: PitSpawn[];
  shrines?: ShrineSpawn[];
  /** Not clamped to a single lane. Sanctuary still blocks cliffs, the river, and buildings. */
  roam?: boolean;
  /** Town names drawn over each base. The base unit name stays the Worldstone. */
  towns?: { ally: string; enemy: string };
  victory?: string;
  defeat?: string;
  march?: string;
  /** Width of the cobble road. */
  laneWidth: number;
  /** Extra walkable ground on each side of the road. */
  jungle: number;
  /** Open yard around each base. Must cover the shop and fountain. */
  plaza: number;
  shopRadius: number;
  fountainRadius: number;
  playerBase: BaseSpawn;
  enemyBase: BaseSpawn;
  /**
   * Seconds every hero is held inside its own base at the start, with potion-only buying.
   * Doc: "There is a 15 second wait to start. Players are blocked in base until those 15 seconds pass."
   */
  openingWait?: number;
  towers: TowerSpawn[];
  waves: {
    /** Seconds between waves after the first. */
    interval: number;
    /** Seconds until the first wave. */
    first: number;
    ally: WaveGroup[];
    enemy: WaveGroup[];
  };
  enemyChampion: EnemyChampionDef;
  theme: ActTheme;
}

export interface TowerTier {
  hp: number;
  ad: number;
  armor: number;
  range: number;
  interval: number;
  radius: number;
  gold: number;
  xp: number;
}

export const TOWER_TIERS: Record<1 | 2 | 3, TowerTier> = {
  1: { hp: 677, ad: 30, armor: 18, range: 330, interval: 0.95, radius: 40, gold: 220, xp: 140 },
  2: { hp: 492, ad: 23, armor: 12, range: 300, interval: 1.05, radius: 36, gold: 160, xp: 90 },
  3: { hp: 820, ad: 28, armor: 20, range: 300, interval: 1, radius: 42, gold: 260, xp: 160 },
};
