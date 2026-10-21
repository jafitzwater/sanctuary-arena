/** Compass 0 is east, then clockwise: E SE S SW W NW N NE. Atlas rows use that order. */

/** Flare direction index to compass row. 0 SW, 1 W, 2 NW, 3 N, 4 NE, 5 E, 6 SE, 7 S. */
export const FLARE_TO_COMPASS = [3, 4, 5, 6, 7, 0, 1, 2] as const;

export function compassRow(flareDirection: number): number {
  const index = ((flareDirection % 8) + 8) % 8;
  return FLARE_TO_COMPASS[index] ?? 0;
}

/** phase is cycles already advanced at idle 1 Hz, walk 4 Hz, or run 6.25 Hz. */
export function cycleFrame(phase: number, cols: number): number {
  if (cols <= 1) return 0;
  const scaled = phase * cols;
  const turned = scaled % cols;
  const wrapped = turned < 0 ? turned + cols : turned;
  return Math.floor(wrapped) % cols;
}

/**
 * Windup is the first half of the sheet, backswing the second.
 * Each phase is 30% of the attack interval, matching AttackProfile.
 */
export function attackSheetFrame(
  phase: 'Windup' | 'Backswing',
  elapsedMs: number,
  intervalSec: number,
  cols: number,
): number {
  if (cols <= 1) return 0;
  const windupMs = Math.max(1, intervalSec * 1000 * 0.3);
  const backswingMs = Math.max(1, intervalSec * 1000 * 0.3);
  const along = phase === 'Windup' ? clamp01(elapsedMs / windupMs) * 0.5 : 0.5 + clamp01(elapsedMs / backswingMs) * 0.5;
  return Math.min(cols - 1, Math.floor(along * cols));
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 0.999) return 0.999;
  return value;
}
