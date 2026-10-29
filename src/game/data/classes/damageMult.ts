/**
 * Item 5 (2026-10-29, Joseph t226u / t239u) and Item 5 follow-up (Joseph t242u): the Necromancer and Sorceress have
 * less health than the other classes, so their damage is a bit higher for balance, and it scales with level the way
 * Wild Rift casters do ("align it with the way LoL mobile handles their casters").
 *
 * Mechanism (replaces PR #81's flat x1.12 AD multiplier): a caster AD bonus that grows with champion level,
 *   bonus(level) = CASTER_AD_BONUS_L1 + CASTER_AD_PER_LEVEL x (level - 1)
 * added to the class's AD before rounding. Every basic attack and every Necromancer/Sorceress skill hit is
 * `AD x skill multiplier`, so basic and skill damage grow together with level (as Wild Rift base damage and AP
 * scaling). Players: combat.heroNumbers (player level). Bots of these classes: botAd below, applied at spawn and on
 * every bot level change (combat.syncChampionLevels); other bots keep their flat BOT_BASE_AD.
 * Other classes: 0 bonus (unchanged). The class's own stat-point AD (adPerStr/adPerDex, 0 for casters) and item AD
 * add on top unchanged.
 */
export const CASTER_CLASSES: readonly string[] = ['necromancer', 'sorceress'];
/** [TEMP] Extra AD at level 1 (15 -> 16). */
export const CASTER_AD_BONUS_L1 = 1;
/** [TEMP] Extra AD per level after 1 (level 7: 18.1 -> 18; level 15: 20.9 -> 21). */
export const CASTER_AD_PER_LEVEL = 0.35;
/** Flat AD every bot champion spawns with (sim.spawnHero; unchanged for non-caster bots). */
export const BOT_BASE_AD = 15;

export function isCaster(classId: string): boolean {
  return CASTER_CLASSES.includes(classId);
}

/** Level-based caster AD bonus; 0 for other classes. Not rounded (callers round the total). */
export function casterAdBonus(classId: string, level: number): number {
  if (!isCaster(classId)) return 0;
  return CASTER_AD_BONUS_L1 + CASTER_AD_PER_LEVEL * Math.max(0, level - 1);
}

/** Bot champion AD at a level: flat BOT_BASE_AD plus the caster bonus (same as players) for casters. */
export function botAd(classId: string, level: number): number {
  return Math.max(1, Math.round(BOT_BASE_AD + casterAdBonus(classId, level)));
}
