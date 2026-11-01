/**
 * t373u-t375u "Hero select (initial loading) screen redesign": selection state (which heroes get Enter Sanctuary,
 * Coming soon for Assassin / Druid), the blurb table, hotspot order and on-screen fit, arrow stepping, and the
 * how-to-play modal open / close rules. Pure data and state; the DOM wiring is checked headless.
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { ROSTER } from '../src/game/data/classes/roster';
import { DEFAULT_CLASS_ID } from '../src/game/data/classes';
import { HeroSelectFx } from '../src/game/heroSelectFx';
import {
  COMING_SOON,
  HERO_EFFECTS,
  LIT_LUM,
  STAND_BACK_LUM,
  heroLook,
  heroLooks,
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
// t378u: every hero has its own effect config; only the Sorceress has the lightning arc.
assert.deepEqual(Object.keys(HERO_EFFECTS).sort(), [...ORDER].sort());
const WANT_FX: Record<string, string> = { amazon: 'sparks', assassin: 'cold', necromancer: 'souls', barbarian: 'rage', paladin: 'holy', sorceress: 'lightning', druid: 'cold' };
for (const id of ORDER) {
  const e = HERO_EFFECTS[id];
  assert.equal(e.fx, WANT_FX[id], `${id} effect`);
  for (const c of [...e.glow, ...e.accent]) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255, `${id} colour`);
  assert.ok(e.strength > 0 && e.strength <= 1, `${id} strength`);
  // Coming soon heroes play a subtle version; the five playable ones play it in full.
  assert.equal(e.strength < 1, !PLAYABLE.includes(id), `${id} strength vs playable`);
}
assert.deepEqual(ORDER.filter((id) => HERO_EFFECTS[id].fx === 'lightning'), ['sorceress']);

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

// t378u: one hero highlighted at a time; everyone else stands back at a common level.
for (const sel of ORDER) {
  const looks = heroLooks(sel);
  assert.deepEqual(looks.map((l) => l.id), ORDER);
  assert.deepEqual(looks.filter((l) => l.lit).map((l) => l.id), [sel], `only ${sel} lit`);
  for (const l of looks) {
    const spot = HERO_SPOTS.find((s) => s.id === l.id)!;
    if (l.lit) {
      assert.ok(l.gain === 1 && l.lift > 1 && l.glow > 0 && l.sway && l.fx === HERO_EFFECTS[l.id].fx, `${l.id} lit look`);
      // Lit heroes reach about the same brightness, whatever the backdrop baked in.
      assert.ok(spot.lum * l.lift >= LIT_LUM * 0.8, `${l.id} lit bright enough (${(spot.lum * l.lift).toFixed(1)})`);
    } else {
      assert.ok(l.gain < 1 && l.lift === 0 && l.glow === 0 && !l.sway && l.fx === null, `${l.id} stands back under ${sel}`);
      assert.ok(spot.lum * l.gain <= STAND_BACK_LUM + 1e-9, `${l.id} back level (${(spot.lum * l.gain).toFixed(1)})`);
    }
  }
}
// The baked-in Sorceress (about twice as bright in the art) gets the most shade when she stands back.
const back = (id: string) => heroLook(id, 'barbarian').gain;
assert.ok(ORDER.filter((id) => id !== 'sorceress' && id !== 'barbarian').every((id) => back('sorceress') < back(id)));
assert.ok(HERO_SPOTS.find((s) => s.id === 'sorceress')!.lum * back('sorceress') <= STAND_BACK_LUM);
// Unknown selection: nobody lit.
assert.equal(heroLooks('nobody').filter((l) => l.lit).length, 0);

// t378u state reset, on the real renderer with a recording 2D context: after any selection history (re-select,
// rapid switching, Coming soon heroes), a frame draws exactly what a fresh screen with that selection draws,
// and the previous hero gets no lift, glow, lightning or sway, only the stand-back shade.
type Rec = { op: string; args: unknown[] };
class FakeGradient {
  stops: string[] = [];
  addColorStop(_o: number, c: string): void {
    this.stops.push(c);
  }
}
function fakeCanvas(log: Rec[] | null) {
  let tx = 0;
  const stack: number[] = [];
  const ctx = new Proxy(
    { fillStyle: '' as unknown, strokeStyle: '' as unknown, globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineJoin: '', lineCap: '' },
    {
      get(target, key: string) {
        if (key in target) return (target as Record<string, unknown>)[key];
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => new FakeGradient();
        return (...args: unknown[]) => {
          if (key === 'translate') tx += args[0] as number;
          if (key === 'save') stack.push(tx);
          if (key === 'restore') tx = stack.pop() ?? 0;
          if (key === 'setTransform') tx = 0;
          if (!log) return;
          if (key === 'drawImage') log.push({ op: 'drawImage', args: [Math.round(((args[1] as number) + (args[3] as number) / 2) * 10) / 10] });
          if (key === 'fill') {
            const f = target.fillStyle;
            log.push({ op: 'fill', args: [Math.round(tx), f instanceof FakeGradient ? f.stops.join('|') : String(f)] });
          }
          if (key === 'stroke') {
            const st = target.strokeStyle;
            log.push({ op: 'stroke', args: [Math.round(tx), st instanceof FakeGradient ? st.stops.join('|') : String(st)] });
          }
        };
      },
      set(target, key: string, value) {
        (target as Record<string, unknown>)[key] = value;
        return true;
      },
    },
  );
  return { width: 0, height: 0, clientWidth: 1024, clientHeight: 420, getContext: () => ctx };
}
const g = globalThis as Record<string, unknown>;
const hadDoc = 'document' in g;
const hadWin = 'window' in g;
g.document = { createElement: () => fakeCanvas(null) };
g.window = { devicePixelRatio: 1 };
const art = { complete: true, naturalWidth: 1920, naturalHeight: 787 } as unknown as HTMLImageElement;
const frame = (fx: HeroSelectFx, log: Rec[], sel: string, time: number) => {
  log.length = 0;
  fx.draw(time, sel, false);
  return JSON.stringify(log);
};
const shared: Rec[] = [];
const used = new HeroSelectFx(fakeCanvas(shared) as unknown as HTMLCanvasElement, art);
const history = ['sorceress', 'barbarian', 'sorceress', 'sorceress', 'assassin', 'sorceress', 'druid', 'sorceress', 'paladin', 'necromancer', 'sorceress', 'amazon'];
let time = 3.1;
for (const sel of history) {
  for (let f = 0; f < 3; f++) frame(used, shared, sel, (time += 1 / 240)); // rapid: a few frames each
  for (const next of ORDER) {
    const freshLog: Rec[] = [];
    const fresh = new HeroSelectFx(fakeCanvas(freshLog) as unknown as HTMLCanvasElement, art);
    assert.equal(frame(used, shared, next, time), frame(fresh, freshLog, next, time), `after ${sel}, ${next} frame matches a fresh screen`);
  }
}
const lightningStrokes = (log: Rec[]) => log.filter((r) => r.op === 'stroke' && String(r.args[1]).startsWith('rgba(245, 248, 255'));
for (const sel of ORDER) {
  frame(used, shared, 'sorceress', (time += 0.05));
  assert.ok(lightningStrokes(shared).length > 0, 'sorceress frame has lightning');
  frame(used, shared, sel, (time += 0.05));
  const lifts = shared.filter((r) => r.op === 'drawImage').map((r) => r.args[0] as number);
  const spot = HERO_SPOTS.find((s) => s.id === sel)!;
  assert.ok(lifts.length >= 2 && lifts.every((x) => Math.abs(x - spot.x) < 1.5), `${sel}: only ${sel} is lifted (${lifts})`);
  if (sel !== 'sorceress') {
    assert.equal(lightningStrokes(shared).length, 0, `no lightning left after switching to ${sel}`);
    const sorcX = HERO_SPOTS.find((s) => s.id === 'sorceress')!.x;
    const atSorc = shared.filter((r) => r.op !== 'drawImage' && Math.abs((r.args[0] as number) - sorcX) < 2);
    assert.ok(atSorc.length >= 1 && atSorc.every((r) => r.op === 'fill' && String(r.args[1]).startsWith('rgba(4, 3, 2')), `sorceress only gets the stand-back shade under ${sel}`);
  }
}
if (!hadDoc) delete g.document;
if (!hadWin) delete g.window;

console.log('hero-select: ok');
