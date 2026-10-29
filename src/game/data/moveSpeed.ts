/**
 * WORK ORDER "Code engineer - LoL-STYLE SINGLE MOVEMENT SPEED" (Oct 28, Joseph approved) [JOSEPH]
 * Spec (/workspace/sanctuary-canon/movement-speed-spec.md):
 *   "League of Legends has just one movement speed. No walk vs run. Champions move at their current calculated MS."
 *   "totalMS(base, flat, addPct, multis, slows) = (base + flat) * (1 + sum addPct) * product(multis) * (1 - max slow)"
 *   "Soft caps: ms > 490 -> 415 + 75*0.8 + (ms-490)*0.5; 415-490 -> excess over 415 at 80%;
 *    floor: if ms < 220 then ms = 110 + ms*0.5." "Result * UNIT_SCALE (144/345)." [superseded: Option B, UNIT_SCALE 1.0] "Only the strongest slow applies."
 *   "Base MS at level 1: Barbarian 345, Amazon 340, Paladin 335, Necromancer 330, Sorceress 325."
 * Implemented: the pure calculation, the base MS table, and the unit scale. Phaser-free so tests can import it.
 * Excluded: no new skills, buffs or items; class speed bursts (Frenzy/Whirlwind/War Cry, Evade, Vigor aura,
 * Frozen Armor at spec values) are NOT wired here ("needs skill wiring").
 */

/**
 * [JOSEPH] Order 2026-10-29 "Movement speed scale, Option B" [JOSEPH t211u]: "Change ONLY the movement speed conversion
 * (px/s relative to nominal 335) so mid base-to-base lands at 44-47 s at average MS". 1 LoL unit = 1 world px, so
 * 335 -> 335 px/s and Barbarian 345 -> 345 px/s; measured mid base-to-base at 335 is ~45.7 s. (Was 144/345.)
 */
export const UNIT_SCALE = 1.0;

/** [JOSEPH] Base MS at level 1, in LoL units. */
export const BASE_MS: Readonly<Record<string, number>> = {
  barbarian: 345,
  amazon: 340,
  paladin: 335,
  necromancer: 330,
  sorceress: 325,
};

/** [JOSEPH] Soft caps and the low-speed floor, on raw (LoL-unit) MS. */
export function softCapMS(ms: number): number {
  if (ms > 490) return 415 + 75 * 0.8 + (ms - 490) * 0.5;
  if (ms > 415) return 415 + (ms - 415) * 0.8;
  if (ms < 220) return 110 + ms * 0.5;
  return ms;
}

/** Raw MS after flat, additive %, multiplicative and the single strongest slow, then caps/floor. LoL units. */
export function rawMS(base: number, flat = 0, addPct: readonly number[] = [], multis: readonly number[] = [], slows: readonly number[] = []): number {
  const add = addPct.reduce((sum, pct) => sum + pct, 0);
  const multi = multis.reduce((prod, m) => prod * m, 1);
  const slow = slows.reduce((max, s) => Math.max(max, s), 0);
  const ms = (base + flat) * (1 + add) * multi * (1 - Math.min(1, Math.max(0, slow)));
  return softCapMS(ms);
}

/** [JOSEPH] totalMS = capped raw MS * UNIT_SCALE, in world px/s. */
export function totalMS(base: number, flat = 0, addPct: readonly number[] = [], multis: readonly number[] = [], slows: readonly number[] = []): number {
  return rawMS(base, flat, addPct, multis, slows) * UNIT_SCALE;
}

/** Base MS for a class id; unknown ids fall back to the Barbarian's 345 [TEMP]. */
export function baseMSFor(classId: string): number {
  return BASE_MS[classId] ?? BASE_MS.barbarian;
}
