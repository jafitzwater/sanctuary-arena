/**
 * t373u-t375u "Hero select (initial loading) screen redesign": selection state (which heroes get Enter Sanctuary,
 * Coming soon for Assassin / Druid), the blurb table, hotspot order and on-screen fit, arrow stepping, and the
 * how-to-play modal open / close rules. Pure data and state; the DOM wiring is checked headless.
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { ROSTER } from '../src/game/data/classes/roster';
import { DEFAULT_CLASS_ID } from '../src/game/data/classes';
import {
  COMING_SOON,
  HERO_ART,
  HERO_BLURBS,
  HERO_SPOTS,
  coverFit,
  heroSelectView,
  howToNext,
  isPlayableHero,
  spotBox,
  stepHero,
} from '../src/game/heroSelect';

const ORDER = ['amazon', 'assassin', 'necromancer', 'barbarian', 'paladin', 'sorceress', 'druid'];
const SPEC_X: Record<string, number> = { amazon: 335, assassin: 392, necromancer: 450, barbarian: 508, paladin: 572, sorceress: 634, druid: 700 };
const PLAYABLE = ['amazon', 'barbarian', 'necromancer', 'paladin', 'sorceress'];

// Seven heroes, left to right, at the work-order x positions (within a few reference px).
assert.deepEqual(HERO_SPOTS.map((s) => s.id), ORDER);
for (const s of HERO_SPOTS) {
  assert.ok(Math.abs(s.x - SPEC_X[s.id]) <= 4, `${s.id} x ${s.x} vs spec ${SPEC_X[s.id]}`);
  assert.ok(s.feet >= 260 && s.feet <= 292, `${s.id} feet ${s.feet}`);
  assert.ok(s.top < s.feet && s.w > 0);
  const slot = ROSTER.find((r) => r.id === s.id);
  if (slot) assert.equal(s.name, slot.name, `${s.id} name matches the roster`);
  else assert.ok(['assassin', 'druid'].includes(s.id) && s.name.length > 0, `${s.id} not in roster`);
}
for (let i = 1; i < HERO_SPOTS.length; i++) assert.ok(HERO_SPOTS[i].x > HERO_SPOTS[i - 1].x, 'left to right');
// Hotspots do not overlap.
for (let i = 1; i < HERO_SPOTS.length; i++) {
  const a = spotBox(HERO_SPOTS[i - 1]);
  const b = spotBox(HERO_SPOTS[i]);
  assert.ok(a.left + a.width <= b.left + 1e-9, `${HERO_SPOTS[i - 1].id} / ${HERO_SPOTS[i].id} hotspots overlap`);
}
// Only the sorceress has the lightning arc.
assert.deepEqual(HERO_SPOTS.filter((s) => s.fx === 'lightning').map((s) => s.id), ['sorceress']);

// Blurb table: one complete entry per hero, nothing extra.
assert.deepEqual(Object.keys(HERO_BLURBS).sort(), [...ORDER].sort());
for (const id of ORDER) assert.ok(HERO_BLURBS[id].trim().length > 20, `${id} blurb`);
assert.match(HERO_BLURBS.sorceress, /elemental magicks/);

// Selection state: Enter Sanctuary only for playable classes; Coming soon for Assassin and Druid.
assert.deepEqual(ORDER.filter(isPlayableHero).sort(), [...PLAYABLE].sort());
for (const id of ORDER) {
  const v = heroSelectView(id);
  const playable = PLAYABLE.includes(id);
  assert.equal(v.showEnter, playable, `${id} showEnter`);
  assert.equal(v.comingSoon, !playable, `${id} comingSoon`);
  assert.equal(v.blurb, playable ? HERO_BLURBS[id] : COMING_SOON, `${id} blurb shown`);
  assert.equal(v.name, HERO_SPOTS.find((s) => s.id === id)?.name);
}
assert.equal(heroSelectView('assassin').blurb, 'Coming soon');
assert.equal(heroSelectView('druid').blurb, 'Coming soon');
assert.ok(heroSelectView(DEFAULT_CLASS_ID).showEnter, 'default class can start');
assert.equal(isPlayableHero('nope'), false);

// Arrow stepping wraps.
assert.equal(stepHero('amazon', -1), 'druid');
assert.equal(stepHero('druid', 1), 'amazon');
assert.equal(stepHero('barbarian', 1), 'paladin');
assert.equal(stepHero('barbarian', -1), 'necromancer');

// Cover fit keeps every hotspot inside the 1280x720 and 844x390 viewports.
for (const [vw, vh] of [[1280, 720], [844, 390]]) {
  const f = coverFit(vw, vh);
  assert.ok(HERO_ART.width * f.scale >= vw - 1e-6 && HERO_ART.height * f.scale >= vh - 1e-6, 'covers');
  for (const s of HERO_SPOTS) {
    const l = f.left + (s.x - s.w / 2) * f.scale;
    const r = f.left + (s.x + s.w / 2) * f.scale;
    const t = f.top + s.top * f.scale;
    const b = f.top + s.feet * f.scale;
    assert.ok(l >= 0 && r <= vw && t >= 0 && b <= vh, `${s.id} on screen at ${vw}x${vh}`);
  }
}

// How-to-play modal: "?" opens (and toggles), X / Esc / click outside close, click inside and other keys keep it.
assert.equal(howToNext(false, { type: 'toggle' }), true);
assert.equal(howToNext(true, { type: 'toggle' }), false);
assert.equal(howToNext(true, { type: 'close' }), false);
assert.equal(howToNext(true, { type: 'key', key: 'Escape' }), false);
assert.equal(howToNext(true, { type: 'key', key: 'a' }), true);
assert.equal(howToNext(false, { type: 'key', key: 'Enter' }), false);
assert.equal(howToNext(true, { type: 'pointer', insideCard: false }), false);
assert.equal(howToNext(true, { type: 'pointer', insideCard: true }), true);
assert.equal(howToNext(false, { type: 'pointer', insideCard: true }), false);

// Backdrop asset is shipped and lightweight.
const bg = `public/${HERO_ART.url}`;
assert.ok(existsSync(bg), bg);
assert.ok(statSync(bg).size < 200 * 1024, `${bg} is ${statSync(bg).size} bytes`);

console.log('hero-select: ok');
