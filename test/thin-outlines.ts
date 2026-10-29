// Thinner outlines + solid ruins (Joseph t271u): new [TEMP] values; draw only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE_OUTLINE_PX,
  CHARACTER_OUTLINE_PX,
  RUIN_ALPHA,
  TOWER_OUTLINE_PX,
  TREE_OUTLINE_PX,
  outlineOffsets,
} from '../src/game/readability';

// Outlines kept, just thinner: characters / towers / trees 2 -> 1 px, bases 2.5 -> 1.5 px.
assert.equal(CHARACTER_OUTLINE_PX, 1);
assert.equal(TOWER_OUTLINE_PX, 1);
assert.equal(TREE_OUTLINE_PX, 1);
assert.equal(BASE_OUTLINE_PX, 1.5);
for (const px of [CHARACTER_OUTLINE_PX, TOWER_OUTLINE_PX, TREE_OUTLINE_PX, BASE_OUTLINE_PX]) {
  assert.ok(px > 0, 'outline still drawn');
  const offs = outlineOffsets(px);
  assert.equal(offs.length, 8);
  for (const [x, y] of offs) assert.ok(Math.abs(Math.hypot(x, y) - px) < 1e-9);
}

// Ruins (dead towers / bases) solid; every other dead unit keeps the 0.55 fade.
assert.equal(RUIN_ALPHA, 1);
const render = readFileSync('src/game/render.ts', 'utf8');
assert.match(render, /!unit\.alive && \(unit\.kind === 'tower' \|\| unit\.kind === 'base'\)\) \{\s*ctx\.globalAlpha = RUIN_ALPHA;/);
assert.equal((render.match(/\(unit\.corpse \/ 4\.5\) \* 0\.55\) : 0\.55;/g) ?? []).length, 2, 'other dead-unit fades unchanged');

console.log('thin-outlines: ok');
