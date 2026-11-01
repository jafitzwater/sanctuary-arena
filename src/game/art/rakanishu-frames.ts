/**
 * t345u: which column of Rakanishu's sheet (62-col hero layout + hit 62-65) to draw. Pure, no DOM (tested).
 * Columns shipped in the atlas: 0 idle, 13-17 death5, 26-37 walk12, 50-61 attack12, 62-65 hit4.
 * Wild units strike instantly (sim.ts tryStrike sets swing = 1 at the hit), so the attack12 cycle is laid around
 * that moment like barbarianAttackFrame: windup frames 0-6 in the last RAK_WINDUP s before the next strike is
 * ready, impact/backswing frames 7-11 while `swing` decays (1 -> 0 in ~0.29 s).
 * Priority: death > backswing > walk > windup > hit reaction > idle.
 */
export const RAK_COL = { idle: 0, death: 13, walk: 26, attack: 50, hit: 62 } as const;
export const RAK_FRAMES = { death: 5, walk: 12, attack: 12, hit: 4 } as const;
/** Seconds of windup shown before a strike (his attackInterval is 1 s). */
export const RAK_WINDUP = 0.42;
/** Seconds the 4-frame hit reaction plays after a hit lands on him. */
export const RAK_HIT_S = 0.32;
/** ms per walk12 frame on the locomotion clock. */
export const RAK_WALK_MS = 80;
/** Seconds the death5 cycle takes (same as the other sheets). */
export const RAK_DEATH_S = 0.8;

export interface RakState {
  alive: boolean;
  /** Seconds since death. */
  deadFor: number;
  /** unit.swing: 1 at the strike, decays to 0. */
  swing: number;
  attackCd: number;
  /** Has a target (fighting). */
  engaged: boolean;
  moving: boolean;
  /** Locomotion clock, ms. */
  loco: number;
  /** Seconds since the last hit landed on him, or Infinity. */
  hitAge: number;
}

export function rakanishuCol(s: RakState): number {
  if (!s.alive) {
    return RAK_COL.death + Math.min(RAK_FRAMES.death - 1, Math.floor(Math.min(0.999, s.deadFor / RAK_DEATH_S) * RAK_FRAMES.death));
  }
  if (s.swing > 0) return RAK_COL.attack + 7 + Math.min(4, Math.floor((1 - s.swing) * 5));
  if (s.moving) return RAK_COL.walk + (Math.floor(Math.max(0, s.loco) / RAK_WALK_MS) % RAK_FRAMES.walk);
  if (s.engaged && s.attackCd < RAK_WINDUP) {
    return RAK_COL.attack + Math.min(6, Math.floor(((RAK_WINDUP - s.attackCd) / RAK_WINDUP) * 7));
  }
  if (s.hitAge < RAK_HIT_S) return RAK_COL.hit + Math.min(RAK_FRAMES.hit - 1, Math.floor((s.hitAge / RAK_HIT_S) * RAK_FRAMES.hit));
  return RAK_COL.idle;
}
