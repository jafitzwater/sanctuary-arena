/** Screen height of the barbarian body. Idle, walk, and run share it. */
export const HERO_DRAW_HEIGHT = 108;

export type HeroPose = 'idle' | 'walk' | 'run';

/** One body size for every gait. Lean and bob are motion, not scale. */
export function heroDrawHeight(_pose: HeroPose): number {
  return HERO_DRAW_HEIGHT;
}

/** Idle breathes at 1 Hz, walk steps at 4 Hz, run strides at 6.25 Hz. */
export function heroCycleHz(pose: HeroPose): number {
  if (pose === 'run') return 6.25;
  if (pose === 'walk') return 4;
  return 1;
}

/** Forward tilt in radians. The body length does not change. */
export function heroLean(pose: HeroPose): number {
  if (pose === 'run') return 0.42;
  if (pose === 'walk') return 0.16;
  return 0;
}

/**
 * Keep integrating the cycle. A gait change does not rewind the sine,
 * so a turn or a walk-to-run hold cannot freeze or snap the limbs.
 */
export function advanceHeroPhase(phase: number, pose: HeroPose, dt: number): number {
  return phase + heroCycleHz(pose) * Math.max(0, dt);
}

export function wrapAngle(angle: number): number {
  const turn = angle % (Math.PI * 2);
  return turn < 0 ? turn + Math.PI * 2 : turn;
}

function wrapSigned(angle: number): number {
  const wrapped = wrapAngle(angle);
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;
}

/** Ease the drawn facing toward the 8-direction compass heading. */
export function smoothFacing(shown: number, target: number, dt: number): number {
  const gap = wrapSigned(target - shown);
  const t = 1 - Math.exp(-Math.max(0, dt) * 10);
  return shown + gap * t;
}
