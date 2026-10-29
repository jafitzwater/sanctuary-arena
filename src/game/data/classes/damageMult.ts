/**
 * Item 5 order (2026-10-29), Joseph t226u / t239u "Yes": the Necromancer and Sorceress start with and end with
 * less health than the other classes, so their damage is a bit higher for balance.
 *
 * Mechanism: one class damage multiplier on the hero's attack damage (combat.heroNumbers). Every basic attack and
 * every Necromancer/Sorceress skill hit is `hero.ad x skill multiplier`, so this one factor raises basic attacks and
 * skill damage together without editing each skill number. The result is rounded to a whole AD as before.
 *
 * [TEMP] +12% (order: "about +10-15%, tune later"). Other classes are 1 (unchanged).
 */
export const CASTER_DAMAGE_MULT = 1.12; // [TEMP]

export const CLASS_DAMAGE_MULT: Readonly<Record<string, number>> = {
  necromancer: CASTER_DAMAGE_MULT,
  sorceress: CASTER_DAMAGE_MULT,
};

export function classDamageMult(classId: string): number {
  return CLASS_DAMAGE_MULT[classId] ?? 1;
}
