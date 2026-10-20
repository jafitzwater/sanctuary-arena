/** One direction of the Spriters run cycle. The source row continues past this into the next weapon. */
export const RUN_FRAMES = 12;
/**
 * Fixed run cadence. Twelve frames at 40ms is a 480ms stride.
 * At 216 px/s that stride is 103.68px.
 */
export const RUN_FRAME_MS = 40;
/**
 * Walk sheets are four columns (light 151, medium 140, heavy 160).
 * A 12-column slice of those widths is not an integer cell.
 */
export const WALK_FRAMES = 4;
/** Walk cadence stays inside 55–60ms. Four real columns, so the stride is not the run's. */
export const WALK_FRAME_MS = 58;

/** currentFrame = floor(elapsedAnimTime / frameDuration) % totalFrames. */
export function animFrame(elapsedMs: number, frameMs: number, totalFrames: number): number {
  if (totalFrames <= 1 || frameMs <= 0) return 0;
  const elapsed = elapsedMs < 0 ? 0 : elapsedMs;
  return Math.floor(elapsed / frameMs) % totalFrames;
}

/** Pixels covered by one full cycle when speed is constant. Same dt feeds both. */
export function strideLength(speed: number, frameMs: number, frames: number): number {
  return (speed * frames * frameMs) / 1000;
}
