/**
 * WORK ORDER "Wild Rift pass 2 (Code engineer)", item 3 [JOSEPH]:
 * "Locomotion animation playback rate scales with current movement speed (document the formula). All 8 directions
 * incl. diagonals trigger and hold the run animation (check joystick diagonal registration). Do not change movement
 * speed numbers."
 *
 * Implements: one pure playback-rate formula and a time-based locomotion clock.
 *   playbackRate = clamp(currentMS / baseMS, LOCO_RATE_MIN, LOCO_RATE_MAX)
 *   currentMS = championMS(unit) (sim.ts: totalMS of the unit's msBase with haste / Whirlwind / Frenzy / slows)
 *   baseMS    = totalMS(unit.msBase) (the champion's plain single MS, no modifiers)
 *   clock    += dtMs * playbackRate   while moving or while the stick is held (so a stick held into a wall or on a
 *                                     diagonal that slides keeps the run playing instead of freezing on one frame)
 *   frame     = floor(clock / msPerFrame) % frames
 * At plain MS the rate is exactly 1, so the run plays at its authored timing (barbarian run12: 60 ms/frame,
 * 0.72 s loop; other class move blocks: CLASS_MOVE_FRAME_MS).
 * Excluded: movement speed numbers are not touched (data/moveSpeed.ts, class msBase); mobs keep their gait.
 */

/** [TEMP] Clamp so a heavy slow never freezes the feet and stacked haste never blurs them. */
export const LOCO_RATE_MIN = 0.5;
/** [TEMP] */
export const LOCO_RATE_MAX = 2;
/** [TEMP/art direction] Non-barbarian class move blocks (8 frames): 70 ms/frame = 0.56 s loop at rate 1. */
export const CLASS_MOVE_FRAME_MS = 70;

/** Pure: locomotion playback rate from current vs base movement speed. */
export function locomotionRate(currentMS: number, baseMS: number): number {
  if (!(baseMS > 0) || !Number.isFinite(currentMS)) return 1;
  return Math.min(LOCO_RATE_MAX, Math.max(LOCO_RATE_MIN, currentMS / baseMS));
}

/** Pure: advance the locomotion clock. It holds (does not reset) while standing, so a restart is seamless. */
export function advanceLocoClock(clockMs: number, dtMs: number, rate: number, moving: boolean): number {
  if (!moving || !(dtMs > 0)) return clockMs;
  return clockMs + dtMs * rate;
}

/** Pure: frame within a locomotion block. */
export function locoFrame(clockMs: number, msPerFrame: number, frames: number): number {
  if (frames <= 1 || msPerFrame <= 0) return 0;
  return Math.floor(Math.max(0, clockMs) / msPerFrame) % frames;
}
