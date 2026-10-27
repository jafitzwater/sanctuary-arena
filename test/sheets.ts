import assert from 'node:assert/strict';
import { CLASS_SHEET, MOB_ROWS, MOB_SHEET, classSheetCol, classSheetRow, mobFacesLeft, mobSheetId } from '../src/game/art/sheet-frames';

// Manifest: rows n, ne, e, se, s, sw, w, nw. Compass 0 = E, clockwise.
assert.equal(classSheetRow(0), 2); // E
assert.equal(classSheetRow(2), 4); // S
assert.equal(classSheetRow(6), 0); // N
assert.equal(classSheetRow(7), 1); // NE
assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(classSheetRow)).size, 8);
assert.equal(classSheetCol(false, 5), 0);
assert.equal(classSheetCol(true, 0), 1);
assert.equal(classSheetCol(true, 7), 8);
assert.equal(CLASS_SHEET.cols * CLASS_SHEET.cell, 576);
assert.equal(CLASS_SHEET.rows * CLASS_SHEET.cell, 512);
assert.equal(MOB_SHEET.cols * MOB_SHEET.cell, 384);
assert.equal(MOB_SHEET.rows * MOB_SHEET.cell, 256);
for (const r of Object.values(MOB_ROWS)) assert.ok(r.frames <= MOB_SHEET.cols);
assert.equal(mobSheetId('rogue-archer'), 'rogue');
assert.equal(mobSheetId('fallen'), null);
assert.equal(mobFacesLeft(4), true);
assert.equal(mobFacesLeft(0), false);
console.log('sheets ok');
