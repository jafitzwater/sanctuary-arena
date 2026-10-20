import type { Team } from '../../types';

export interface WaveGroup {
  unit: string;
  count: number;
}

export interface TowerSpawn {
  team: Team;
  /** 1 is the inner tower (closer to its base, tougher). 2 is the outer tower. */
  tier: 1 | 2;
  x: number;
  y: number;
  name: string;
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
  decor: 'act1-moor';
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

export const TOWER_TIERS: Record<1 | 2, TowerTier> = {
  1: { hp: 677, ad: 30, armor: 18, range: 330, interval: 0.95, radius: 40, gold: 220, xp: 140 },
  2: { hp: 492, ad: 23, armor: 12, range: 300, interval: 1.05, radius: 36, gold: 160, xp: 90 },
};
