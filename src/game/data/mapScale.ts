/**
 * WORK ORDER "Wild Rift pass 2 (Code engineer)", item 1 [JOSEPH]:
 * "MAP SCALE: shrink the physical in-game map by one global factor MAP_SCALE = 0.75 [TEMP] (lane length, jungle,
 * river, bases, towers, camps, spawns, walls all scale together; layout and proportions unchanged). ... Gameplay
 * values (speeds, ranges, damage, timers) unchanged. Minimap and camera follow automatically."
 *
 * Implements: the single MAP_SCALE constant and a pure `scaleAct` that multiplies every physical map coordinate and
 * map dimension of an ActDef by it (map size, lane/path polylines, river, towers, bases, seals, pits, shrines, cave
 * camps, road width, jungle shoulder). The base yard (plaza, shop and fountain radii) keeps its size (t315u). Fixed map-layout offsets elsewhere
 * (spawn seats, clearings, side offsets of grass/orbs/pools) use `mapLen`.
 * Tech design: the match stays in cartesian world coordinates; only the coordinates shrink. Phaser-free (tests).
 * Excluded (unchanged on purpose): hp, damage, armor, attack ranges, attack intervals, unit radii, gold, xp,
 * speeds, timers, wave sizes, sprite sizes, prop sizes, pickup radii and Joseph's "every ~200-300 units" orb spacing.
 */
import type { ActDef, BaseSpawn } from './acts/types';

/**
 * [JOSEPH t326u] One global map factor: the 12,000 x 12,000 design map is played at 6,800 x 6,800
 * (was 9,000 x 9,000 at 0.75, t315u). 1 = the design map.
 */
export const MAP_SCALE = 6800 / 12000;

/** A fixed map-layout length (world units, designed at scale 1) at the current MAP_SCALE. */
export function mapLen(designUnits: number, scale = MAP_SCALE): number {
  return designUnits * scale;
}

type Pt = { x: number; y: number };
/**
 * Snapped to a 1/64 grid, not to whole units: x * MAP_SCALE is fractional (0.75 gives .5, which whole-unit rounding
 * turns into a broken 180-degree mirror), and at 6800/12000 the raw float products miss the exact mirror W - x by
 * ~1e-12 (t326u). The map width is a whole number, so on this grid W - snap(x) === snap(W - x).
 */
const snap = (v: number) => Math.round(v * 64) / 64;
function sp<T extends Pt>(p: T, s: number): T {
  return { ...p, x: snap(p.x * s), y: snap(p.y * s) };
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
    // t315u: the base yard (open plaza, shop and fountain ranges) is sized around the unscaled Worldstone, the
    // unscaled spawn pen and the heroes, so it keeps its size; only its position moves with the base.
    plaza: act.plaza,
    shopRadius: act.shopRadius,
    fountainRadius: act.fountainRadius,
  };
}
