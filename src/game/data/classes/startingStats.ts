/**
 * Gap-list item 10 (batch 4): level 1 starting stats per class.
 * Implements: the starting str/dex/vit/energy table for the five doc classes.
 * Source [JOSEPH] (joseph-answers-oct27.md, answer 6):
 *   "Starting stats lvl1: Amazon Str20 Dex25 Vit20 Ene15. Barbarian 30/20/25/10.
 *    Necromancer 15/15/15/25. Paladin 25/20/25/15. Sorceress 10/15/10/35."
 * Tech design: pure data, no Phaser import, so it is testable under Node.
 * Excluded: the per-point conversions and per-level growth (statGrowth.ts, unchanged);
 * Assassin/Druid (not in the roster; Joseph's file says to ignore them).
 * Only the Barbarian has a ClassDef today; the other rows wait for their classes.
 */
import type { StatKey } from './statGrowth';

export const STARTING_STATS: Record<string, Record<StatKey, number>> = {
  // [JOSEPH] "Amazon Str20 Dex25 Vit20 Ene15"
  amazon: { str: 20, dex: 25, vit: 20, energy: 15 },
  // [JOSEPH] "Barbarian 30/20/25/10"
  barbarian: { str: 30, dex: 20, vit: 25, energy: 10 },
  // [JOSEPH] "Necromancer 15/15/15/25"
  necromancer: { str: 15, dex: 15, vit: 15, energy: 25 },
  // [JOSEPH] "Paladin 25/20/25/15"
  paladin: { str: 25, dex: 20, vit: 25, energy: 15 },
  // [JOSEPH] "Sorceress 10/15/10/35"
  sorceress: { str: 10, dex: 15, vit: 10, energy: 35 },
};
