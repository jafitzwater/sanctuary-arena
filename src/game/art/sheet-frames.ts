/**
 * Frame math for the Sprite Director sheets (batch 3 item a). No DOM, so tests can import it.
 *
 * Implements: cell lookup for the class sheets and the wave-mob sheets.
 * Source: /workspace/sanctuary-assets/manifest.md (Sprite Director), quoted below.
 * Excluded: attack, cast and death frames for classes (the manifest says the concepts contain none).
 */

/**
 * Manifest: "each 576x512 px: 64x64 cells, 9 columns by 8 rows. Rows are the 8 directions in this
 * order: n, ne, e, se, s, sw, w, nw. Column 0 is idle (the stand pose). Columns 1 to 8 are the move
 * cycle". "Feet sit on the bottom row of each cell, centered horizontally (anchor 32,64)".
 * "Figure height is about 56 px [TEMP/art direction]".
 */
export const CLASS_SHEET = { cell: 64, cols: 9, rows: 8, moveFrames: 8, footX: 32, footY: 64, body: 56 } as const;

/** Classes with a sheet. Manifest: "barbarian, paladin, amazon, sorceress, necromancer". */
export const CLASS_SHEET_IDS = ['barbarian', 'paladin', 'amazon', 'sorceress', 'necromancer'] as const;

/**
 * Manifest: "384x256 sheet, 6 columns x 4 rows of 64x64 frames ... one side view facing screen-right
 * (mirror for left). Rows: idle 4, move 6, basic attack 4, death 5". "anchor bottom-center (32,64)".
 * "Figures are about 46-48 px tall" (47 used).
 */
export const MOB_SHEET = { cell: 64, cols: 6, rows: 4, footX: 32, footY: 64, body: 47 } as const;
export type MobAnim = 'idle' | 'move' | 'attack' | 'death';
export const MOB_ROWS: Record<MobAnim, { row: number; frames: number }> = {
  idle: { row: 0, frames: 4 },
  move: { row: 1, frames: 6 },
  attack: { row: 2, frames: 4 },
  death: { row: 3, frames: 5 },
};

/** Wave mobs with a sheet (doc rotation: rogues, valkyries, Act 2 and Act 3 mercenaries). */
const MOB_SHEET_FOR: Record<string, string> = {
  rogue: 'rogue',
  'rogue-archer': 'rogue',
  valkyrie: 'valkyrie',
  'act2-mercenary': 'act2-mercenary',
  'act3-mercenary': 'act3-mercenary',
};

export function mobSheetId(defId: string): string | null {
  return MOB_SHEET_FOR[defId] ?? null;
}

export function hasClassSheet(classId: string): boolean {
  return (CLASS_SHEET_IDS as readonly string[]).includes(classId);
}

/** Compass 0 is east, then clockwise (E SE S SW W NW N NE). Sheet rows run n, ne, e, se, s, sw, w, nw. */
export function classSheetRow(compass: number): number {
  const c = ((compass % 8) + 8) % 8;
  return (c + 2) % 8;
}

/** Column 0 idle; columns 1..8 the move cycle. */
export function classSheetCol(moving: boolean, frame: number): number {
  if (!moving) return 0;
  const f = ((frame % CLASS_SHEET.moveFrames) + CLASS_SHEET.moveFrames) % CLASS_SHEET.moveFrames;
  return 1 + f;
}

/** Side view faces right; west-ish compass headings (SW, W, NW) mirror. N and S keep right. */
export function mobFacesLeft(compass: number): boolean {
  const c = ((compass % 8) + 8) % 8;
  return c === 3 || c === 4 || c === 5;
}
