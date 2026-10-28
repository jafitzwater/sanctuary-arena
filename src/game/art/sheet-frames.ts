/**
 * Frame math for the Sprite Director full 8-direction sheets. No DOM, so tests can import it.
 *
 * Implements: cell lookup (idle, walk, attack, death x 8 directions) for the class and wave-mob full sheets.
 * Source: /workspace/sanctuary-assets/manifest.md, "Full 8-direction sheets (Oct 27)", quoted below.
 * Art: idle/walk class frames are Joseph's supplied concepts; every class attack/death frame and the mob
 * n/ne/se/s(+mirrored sw/nw) views are derived [TEMP/art direction] per the manifest.
 * Excluded: cast/skill frames (not in the sheets); anything the manifest does not list.
 */

/**
 * Manifest: "Direction order everywhere: n, ne, e, se, s, sw, w, nw (e = screen-right, w = screen-left,
 * s = toward camera, n = away)". "All cells are 64x64 ... anchor at bottom-center (32,64)".
 */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/**
 * Manifest: "characters/{barbarian,paladin,amazon,sorceress,necromancer}-full-sheet-64.png, 1152x512
 * (18 cols x 8 rows). Row = direction. Col 0 idle, cols 1-8 walk (8), cols 9-12 attack (4: wind-up,
 * strike, follow-through, recover), cols 13-17 death (5: stand, 20° tilt, 55° tilt, flat, flat held and
 * darkened)." Attack and death columns are derived [TEMP/art direction].
 * Old manifest: "Figure height is about 56 px [TEMP/art direction]".
 */
export const CLASS_SHEET = { cell: 64, cols: 18, rows: 8, footX: 32, footY: 64, body: 56 } as const;
export type SheetAnim = 'idle' | 'move' | 'attack' | 'death';
export const CLASS_COLS: Record<SheetAnim, { col: number; frames: number }> = {
  idle: { col: 0, frames: 1 },
  move: { col: 1, frames: 8 },
  attack: { col: 9, frames: 4 }, // [TEMP/art direction]
  death: { col: 13, frames: 5 }, // [TEMP/art direction]
};

/** Classes with a sheet. Manifest: "barbarian, paladin, amazon, sorceress, necromancer". */
export const CLASS_SHEET_IDS = ['barbarian', 'paladin', 'amazon', 'sorceress', 'necromancer'] as const;

/**
 * Manifest: "mobs/{rogue,valkyrie,act2-mercenary,act3-mercenary}-full-sheet-64.png, 384x2048 (6 cols x
 * 32 rows). For each direction in order, 4 rows: idle (4 frames, cols 4-5 empty), move (6), attack (4,
 * cols 4-5 empty), death (5, col 5 empty). Direction d starts at row 4*index(d)."
 * n/ne/se/s views and all procedural frames are [TEMP/art direction]; w = e mirrored, sw/nw mirrored in the
 * sheet itself, so no runtime flip. Old manifest: "Figures are about 46-48 px tall" (47 used).
 */
export const MOB_SHEET = { cell: 64, cols: 6, rows: 32, rowsPerDir: 4, footX: 32, footY: 64, body: 47 } as const;
export type MobAnim = SheetAnim;
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

function wrap(n: number, m: number): number {
  return ((Math.floor(n) % m) + m) % m;
}

/** Compass 0 is east, then clockwise (E SE S SW W NW N NE). Returns the index into DIRECTIONS. */
export function directionIndex(compass: number): number {
  return (wrap(compass, 8) + 2) % 8;
}

/** Class sheet row = direction index. */
export function classSheetRow(compass: number): number {
  return directionIndex(compass);
}

/** Class sheet column for an animation and frame (frame wraps within the animation's frame count). */
export function classSheetCol(anim: SheetAnim, frame: number): number {
  const { col, frames } = CLASS_COLS[anim];
  return col + wrap(frame, frames);
}

/** Mob sheet row: 4 * direction index + animation row. */
export function mobSheetRow(compass: number, anim: MobAnim): number {
  return MOB_SHEET.rowsPerDir * directionIndex(compass) + MOB_ROWS[anim].row;
}

/** Mob sheet column (frame wraps within the animation's frame count). */
export function mobSheetCol(anim: MobAnim, frame: number): number {
  return wrap(frame, MOB_ROWS[anim].frames);
}
