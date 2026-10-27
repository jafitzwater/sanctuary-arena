/**
 * Gap-list item 10. Stat points per level, copied from refined-design-document-oct27.md:
 * "Stat points always auto-populate. Each level gives 5 points."
 * "Barbarian 2 strength, 2 vitality, 1 dexterity, 0 energy"
 * "Amazon 2 dexterity, 2 vitality, 1 strength, 0 energy"
 * "Sorceress 2 energy, 2 vitality, 1 strength, 0 dexterity"
 * "Necromancer same as the sorceress"
 * "Paladin 2 strength, 2 dexterity, 1 vitality, 0 energy"
 * Excluded (NEEDS JOSEPH): the per-point conversions (5% of what base, add or compound),
 * starting stats. The repo's existing stat-to-number formulas are kept.
 */
export type StatKey = 'str' | 'dex' | 'vit' | 'energy';

export const STAT_GROWTH: Record<string, Record<StatKey, number>> = {
  barbarian: { str: 2, vit: 2, dex: 1, energy: 0 },
  amazon: { dex: 2, vit: 2, str: 1, energy: 0 },
  sorceress: { energy: 2, vit: 2, str: 1, dex: 0 },
  necromancer: { energy: 2, vit: 2, str: 1, dex: 0 },
  paladin: { str: 2, dex: 2, vit: 1, energy: 0 },
};
