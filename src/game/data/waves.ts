/**
 * Gap-list items 2 and 6: support-wave size, timing, strength and mob rotation.
 * Sources (refined-design-document-oct27.md, numbers-table.md):
 * "One wave on one roadway is 5 support mobs."
 * "After the first wave, a new wave spawns every 60 seconds."
 * "Each wave gets 1/5th stronger." + [WO] "1.2x ... compounding" -> wave n = 1.2^(n-1).
 * "They spawn in series, two waves each, then loop: rogues, valkyries, Act 2 mercenaries, Act 3 mercenaries."
 * "Each roadway gets each mob type."
 * Excluded (NEEDS JOSEPH): mob base stats, which stats "stronger" scales (the repo's existing
 * hp/ad scaling is kept and now driven by wave number), mob skills (cooldowns/effects unset).
 */
export const WAVE_SIZE = 5;
export const WAVE_INTERVAL = 60;
export const WAVE_GROWTH = 1.2;
export const WAVE_ROTATION = ['rogue', 'valkyrie', 'act2-mercenary', 'act3-mercenary'] as const;

/** Mob type of wave n (1-based): two waves each, then loop. */
export function waveMob(n: number): string {
  return WAVE_ROTATION[Math.floor((Math.max(1, n) - 1) / 2) % WAVE_ROTATION.length];
}

/** Strength multiplier of wave n (1-based), compounding. */
export function waveStrength(n: number): number {
  return Math.pow(WAVE_GROWTH, Math.max(1, n) - 1);
}
