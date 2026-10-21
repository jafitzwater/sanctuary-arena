import assert from 'node:assert/strict';
import { advanceHeroPhase } from '../src/game/art/figures';
import { attackSheetFrame, compassRow, cycleFrame, FLARE_TO_COMPASS } from '../src/game/art/flare-frames';

const rows = FLARE_TO_COMPASS.map((row, direction) => compassRow(direction) === row);
assert.ok(rows.every(Boolean));
assert.equal(new Set(FLARE_TO_COMPASS).size, 8);
assert.equal(compassRow(5), 0);
assert.equal(compassRow(7), 2);
assert.equal(compassRow(0), 3);

assert.equal(cycleFrame(0, 8), 0);
assert.equal(cycleFrame(0.99, 4), 3);
assert.equal(cycleFrame(1, 4), 0);

const walked = advanceHeroPhase(0, 'walk', 0.25);
assert.equal(walked, 1);
assert.equal(cycleFrame(walked, 8), 0);
const ran = advanceHeroPhase(0, 'run', 0.16);
assert.ok(Math.abs(ran - 1) < 1e-9);
assert.equal(cycleFrame(advanceHeroPhase(0, 'idle', 1), 4), 0);

assert.equal(attackSheetFrame('Windup', 0, 1, 4), 0);
assert.equal(attackSheetFrame('Backswing', 0, 1, 4), 2);
assert.equal(attackSheetFrame('Backswing', 1000, 1, 4), 3);

console.log('sprites ok');
