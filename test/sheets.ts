import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BARBARIAN_MOTION, BARBARIAN_MOTION_COLS, barbarianAttackFrame, barbarianCycleDistance, barbarianMotionCol,
  barbarianStrideFrame, hasBarbarianMotion,
  CLASS_COLS, CLASS_SHEET, CLASS_SHEET_IDS, MOB_ROWS, MOB_SHEET, classSheetCol, classSheetRow, mobSheetCol, mobSheetId, mobSheetRow,
  type SheetAnim,
} from '../src/game/art/sheet-frames';
import { cellHasFigure, cellKey, readPng } from './png';

// Manifest: rows n, ne, e, se, s, sw, w, nw. Compass 0 = E, clockwise.
assert.equal(classSheetRow(0), 2); // E
assert.equal(classSheetRow(2), 4); // S
assert.equal(classSheetRow(6), 0); // N
assert.equal(classSheetRow(7), 1); // NE
assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(classSheetRow)).size, 8);
assert.equal(classSheetCol('idle', 5), 0);
assert.equal(classSheetCol('move', 0), 1);
assert.equal(classSheetCol('move', 7), 8);
assert.equal(classSheetCol('attack', 0), 9);
assert.equal(classSheetCol('death', 4), 17);
assert.equal(mobSheetRow(6, 'idle'), 0); // N idle
assert.equal(mobSheetRow(0, 'death'), 11); // E death: 4*2+3
assert.equal(mobSheetRow(5, 'death'), 31); // NW death
assert.equal(mobSheetId('rogue-archer'), 'rogue');
assert.equal(mobSheetId('fallen'), null);

// PNG size from the IHDR chunk.
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const anims: SheetAnim[] = ['idle', 'move', 'attack', 'death'];
const frameProbe = [-3, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 15];

// Every class sheet: 8 directions x 4 states x any frame lands inside 1152x512.
for (const id of CLASS_SHEET_IDS) {
  const [w, h] = pngSize(`public/sprites/classes/${id}-full-sheet-64.png`);
  // Barbarian sheet: run 18-25, walk12 26-37, run12 38-49, attack12 50-61 (wired for the barbarian only): 62 cols = 3968 wide. Others stay 18 cols = 1152.
  const expectedW = id === 'barbarian' ? 3968 : CLASS_SHEET.cols * CLASS_SHEET.cell;
  assert.deepEqual([w, h], [expectedW, CLASS_SHEET.rows * CLASS_SHEET.cell]);
  assert.deepEqual([w, h], [id === 'barbarian' ? 3968 : 1152, 512]);
  if (id === 'barbarian') assert.equal(w / CLASS_SHEET.cell, BARBARIAN_MOTION_COLS);
  for (let c = 0; c < 8; c++) for (const a of anims) for (const f of frameProbe) {
    const row = classSheetRow(c);
    const col = classSheetCol(a, f);
    assert.ok(row >= 0 && row < CLASS_SHEET.rows, `${id} row ${row}`);
    assert.ok(col >= CLASS_COLS[a].col && col < CLASS_COLS[a].col + CLASS_COLS[a].frames && col < CLASS_SHEET.cols, `${id} ${a} col ${col}`);
  }
}

// Barbarian motion (WORK ORDER "WIRE BARBARIAN MOTION"): walk12 26-37, run12 38-49, attack12 50-61.
assert.equal(hasBarbarianMotion(62), true);
assert.equal(hasBarbarianMotion(26), false); // old 1664-wide sheet -> old columns
for (const [a, first] of [['walk', 26], ['run', 38], ['attack', 50]] as const) {
  for (const f of [-13, -1, 0, 5, 11, 12, 25]) {
    const col = barbarianMotionCol(a, f);
    assert.ok(col >= first && col < first + 12 && col < BARBARIAN_MOTION_COLS, `barbarian ${a} col ${col}`);
  }
  assert.equal(barbarianMotionCol(a, 0), first);
  assert.equal(barbarianMotionCol(a, 11), first + 11);
}
// Stride follows distance: at the class walk speed (144) a 12-frame loop takes the manifest 0.96 s.
const walkLoop = barbarianCycleDistance('walk', 144);
assert.ok(Math.abs(walkLoop - 144 * 0.96) < 1e-9);
assert.ok(Math.abs(barbarianCycleDistance('run', 216) - 216 * 0.72) < 1e-9);
assert.equal(barbarianStrideFrame(0, walkLoop), 0);
assert.equal(barbarianStrideFrame(walkLoop / 2, walkLoop), 6); // contact frame 6 at half loop
assert.equal(barbarianStrideFrame(walkLoop * 3 + 1e-6, walkLoop), 0);
// Half the speed -> the same distance takes twice as long, but the frame for a distance is unchanged.
for (let f = 0; f < 12; f++) assert.equal(barbarianStrideFrame((walkLoop / 12) * (f + 0.5), walkLoop), f);
// Attack: windup spans frames 0-6, impact frame 7 at the hit (backswing start), recovery to 11.
assert.equal(barbarianAttackFrame('Windup', 0, 1), 0);
assert.equal(barbarianAttackFrame('Windup', 299, 1), 6);
assert.equal(barbarianAttackFrame('Backswing', 0, 1), BARBARIAN_MOTION.attack.impact);
assert.equal(barbarianAttackFrame('Backswing', 1e6, 1), 11);
assert.equal(barbarianAttackFrame('Windup', 1e6, 0.5), 6);
for (const ph of ['Windup', 'Backswing'] as const) for (let ms = 0; ms <= 400; ms += 7) {
  const fr = barbarianAttackFrame(ph, ms, 1.1);
  assert.ok(fr >= 0 && fr < 12);
}

// Every mob sheet: 8 directions x 4 states x any frame lands inside 384x2048, within its direction block.
for (const id of ['rogue', 'valkyrie', 'act2-mercenary', 'act3-mercenary']) {
  const [w, h] = pngSize(`public/sprites/mobs/${id}-full-sheet-64.png`);
  assert.deepEqual([w, h], [MOB_SHEET.cols * MOB_SHEET.cell, MOB_SHEET.rows * MOB_SHEET.cell]);
  assert.deepEqual([w, h], [384, 2048]);
  const rows = new Set<number>();
  for (let c = 0; c < 8; c++) for (const a of anims) {
    const row = mobSheetRow(c, a);
    rows.add(row);
    assert.ok(row >= 0 && row < MOB_SHEET.rows, `${id} row ${row}`);
    assert.equal(Math.floor(row / MOB_SHEET.rowsPerDir), classSheetRow(c));
    for (const f of frameProbe) {
      const col = mobSheetCol(a, f);
      assert.ok(col >= 0 && col < MOB_ROWS[a].frames && col < MOB_SHEET.cols, `${id} ${a} col ${col}`);
    }
  }
  assert.equal(rows.size, 32);
}

// ---- Standing sheet test (Joseph, Oct 27 2026): for every class and mob sheet and every animation block,
// (1) all 8 directions exist and every frame cell has a figure; (2) no two directions are pixel-identical.
// Class sheets: no mirrored rows either. Mob sheets: ONLY the manifest mirrors (w from e, sw from se, nw from ne), exactly that pairing.
const failures: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) failures.push(msg); };
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const; // sheet row order
// Class blocks (cols): idle 0, walk 1-8, attack 9-12, death 13-17, plus run 18-25, walk12 26-37, run12 38-49, attack12 50-61 on the barbarian sheet.
const CLASS_BLOCKS: Array<{ name: string; col: number; frames: number; only?: string }> = [
  { name: 'idle', col: 0, frames: 1 }, { name: 'walk', col: 1, frames: 8 }, { name: 'attack', col: 9, frames: 4 },
  { name: 'death', col: 13, frames: 5 }, { name: 'run', col: 18, frames: 8, only: 'barbarian' },
  { name: 'walk12', col: 26, frames: 12, only: 'barbarian' }, { name: 'run12', col: 38, frames: 12, only: 'barbarian' },
  { name: 'attack12', col: 50, frames: 12, only: 'barbarian' },
];
for (const id of CLASS_SHEET_IDS) {
  const png = readPng(`public/sprites/classes/${id}-full-sheet-64.png`);
  for (const b of CLASS_BLOCKS) {
    if (b.only && b.only !== id) continue;
    const keys = DIRS.map((_, r) => { const k: string[] = []; for (let f = 0; f < b.frames; f++) {
      check(cellHasFigure(png, b.col + f, r), `${id} ${b.name} ${DIRS[r]} frame ${f} is empty`);
      k.push(cellKey(png, b.col + f, r)); } return k.join('|'); });
    const flipped = DIRS.map((_, r) => { const k: string[] = []; for (let f = 0; f < b.frames; f++) k.push(cellKey(png, b.col + f, r, 64, true)); return k.join('|'); });
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      check(keys[i] !== keys[j], `${id} ${b.name}: ${DIRS[i]} and ${DIRS[j]} are pixel-identical`);
      check(keys[i] !== flipped[j], `${id} ${b.name}: ${DIRS[i]} is a mirror of ${DIRS[j]}`);
    }
  }
}
// Mob blocks: per direction 4 rows: idle 4 frames, move 6, attack 4, death 5.
const MOB_BLOCKS = [{ name: 'idle', off: 0, frames: 4 }, { name: 'move', off: 1, frames: 6 }, { name: 'attack', off: 2, frames: 4 }, { name: 'death', off: 3, frames: 5 }];
const MOB_MIRRORS = new Set(['e-w', 'se-sw', 'ne-nw']); // manifest: w from e, sw from se, nw from ne
for (const id of ['rogue', 'valkyrie', 'act2-mercenary', 'act3-mercenary']) {
  const png = readPng(`public/sprites/mobs/${id}-full-sheet-64.png`);
  for (const b of MOB_BLOCKS) {
    const keys = DIRS.map((_, d) => { const k: string[] = []; for (let f = 0; f < b.frames; f++) {
      check(cellHasFigure(png, f, d * 4 + b.off), `${id} ${b.name} ${DIRS[d]} frame ${f} is empty`);
      k.push(cellKey(png, f, d * 4 + b.off)); } return k.join('|'); });
    const flipped = DIRS.map((_, d) => { const k: string[] = []; for (let f = 0; f < b.frames; f++) k.push(cellKey(png, f, d * 4 + b.off, 64, true)); return k.join('|'); });
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      check(keys[i] !== keys[j], `${id} ${b.name}: ${DIRS[i]} and ${DIRS[j]} are pixel-identical`);
      const pair = `${DIRS[i]}-${DIRS[j]}`, rev = `${DIRS[j]}-${DIRS[i]}`;
      const isMirror = keys[i] === flipped[j];
      const allowed = MOB_MIRRORS.has(pair) || MOB_MIRRORS.has(rev);
      check(isMirror === allowed, `${id} ${b.name}: ${pair} ${isMirror ? 'is an unexpected mirror' : 'should be the manifest mirror but is not'}`);
    }
  }
}
assert.equal(failures.length, 0, `${failures.length} sheet failure(s):\n${failures.join('\n').slice(0, 3000)}`);
console.log('sheets ok');
