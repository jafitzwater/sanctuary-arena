import { expectedLevel } from './economy';

export type PaceName = 'Normal' | 'Nightmare' | 'Hell';

/** Monster life, damage, and extra lane bodies as the match runs. */
export function paceOf(time: number): { name: PaceName; hp: number; ad: number; extra: number } {
  if (time < 90) return { name: 'Normal', hp: 1, ad: 1, extra: 0 };
  if (time < 180) return { name: 'Nightmare', hp: 1.35, ad: 1.2, extra: 1 };
  return { name: 'Hell', hp: 1.8, ad: 1.45, extra: 2 };
}

/** Solo heroes keep the full award. A pair shares at 0.65 each. Larger groups share at 0.45. */
export function xpShare(heroes: number): number {
  if (heroes <= 1) return 1;
  if (heroes === 2) return 0.65;
  return 0.45;
}

/**
 * Heroes a level or more behind the clock earn up to half again.
 * Economy order [TEMP]: the clock is now economy.expectedLevel (the new XP pace), not 1 per 45 s capped at 10.
 */
export function comebackMul(level: number, time: number): number {
  const expected = expectedLevel(time);
  const behind = expected - level;
  if (behind <= 1) return 1;
  return 1 + Math.min(0.5, (behind - 1) * 0.12);
}
