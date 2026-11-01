/**
 * t364u "Put the approved bosses in the game": which approved boss atlas a unit draws and which column of it.
 * Pure, no DOM (tested). The approved atlases hold 8 directions x (idle 8 + attack 12) only:
 * columns 0-7 idle8, 8-19 attack12 (attack frames 0-3 wind-up, 4-7 strike, 8-11 recovery, per the sample GIFs).
 * There are no walk, hit or death frames, so: moving plays the idle8 cycle, a hit shows the shared hit flash
 * only, and a dead boss holds idle frame 0 under the existing corpse fade (NEEDS JOSEPH if he wants those).
 * Wild units strike instantly (sim.ts tryStrike sets swing = 1 at the hit), so attack12 is laid around that
 * moment like Rakanishu's: wind-up frames 0-5 in the last BOSS_WINDUP s before the next strike is ready, strike /
 * recovery frames 6-11 while `swing` decays (1 -> 0).
 * Priority: dead > backswing > wind-up > idle (moving or not).
 */

export type BossArtId = 'countess' | 'radament' | 'izual' | 'council-a' | 'council-b' | 'council-c';
export const BOSS_ART_IDS: readonly BossArtId[] = ['countess', 'radament', 'izual', 'council-a', 'council-b', 'council-c'];
export const COUNCIL_VARIANTS: readonly BossArtId[] = ['council-a', 'council-b', 'council-c'];

export const BOSS_COL = { idle: 0, attack: 8 } as const;
export const BOSS_FRAMES = { idle: 8, attack: 12 } as const;
/** Seconds of wind-up shown before a strike (their attackInterval is 1 s; same as Rakanishu). */
export const BOSS_WINDUP = 0.42;
/** ms per idle8 frame (one breath per second, like the heroes' 1 Hz idle). */
export const BOSS_IDLE_MS = 125;

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
  /** unit.swing: 1 at the strike, decays to 0. */
  swing: number;
  attackCd: number;
  /** Has a target (fighting). */
  engaged: boolean;
  /** Seconds on the idle clock (sim time + a per-unit offset so a pack does not breathe in step). */
  clock: number;
}

export function bossCol(s: BossFrameState): number {
  if (!s.alive) return BOSS_COL.idle;
  if (s.swing > 0) return BOSS_COL.attack + 6 + Math.min(5, Math.floor((1 - Math.min(1, s.swing)) * 6));
  if (s.engaged && s.attackCd < BOSS_WINDUP) {
    return BOSS_COL.attack + Math.min(5, Math.floor((Math.max(0, BOSS_WINDUP - s.attackCd) / BOSS_WINDUP) * 6));
  }
  const ms = Math.max(0, s.clock) * 1000;
  return BOSS_COL.idle + (Math.floor(ms / BOSS_IDLE_MS) % BOSS_FRAMES.idle);
}
