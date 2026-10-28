/**
 * Gap-list item 15, batch 4: cave bosses replace the wilderness dens.
 * Doc (refined-design-document-oct27.md):
 *   "Off the path, in the ground between all 3 roadways, are small open caves with medium
 *    bosses for extra experience and gold. Those bosses are the Countess, Radament in the
 *    Act 2 sewers, the Council in Act 3, and Izule in Act 4. Either side can take them."
 *   "A boss drops a health potion and a mana potion instead."
 *   "A boss is back after 3 minutes, with a notice of respawn. If there is no attack for
 *    60 seconds in the cave, that boss's health goes back to 100%."
 * [JOSEPH] (joseph-answers-oct27.md, answer 2):
 *   "Caves: Countess HP800 dmg25-40 cold/light resist 50% drop rune(low)/unique ring.
 *    Radament HP1200 poison+melee, drop skill book/unique amulet. Council 3x ~1000HP mixed
 *    elemental, drop unique weapon/high rune chance. Izual HP2000 cold dmg high cold resist,
 *    drop unique armor. (Respawn 180s, reset 60s per doc.)"
 * Tech design: pure data, no Phaser import.
 * Excluded (NEEDS JOSEPH): resistances and elemental/poison damage (the repo has no damage
 * types), rune/unique/skill-book drops (no loot system), damage numbers for Radament, the
 * Council and Izual, gold/xp amounts, exact cave coordinates.
 */
export const CAVE_RESPAWN = 180; // [DOC] "back after 3 minutes" / [JOSEPH] "Respawn 180s"
export const CAVE_RESET = 60; // [DOC] "no attack for 60 seconds" / [JOSEPH] "reset 60s"

export interface CaveBoss {
  /** UnitDef id. */
  unit: string;
  name: string;
  count: number;
}

export const CAVE_BOSSES: CaveBoss[] = [
  { unit: 'countess', name: 'The Countess', count: 1 },
  { unit: 'radament', name: 'Radament', count: 1 },
  // [JOSEPH] "Council 3x ~1000HP"
  { unit: 'council-member', name: 'Council Member', count: 3 },
  // Doc spells it "Izule"; Joseph's answer spells it "Izual" (the D2 name), used here.
  { unit: 'izual', name: 'Izual', count: 1 },
];
