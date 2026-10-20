/** One direction of the Spriters run cycle. The source row continues past this into the next weapon. */
export const RUN_FRAMES = 12;
/** Distance, in world units, of one full run cycle. Walk shares this fraction. */
export const RUN_CYCLE = 16 * RUN_FRAMES;

/** Frame column from normalized cycle progress. A speed change does not return to frame 0. */
export function locomotionColumn(distance: number, frames: number): number {
  if (frames <= 1) return 0;
  const frac = ((distance % RUN_CYCLE) + RUN_CYCLE) % RUN_CYCLE / RUN_CYCLE;
  return Math.floor(frac * frames) % frames;
}
