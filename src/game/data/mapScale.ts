/**
 * WORK ORDER "Wild Rift pass 2 (Code engineer)", item 1 [JOSEPH]:
 * "MAP SCALE: shrink the physical in-game map by one global factor MAP_SCALE = 0.75 [TEMP] (lane length, jungle,
 * river, bases, towers, camps, spawns, walls all scale together; layout and proportions unchanged). ... Gameplay
 * values (speeds, ranges, damage, timers) unchanged. Minimap and camera follow automatically."
 *
 * Implements: the single MAP_SCALE constant and a pure `scaleAct` that multiplies every physical map coordinate and
 * map dimension of an ActDef by it (map size, lane/path polylines, river, towers, bases, seals, pits, shrines, cave
 * camps, road width, jungle shoulder, base plaza, shop and fountain yards). Fixed map-layout offsets elsewhere
 * (spawn seats, clearings, side offsets of grass/orbs/pools) use `mapLen`.
 * Tech design: the match stays in cartesian world coordinates; only the coordinates shrink. Phaser-free (tests).
 * Excluded (unchanged on purpose): hp, damage, armor, attack ranges, attack intervals, unit radii, gold, xp,
 * speeds, timers, wave sizes, sprite sizes, prop sizes, pickup radii and Joseph's "every ~200-300 units" orb spacing.
 */
import type { ActDef, BaseSpawn } from './acts/types';

/** [TEMP] [JOSEPH] One global map factor. 1 = the pre-pass-2 map. */
export const MAP_SCALE = 0.75;

/** A fixed map-layout length (world units, designed at scale 1) at the current MAP_SCALE. */
export function mapLen(designUnits: number, scale = MAP_SCALE): number {
  return designUnits * scale;
}

type Pt = { x: number; y: number };
function sp<T extends Pt>(p: T, s: number): T {
  return { ...p, x: Math.round(p.x * s), y: Math.round(p.y * s) };
}
function sl(lane: Pt[], s: number): Pt[] {
  return lane.map((p) => sp(p, s));
}
/** Base position scales; its combat values (hp, ad, armor, attackRange, attackInterval, radius, gold, xp) do not. */
function sb(base: BaseSpawn, s: number): BaseSpawn {
  return sp(base, s);
}

/** Pure: a copy of `act` with the physical map scaled by `s`. Gameplay values are copied unchanged. */
export function scaleAct(act: ActDef, s: number = MAP_SCALE): ActDef {
  const r = (v: number) => Math.round(v * s);
  return {
    ...act,
    width: r(act.width),
    height: r(act.height),
    lane: sl(act.lane, s),
    paths: act.paths?.map((path) => ({ ...path, lane: sl(path.lane, s) })),
    river: act.river ? sl(act.river, s) : undefined,
    dens: act.dens?.map((den) => sp(den, s)),
    seals: act.seals?.map((seal) => sp(seal, s)),
    pits: act.pits?.map((pit) => sp(pit, s)),
    shrines: act.shrines?.map((shrine) => sp(shrine, s)),
    towers: act.towers.map((tower) => sp(tower, s)),
    playerBase: sb(act.playerBase, s),
    enemyBase: sb(act.enemyBase, s),
    laneWidth: r(act.laneWidth),
    jungle: r(act.jungle),
    plaza: r(act.plaza),
    shopRadius: r(act.shopRadius),
    fountainRadius: r(act.fountainRadius),
  };
}
