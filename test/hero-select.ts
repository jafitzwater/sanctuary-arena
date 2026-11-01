/**
 * t373u-t375u "Hero select (initial loading) screen redesign": selection state (which heroes get Enter Sanctuary,
 * Coming soon for Assassin / Druid), the blurb table, hotspot order and on-screen fit, arrow stepping, and the
 * how-to-play modal open / close rules. Pure data and state; the DOM wiring is checked headless.
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { ROSTER } from '../src/game/data/classes/roster';
import { DEFAULT_CLASS_ID } from '../src/game/data/classes';
import { HeroSelectFx, SORC_RAISED_HAND, SORC_STAFF_TIP, type HeroLayerImages } from '../src/game/heroSelectFx';
import { FORWARD_STEP, HERO_ART_LAYERS } from '../src/game/heroSelectArt';
import {
  COMING_SOON,
  HERO_BASE,
  HERO_EFFECTS,
  STAND_BACK_GAIN,
  forwardPoint,
  forwardRect,
  heroLayerUrls,
  plateRect,
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
// t389u: no per-class effects any more; only the Sorceress keeps her (live canvas) lightning.
assert.deepEqual(Object.keys(HERO_EFFECTS).sort(), [...ORDER].sort());
assert.deepEqual(ORDER.filter((id) => HERO_EFFECTS[id] === 'lightning'), ['sorceress']);
assert.deepEqual(ORDER.filter((id) => HERO_EFFECTS[id] !== null), ['sorceress']);

// t389u forward layers: every hero has a forward cutout and a clean plate, shipped and light.
assert.deepEqual(Object.keys(HERO_ART_LAYERS).sort(), [...ORDER].sort());
assert.deepEqual(FORWARD_STEP, { scale: 1.22, dy: 41 });
let layerBytes = 0;
for (const id of ORDER) {
  for (const url of Object.values(heroLayerUrls(id))) {
    const file = `public/${url}`;
    assert.ok(existsSync(file), file);
    layerBytes += statSync(file).size;
    assert.ok(statSync(file).size < 60 * 1024, `${file} is ${statSync(file).size} bytes`);
  }
  const art = HERO_ART_LAYERS[id];
  const spot = HERO_SPOTS.find((s) => s.id === id)!;
  const fr = forwardRect(id)!;
  const pr = plateRect(id)!;
  // Step forward: 1.22x the standing size, pivoting on the feet (same x), feet 41 base px lower.
  assert.ok(Math.abs(fr.w - art.forward[2] * 1.22 * HERO_BASE.scale) < 1e-9 && Math.abs(fr.h - art.forward[3] * 1.22 * HERO_BASE.scale) < 1e-9, `${id} scale`);
  const feetX = HERO_BASE.x + art.feet[0] * HERO_BASE.scale;
  const u = (art.feet[0] - art.forward[0]) / art.forward[2];
  assert.ok(Math.abs(fr.x + u * fr.w - feetX) < 1e-9, `${id} pivots on its feet`);
  const v = (art.feet[1] - art.forward[1]) / art.forward[3];
  assert.ok(Math.abs(fr.y + v * fr.h - (HERO_BASE.y + (art.feet[1] + 41) * HERO_BASE.scale)) < 1e-9, `${id} feet 41 px lower`);
  // The forward pose and the plate stay in the frame, and the plate covers the standing hero's hotspot centre.
  assert.ok(fr.x >= 0 && fr.y >= 0 && fr.x + fr.w <= HERO_ART.width && fr.y + fr.h <= HERO_ART.height, `${id} forward in frame`);
  assert.ok(pr.x < spot.x && pr.x + pr.w > spot.x, `${id} plate covers x ${spot.x}`);
}
assert.ok(layerBytes < 320 * 1024, `forward layers + plates ${layerBytes} bytes`);
// Lightning ends sit on the Sorceress's forward staff orb and raised hand (inside her forward box, upper part).
for (const p of [SORC_STAFF_TIP, SORC_RAISED_HAND]) {
  const q = forwardPoint('sorceress', p.x, p.y)!;
  const r = forwardRect('sorceress')!;
  assert.ok(q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h * 0.2, 'lightning anchored on the forward pose');
}

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

// t378u/t389u: one hero forward at a time; everyone else stands back (shaded x0.42 as in the mock-ups, still).
assert.equal(STAND_BACK_GAIN, 0.42);
for (const sel of ORDER) {
  const looks = heroLooks(sel);
  assert.deepEqual(looks.map((l) => l.id), ORDER);
  assert.deepEqual(looks.filter((l) => l.lit).map((l) => l.id), [sel], `only ${sel} forward`);
  for (const l of looks) {
    const spot = HERO_SPOTS.find((s) => s.id === l.id)!;
    if (l.lit) {
      assert.ok(l.gain === 1 && l.fx === HERO_EFFECTS[l.id], `${l.id} lit look`);
      assert.deepEqual(Object.keys(l).sort(), ['fx', 'gain', 'id', 'lit'], 'no sway / lift / glow state left');
    } else {
      assert.ok(spot && l.gain === STAND_BACK_GAIN && l.fx === null, `${l.id} stands back under ${sel}`);
    }
  }
}
// Unknown selection: nobody forward.
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
          if (key === 'drawImage') log.push({ op: 'drawImage', args: [(args[0] as { name: string }).name, Math.round(((args[1] as number) + (args[3] as number) / 2) * 10) / 10] });
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
const img = (name: string) => ({ complete: true, naturalWidth: 100, naturalHeight: 100, name }) as unknown as HTMLImageElement;
const layers: Record<string, HeroLayerImages> = {};
for (const id of ORDER) layers[id] = { forward: img(`${id}:forward`), plate: img(`${id}:plate`) };
const frame = (fx: HeroSelectFx, log: Rec[], sel: string, time: number) => {
  log.length = 0;
  fx.draw(time, sel, false);
  return JSON.stringify(log);
};
const shared: Rec[] = [];
const used = new HeroSelectFx(fakeCanvas(shared) as unknown as HTMLCanvasElement, layers);
const history = ['sorceress', 'barbarian', 'sorceress', 'sorceress', 'assassin', 'sorceress', 'druid', 'sorceress', 'paladin', 'necromancer', 'sorceress', 'amazon'];
let time = 3.1;
for (const sel of history) {
  for (let f = 0; f < 3; f++) frame(used, shared, sel, (time += 1 / 240)); // rapid: a few frames each
  for (const next of ORDER) {
    const freshLog: Rec[] = [];
    const fresh = new HeroSelectFx(fakeCanvas(freshLog) as unknown as HTMLCanvasElement, layers);
    assert.equal(frame(used, shared, next, time), frame(fresh, freshLog, next, time), `after ${sel}, ${next} frame matches a fresh screen`);
  }
}
const lightningStrokes = (log: Rec[]) => log.filter((r) => r.op === 'stroke' && String(r.args[1]).startsWith('rgba(245, 248, 255'));
const drawn = (log: Rec[]) => log.filter((r) => r.op === 'drawImage').map((r) => r.args[0] as string);
for (const sel of ORDER) {
  frame(used, shared, 'sorceress', (time += 0.05));
  assert.ok(lightningStrokes(shared).length > 0, 'sorceress frame has lightning');
  assert.deepEqual(drawn(shared), ['sorceress:plate', 'sorceress:forward']);
  frame(used, shared, sel, (time += 0.05));
  // Exactly one hero forward: its plate under, its forward pose over; nobody else's layers.
  assert.deepEqual(drawn(shared), [`${sel}:plate`, `${sel}:forward`], `${sel}: only ${sel} steps forward`);
  // Everyone else stands back: exactly one veil (black at 0.58 = x0.42), between the plate and the forward pose.
  const shades = shared.filter((r) => r.op === 'fill' && String(r.args[1]).startsWith('rgba(0, 0, 0'));
  assert.deepEqual(shades.map((r) => r.args[1]), [`rgba(0, 0, 0, ${1 - STAND_BACK_GAIN})`], `${sel}: one stand-back veil`);
  const order = shared.filter((r) => r.op === 'drawImage' || shades.includes(r)).map((r) => (r.op === 'fill' ? 'veil' : r.args[0]));
  assert.deepEqual(order, [`${sel}:plate`, 'veil', `${sel}:forward`], `${sel}: plate, veil, then the forward pose unshaded`);
  if (sel !== 'sorceress') {
    assert.equal(lightningStrokes(shared).length, 0, `no lightning left after switching to ${sel}`);
    assert.equal(shared.filter((r) => r.op === 'stroke').length, 0, `${sel}: lit hold, no effects`);
  }
}
// Still (reduced motion): the Sorceress's lightning holds one frame; the others are identical whatever the time.
for (const id of ORDER) {
  const l1: Rec[] = [];
  const l2: Rec[] = [];
  const f1 = new HeroSelectFx(fakeCanvas(l1) as unknown as HTMLCanvasElement, layers);
  const f2 = new HeroSelectFx(fakeCanvas(l2) as unknown as HTMLCanvasElement, layers);
  f1.draw(1.3, id, id !== 'sorceress');
  f2.draw(7.9, id, id !== 'sorceress');
  if (id !== 'sorceress') assert.equal(JSON.stringify(l1), JSON.stringify(l2), `${id} holds still`);
}
// Layers not loaded yet: no plate, veil or forward pose drawn (the scene simply shows as is).
{
  const log: Rec[] = [];
  const pending: Record<string, HeroLayerImages> = { barbarian: { forward: { complete: false, naturalWidth: 0 } as HTMLImageElement, plate: img('barbarian:plate') } };
  new HeroSelectFx(fakeCanvas(log) as unknown as HTMLCanvasElement, pending).draw(2, 'barbarian', false);
  assert.equal(drawn(log).length, 0, 'nothing drawn until the forward layer loads');
  assert.equal(log.filter((r) => r.op === 'fill').length, 0, 'no veil until the forward layer loads');
}
if (!hadDoc) delete g.document;
if (!hadWin) delete g.window;

console.log('hero-select: ok');
