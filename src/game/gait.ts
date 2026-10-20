/** One direction of the Spriters run cycle. The source row continues past this into the next weapon. */
export const RUN_FRAMES = 12;
/** Fixed run cadence. The column is time, not distance. */
export const RUN_FRAME_MS = 70;
/**
 * Walk sheets are four columns (light 151, medium 140, heavy 160).
 * A 12-column slice of those widths is not an integer cell.
 */
export const WALK_FRAMES = 4;
export const WALK_FRAME_MS = 100;

/** currentFrame = floor(elapsedAnimTime / frameDuration) % totalFrames. */
export function animFrame(elapsedMs: number, frameMs: number, totalFrames: number): number {
  if (totalFrames <= 1 || frameMs <= 0) return 0;
  const elapsed = elapsedMs < 0 ? 0 : elapsedMs;
  return Math.floor(elapsed / frameMs) % totalFrames;
}
