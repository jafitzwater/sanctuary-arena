/**
 * t364u "Put the approved bosses in the game" + t370u "Put boss walk / hit / death / wind-up in the game": which
 * approved boss atlas a unit draws, and which animation / column of it. Pure, no DOM (tested).
 *
 * Each boss ships one atlas per animation (scripts/boss-atlases.py), 8 directions x:
 * idle 8, walk 8 (Walk_Loop), attack 12 (v2 retimed wind-up: the raise fills cols 0-5, impact lands on col 6),
 * hit 4 (Hit_Chest), death 10 (Death01).
 * Wild units strike instantly (sim.ts tryStrike sets swing = 1 at the hit and damage applies then), so attack12 is
 * laid around that moment: wind-up cols 0-5 in the last BOSS_WINDUP s before the next strike is ready, impact col 6
 * the frame the strike lands, recovery cols 7-11 while `swing` decays (1 -> 0). Nothing here changes the timing.
 * Walk is distance-driven: one frame per stride/8 of world distance actually travelled (no foot sliding).
 * The hit reaction is visual only and never holds back a strike: wind-up / strike frames win over it.
 * Death plays once and holds its last frame (the existing corpse fade dims it).
 * Priority: dead > walk (while moving: no sliding poses) > strike / recovery > wind-up > hit reaction > idle.
 */

export type BossArtId = 'countess' | 'radament' | 'izual' | 'council-a' | 'council-b' | 'council-c';
export const BOSS_ART_IDS: readonly BossArtId[] = ['countess', 'radament', 'izual', 'council-a', 'council-b', 'council-c'];
export const COUNCIL_VARIANTS: readonly BossArtId[] = ['council-a', 'council-b', 'council-c'];

export type BossAnim = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export const BOSS_ANIMS: readonly BossAnim[] = ['idle', 'walk', 'attack', 'hit', 'death'];
export const BOSS_FRAMES: Readonly<Record<BossAnim, number>> = { idle: 8, walk: 8, attack: 12, hit: 4, death: 10 };
/** Attack column the strike (damage) lands on. */
export const BOSS_IMPACT_COL = 6;
/** Seconds of wind-up shown before a strike (their attackInterval is 1 s; same as Rakanishu). */
export const BOSS_WINDUP = 0.42;
/** ms per idle8 frame (one breath per second, like the heroes' 1 Hz idle). */
export const BOSS_IDLE_MS = 125;
/** Seconds the 4-frame hit reaction plays (Hit_Chest f1.5-7 at 30 fps ~ 0.2 s, held a touch longer to read). */
export const BOSS_HIT_S = 0.32;
/** Seconds the 10-frame death plays (Death01 f0-34 at 30 fps ~ 1.15 s); then the last frame holds. */
export const BOSS_DEATH_S = 1.2;
/**
 * World units travelled per 8-frame walk loop (Sprite Director log, t366u: stride in m x 2.218 u per sheet px at
 * the heroes' px/m, which is the scale the bosses are drawn at).
 */
export const BOSS_STRIDE_U: Readonly<Record<BossArtId, number>> = {
  countess: 114.4,
  radament: 200.9,
  izual: 190.0,
  'council-a': 145.9,
  'council-b': 145.9,
  'council-c': 145.9,
};

/**
 * Approved atlas for a unit, or null (drawn as before). The three Council Members of the jungle den spawn
 * together with consecutive ids (sim.ts spawnCave), so id mod 3 gives each its own variant (A, B, C), stable for
 * the unit's life and again after a respawn. Visual only: nothing in the sim reads it.
 */
export function bossArtFor(defId: string, unitId: number): BossArtId | null {
  switch (defId) {
    case 'countess':
    case 'radament':
    case 'izual':
      return defId;
    case 'council-member':
      return COUNCIL_VARIANTS[((unitId % 3) + 3) % 3];
    default:
      return null;
  }
}

export interface BossFrameState {
  alive: boolean;
  /** Seconds since death (sim time - diedAt). */
  deadFor: number;
  /** unit.swing: 1 at the strike, decays to 0. */
  swing: number;
  attackCd: number;
  /** Has a target (fighting). */
  engaged: boolean;
  /** Walking this frame (the renderer's gait detector). */
  moving: boolean;
  /** World distance actually travelled while walking (renderer pose.travel). */
  travel: number;
  /** Seconds since the last hit landed on it, or Infinity. */
  hitAge: number;
  /** Seconds on the idle clock (sim time + a per-unit offset so a pack does not breathe in step). */
  clock: number;
}

export interface BossFrame {
  anim: BossAnim;
  col: number;
}

/** Walk column from distance travelled: one frame per stride/8, wrapping in the 8-frame loop. */
export function bossWalkCol(travel: number, stride: number): number {
  const n = BOSS_FRAMES.walk;
  const f = Math.floor((Math.max(0, travel) / Math.max(1, stride)) * n);
  return ((f % n) + n) % n;
}

/** Death column: plays once over BOSS_DEATH_S, then holds the last frame. */
export function bossDeathCol(deadFor: number): number {
  const n = BOSS_FRAMES.death;
  return Math.min(n - 1, Math.max(0, Math.floor((deadFor / BOSS_DEATH_S) * n)));
}

/** Hit column for a hit `age` s ago, or -1 once the reaction is over. */
export function bossHitCol(age: number): number {
  if (!(age >= 0) || age >= BOSS_HIT_S) return -1;
  return Math.min(BOSS_FRAMES.hit - 1, Math.floor((age / BOSS_HIT_S) * BOSS_FRAMES.hit));
}

export function bossFrame(id: BossArtId, s: BossFrameState): BossFrame {
  if (!s.alive) return { anim: 'death', col: bossDeathCol(s.deadFor) };
  // Moving always shows the distance-driven walk (no foot sliding): a wind-up, strike recovery or hit reaction
  // only plays while the boss stands (it always stands when its strike lands: it strikes in range).
  if (s.moving) return { anim: 'walk', col: bossWalkCol(s.travel, BOSS_STRIDE_U[id]) };
  if (s.swing > 0) {
    const rest = BOSS_FRAMES.attack - BOSS_IMPACT_COL;
    return { anim: 'attack', col: BOSS_IMPACT_COL + Math.min(rest - 1, Math.floor((1 - Math.min(1, s.swing)) * rest)) };
  }
  if (s.engaged && s.attackCd < BOSS_WINDUP) {
    const k = Math.floor((Math.max(0, BOSS_WINDUP - s.attackCd) / BOSS_WINDUP) * BOSS_IMPACT_COL);
    return { anim: 'attack', col: Math.min(BOSS_IMPACT_COL - 1, k) };
  }
  const hit = bossHitCol(s.hitAge);
  if (hit >= 0) return { anim: 'hit', col: hit };
  const ms = Math.max(0, s.clock) * 1000;
  return { anim: 'idle', col: Math.floor(ms / BOSS_IDLE_MS) % BOSS_FRAMES.idle };
}
