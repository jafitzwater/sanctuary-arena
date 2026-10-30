/**
 * Order "Fix sprite facing direction" [JOSEPH t298u]: the drawn sheet row must match the on-screen direction
 * of movement / aim in all 8 directions (right = E row, up = N row, ...), for every view turn.
 * Rows are screen directions per the manifest ("n, ne, e, se, s, sw, w, nw; e = screen-right, s = toward camera").
 */
import assert from 'node:assert/strict';
import { DIRECTIONS, classSheetRow, mobSheetRow, MOB_SHEET } from '../src/game/art/sheet-frames';
import { heroHoldCompass } from '../src/game/gait';
import { projectIso, screenVectorToWorld } from '../src/game/iso';
import { directionFromView, facingToScreen, screenToFacing, toView, type ViewTurns } from '../src/game/view';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Angular closeness (handles the +-pi seam). */
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(wrap(a - b)) < eps, `${a} vs ${b}`);
/** Arrow keys / stick, screen vector (x right, y down) -> expected row name. */
const SCREEN: Record<string, [number, number]> = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
};
/** Compass index (0 = screen east, clockwise) used by class, mob and Flare rows. */
const COMPASS: Record<string, number> = { e: 0, se: 1, s: 2, sw: 3, w: 4, nw: 5, n: 6, ne: 7 };
const W = 12000;
const H = 12000;

for (const turns of [0, 1, 2, 3] as ViewTurns[]) {
  // 1. Movement: the stick path (input.ts) turns a screen vector into a world direction; the row drawn
  //    for that facing must be the same screen direction.
  for (const [name, [sx, sy]] of Object.entries(SCREEN)) {
    const view = screenVectorToWorld(sx, sy);
    const world = directionFromView(view.x, view.y, turns);
    const facing = Math.atan2(world.y, world.x);
    near(wrap(facingToScreen(facing, turns)), wrap(Math.atan2(sy, sx)));
    const compass = heroHoldCompass(null, facingToScreen(facing, turns));
    assert.equal(compass, COMPASS[name], `turns ${turns} move ${name}: compass`);
    assert.equal(DIRECTIONS[classSheetRow(compass)], name, `turns ${turns} move ${name}: class row`);
    assert.equal(DIRECTIONS[Math.floor(mobSheetRow(compass, 'move') / MOB_SHEET.rowsPerDir)], name, `turns ${turns} ${name}: mob row`);
  }
  // 2. Aim (attack faces the target): a facing toward any world offset draws the row of the sector the
  //    target actually sits in on screen (same projection the renderer uses).
  const o = toView(0, 0, turns, W, H);
  for (let deg = 0; deg < 360; deg += 1) {
    const a = (deg * Math.PI) / 180;
    const v = toView(Math.cos(a) * 100, Math.sin(a) * 100, turns, W, H);
    const p = projectIso(v.x - o.x, v.y - o.y, 1, 0, 0);
    const screen = Math.atan2(p.y, p.x);
    const sector = screen / (Math.PI / 4);
    if (Math.abs(sector - Math.round(sector)) > 0.5 - 0.02) continue; // skip exact sector borders
    const expected = ((Math.round(sector) % 8) + 8) % 8;
    near(wrap(facingToScreen(a, turns)), wrap(screen), 1e-9);
    assert.equal(heroHoldCompass(null, facingToScreen(a, turns)), expected, `turns ${turns} aim ${deg} deg`);
  }
  // 3. screenToFacing is the inverse (used for the snapped `shown` world angle).
  for (let k = 0; k < 8; k++) near(wrap(facingToScreen(screenToFacing((k * Math.PI) / 4, turns), turns)), wrap((k * Math.PI) / 4));
}

// 4. The PR #93 finding, pinned for the default view (turns 1): right is the E row, not NE; up is N, not NW.
const rowFor = (sx: number, sy: number) => {
  const view = screenVectorToWorld(sx, sy);
  const world = directionFromView(view.x, view.y, 1);
  return DIRECTIONS[classSheetRow(heroHoldCompass(null, facingToScreen(Math.atan2(world.y, world.x), 1)))];
};
assert.equal(rowFor(1, 0), 'e');
assert.equal(rowFor(0, -1), 'n');
assert.equal(rowFor(-1, 0), 'w');
assert.equal(rowFor(0, 1), 's');

console.log('sprite-facing ok');
