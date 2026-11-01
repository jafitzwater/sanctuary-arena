/**
 * t345u "Put Rakanishu in the game": stats, placement and mirror, the Countess's move, the lightning burst
 * (trigger on hit, cooldown, non-mob units in radius, dodge rule), the potion ("globe") drop, animation columns,
 * facing wiring and the trimmed atlas. No DOM.
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { barbarian } from '../src/game/data/classes/barbarian';
import { UNIT_DEFS } from '../src/game/data/units';
import { CAVE_BOSSES, CAVE_RESPAWN } from '../src/game/data/caves';
import { TOWER_TIERS } from '../src/game/data/acts/types';
import { mapLen } from '../src/game/data/mapScale';
import { campThemeForDen } from '../src/game/art/campArt';
import { zoneAt } from '../src/game/data/mapZones';
import { walkable } from '../src/game/terrain';
import { distToPolyline } from '../src/game/math';
import { createMatch, spawnMinion } from '../src/game/sim';
import { damageUnit, kill } from '../src/game/combat';
import { player } from '../src/game/query';
import { resolveSparks, sparkVictim, triggerSparks } from '../src/game/sparks';
import {
  RAKANISHU_ID,
  SPARK_COOLDOWN,
  SPARK_DAMAGE,
  SPARK_DELAY,
  SPARK_DODGE_SLACK,
  SPARK_RADIUS,
} from '../src/game/data/rakanishu';
import { RAK_COL, RAK_HIT_S, RAK_WINDUP, rakanishuCol, type RakState } from '../src/game/art/rakanishu-frames';
import atlas from '../src/game/art/rakanishu-atlas.json';
import { readPng } from './png';
import type { Sim, Unit } from '../src/game/types';

const map = sanctuary;
const W = map.width;
const H = map.height;
let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const rak = UNIT_DEFS.rakanishu;
const countess = UNIT_DEFS.countess;
const camps = ['fallen', 'goatman', 'demon', 'mummy'].map((id) => UNIT_DEFS[id]).filter(Boolean);
const jungleBosses = ['radament', 'council-member', 'izual'].map((id) => UNIT_DEFS[id]);

test('stats: melee, tougher than any camp monster, below the Countess and every jungle boss; gold/xp above the Countess', () => {
  assert.ok(rak, 'rakanishu UnitDef');
  assert.equal(rak.ranged, false);
  assert.ok(camps.length >= 3);
  for (const c of camps) assert.ok(rak.hp >= c.hp * 3, `hp ${rak.hp} vs ${c.id} ${c.hp}`);
  for (const c of camps) assert.ok(rak.ad > c.ad, `ad ${rak.ad} vs ${c.id} ${c.ad}`);
  assert.ok(rak.hp < countess.hp, 'below the Countess');
  for (const b of jungleBosses) assert.ok(rak.hp < b.hp && rak.hp <= b.hp * 0.6, `clearly below ${b.id}`);
  assert.ok(rak.ad < countess.ad);
  assert.ok(rak.gold > countess.gold && rak.xp > countess.xp, 'gold/xp above the Countess');
  assert.deepEqual([rak.hp, rak.ad, rak.armor, rak.gold, rak.xp, rak.attackRange, rak.attackInterval], [600, 24, 6, 150, 140, 56, 1]);
  assert.ok(CAVE_BOSSES.some((b) => b.unit === RAKANISHU_ID && b.count === 1));
});

test('placement: Rakanishu holds den 1, the plains Cairn Stones camp, respawning like the other caves; mirrored by Izual', () => {
  const dens = map.dens ?? [];
  const den = dens.find((d) => d.unit === RAKANISHU_ID)!;
  assert.ok(den);
  assert.equal(den.id, 1);
  assert.equal(dens.filter((d) => d.unit === RAKANISHU_ID).length, 1);
  assert.equal(campThemeForDen(map, den), 'plains');
  assert.equal(den.cave, true);
  assert.equal(den.respawn, CAVE_RESPAWN);
  assert.equal(den.count, 1);
  const twin = dens.find((d) => Math.abs(d.x - (W - den.x)) < 1e-6 && Math.abs(d.y - (H - den.y)) < 1e-6);
  assert.equal(twin?.unit, 'izual');
  const sim = createMatch(map, barbarian, 1);
  const unit = sim.units.find((u) => u.defId === RAKANISHU_ID)!;
  assert.ok(unit && unit.alive && unit.team === 'wild' && unit.pack === 1);
  assert.equal(unit.maxHp, 600);
});

test('the Countess moved out: a mirrored pair (one per side), off lanes/river/towers, walkable, stats unchanged', () => {
  const dens = (map.dens ?? []).filter((d) => d.unit === 'countess');
  assert.equal(dens.length, 2);
  const [a, b] = dens;
  assert.ok(Math.abs(a.x - (W - b.x)) < 1e-6 && Math.abs(a.y - (H - b.y)) < 1e-6, 'exact mirror');
  const rakDen = (map.dens ?? []).find((d) => d.unit === RAKANISHU_ID)!;
  const blue = (d: { x: number; y: number }) =>
    Math.hypot(d.x - map.playerBase.x, d.y - map.playerBase.y) < Math.hypot(d.x - map.enemyBase.x, d.y - map.enemyBase.y);
  assert.notEqual(blue(a), blue(b), 'one per side');
  for (const den of dens) {
    assert.ok(Math.hypot(den.x - rakDen.x, den.y - rakDen.y) > 300, 'not in the plains camp any more');
    assert.equal(den.cave, true);
    assert.equal(den.respawn, CAVE_RESPAWN);
    assert.equal(den.camp, false);
    assert.equal(campThemeForDen(map, den), null);
    assert.ok(zoneAt(map, den.x, den.y).startsWith('jungle-'), 'between the lanes');
    for (const path of map.paths ?? []) assert.ok(distToPolyline(den, path.lane) >= mapLen(260), `off ${path.name}`);
    if (map.river) assert.ok(distToPolyline(den, map.river) > mapLen(260), 'off the river');
    for (const t of map.towers) assert.ok(Math.hypot(den.x - t.x, den.y - t.y) > TOWER_TIERS[t.tier].range + 60, `outside ${t.name}`);
    for (let r = 0; r <= 250; r += 50) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        assert.ok(walkable(map, den.x + Math.cos(ang) * r, den.y + Math.sin(ang) * r), `walkable r=${r}`);
      }
    }
    for (const other of [...(map.dens ?? []), ...(map.shrines ?? []), ...(map.pits ?? [])]) {
      if (other === den) continue;
      assert.ok(Math.hypot(den.x - other.x, den.y - other.y) > 500, 'clear of other camps, shrines and pits');
    }
  }
  assert.deepEqual([countess.hp, countess.ad, countess.gold, countess.xp], [800, 33, 136, 126]);
  const sim = createMatch(map, barbarian, 1);
  assert.equal(sim.units.filter((u) => u.defId === 'countess' && u.alive).length, 2);
});

function arena(): { sim: Sim; boss: Unit; hero: Unit } {
  const sim = createMatch(map, barbarian, 1);
  const boss = sim.units.find((u) => u.defId === RAKANISHU_ID)!;
  const hero = player(sim);
  hero.x = boss.x + 50;
  hero.y = boss.y;
  hero.invuln = 0;
  return { sim, boss, hero };
}

function land(sim: Sim, seconds = SPARK_DELAY + 0.01): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    resolveSparks(sim, dt, (target, attacker, amount) => damageUnit(sim, target, amount, attacker, 'magic'));
  }
}

test('lightning: any hit on Rakanishu starts a burst with a bolt at each non-mob unit in radius', () => {
  const { sim, boss, hero } = arena();
  assert.equal(sim.sparks.length, 0);
  damageUnit(sim, boss, 30, hero);
  assert.equal(sim.sparks.filter((s) => s.kind === 'burst').length, 1);
  const bolts = sim.sparks.filter((s) => s.kind === 'bolt');
  assert.ok(bolts.some((b) => b.targetId === hero.id), 'hero targeted');
  // A hit with no attacker (tower shot, spell) sparks too, but only after the cooldown.
  assert.equal(triggerSparks(sim, boss), false);
});

test('lightning respects the per-burst cooldown (~1.5 s)', () => {
  const { sim, boss, hero } = arena();
  assert.ok(SPARK_COOLDOWN >= 1.4 && SPARK_COOLDOWN <= 1.6);
  damageUnit(sim, boss, 10, hero);
  for (let i = 0; i < 10; i++) damageUnit(sim, boss, 10, hero);
  assert.equal(sim.sparks.filter((s) => s.kind === 'burst').length, 1, 'rapid hits make one burst');
  boss.sparkCd = Math.max(0, boss.sparkCd - (SPARK_COOLDOWN - 0.1));
  damageUnit(sim, boss, 10, hero);
  assert.equal(sim.sparks.filter((s) => s.kind === 'burst').length, 1, 'still cooling');
  boss.sparkCd = 0;
  damageUnit(sim, boss, 10, hero);
  assert.equal(sim.sparks.filter((s) => s.kind === 'burst').length, 2, 'next burst after the cooldown');
});

test('lightning damages heroes and lane minions in radius (modest damage), never wild units, towers or far units', () => {
  const { sim, boss, hero } = arena();
  const ally = spawnMinion(sim, 'fallen', 'ally', boss.x - 60, boss.y + 30);
  const foe = spawnMinion(sim, 'fallen', 'enemy', boss.x, boss.y - 80);
  const far = spawnMinion(sim, 'fallen', 'enemy', boss.x + SPARK_RADIUS + 120, boss.y);
  const wild = spawnMinion(sim, 'fallen', 'wild', boss.x + 30, boss.y + 30);
  assert.equal(sparkVictim(wild), false);
  assert.equal(sparkVictim(boss), false);
  const tower = sim.units.find((u) => u.kind === 'tower')!;
  assert.equal(sparkVictim(tower), false);
  const before = new Map([hero, ally, foe, far, wild].map((u) => [u.id, u.hp]));
  damageUnit(sim, boss, 10, hero);
  const targets = new Set(sim.sparks.filter((s) => s.kind === 'bolt').map((s) => s.targetId));
  assert.ok(targets.has(hero.id) && targets.has(ally.id) && targets.has(foe.id));
  assert.ok(!targets.has(far.id) && !targets.has(wild.id) && !targets.has(boss.id));
  land(sim);
  for (const u of [hero, ally, foe]) {
    const lost = before.get(u.id)! - u.hp;
    assert.ok(lost > 0, `${u.name} hit`);
    assert.ok(lost <= SPARK_DAMAGE, 'armor only lowers it');
  }
  assert.equal(far.hp, before.get(far.id));
  assert.equal(wild.hp, before.get(wild.id));
  assert.ok(SPARK_DAMAGE <= 20 && SPARK_RADIUS <= 200, 'modest damage, short radius');
});

test('dodge rule: a unit that moved out of the bolt path before it lands is missed; standing still is hit', () => {
  const { sim, boss, hero } = arena();
  const stay = spawnMinion(sim, 'fallen', 'enemy', boss.x - 60, boss.y);
  const hp0 = hero.hp;
  const stay0 = stay.hp;
  damageUnit(sim, boss, 10, hero);
  land(sim, SPARK_DELAY * 0.5);
  assert.equal(hero.hp, hp0, 'nothing lands before the delay');
  hero.x += hero.radius + SPARK_DODGE_SLACK + 5; // stepped out of the bolt's path in time
  land(sim, SPARK_DELAY * 0.5 + 0.02);
  assert.equal(hero.hp, hp0, 'hero dodged');
  assert.ok(stay.hp < stay0, 'the minion that stood still was hit');
  const bolt = sim.sparks.find((s) => s.kind === 'bolt' && s.targetId === hero.id);
  assert.ok(bolt && bolt.landed && !bolt.hit);
  // A small shuffle inside radius + slack does not dodge.
  boss.sparkCd = 0;
  const hp1 = hero.hp;
  damageUnit(sim, boss, 10, hero);
  hero.x += hero.radius + SPARK_DODGE_SLACK - 2;
  land(sim);
  assert.ok(hero.hp < hp1, 'a small step is still hit');
  land(sim, 1);
  assert.equal(sim.sparks.length, 0, 'sparks expire');
});

test('globes: killed by the player, Rakanishu drops one health and one mana (the existing cave-boss drop)', () => {
  const { sim, boss } = arena();
  sim.potions.health = 0;
  sim.potions.mana = 0;
  const level0 = sim.level;
  kill(sim, boss, player(sim));
  assert.equal(sim.potions.health, 1);
  assert.equal(sim.potions.mana, 1);
  // His xp can level a fresh hero, and the existing level-up banner then replaces the drop banner (unchanged code).
  if (sim.level === level0) assert.match(sim.banner?.text ?? '', /Rakanishu dropped a health potion and a mana potion/);
  else assert.match(sim.banner?.text ?? '', /Level/);
});

test('animation columns: idle, walk12, attack12 around the strike, hit4, death5 (priority order)', () => {
  const base: RakState = { alive: true, deadFor: 0, swing: 0, attackCd: 1, engaged: false, moving: false, loco: 0, hitAge: Infinity };
  assert.equal(rakanishuCol(base), RAK_COL.idle);
  const walk = new Set<number>();
  for (let ms = 0; ms < 2000; ms += 20) walk.add(rakanishuCol({ ...base, moving: true, loco: ms }));
  assert.deepEqual([...walk].sort((x, y) => x - y), Array.from({ length: 12 }, (_, i) => 26 + i));
  assert.equal(rakanishuCol({ ...base, engaged: true, attackCd: RAK_WINDUP + 0.1 }), RAK_COL.idle);
  assert.equal(rakanishuCol({ ...base, engaged: true, attackCd: RAK_WINDUP - 0.001 }), 50);
  assert.equal(rakanishuCol({ ...base, engaged: true, attackCd: 0 }), 56);
  assert.equal(rakanishuCol({ ...base, swing: 1 }), 57, 'impact frame at the strike');
  assert.equal(rakanishuCol({ ...base, swing: 0.01 }), 61);
  assert.equal(rakanishuCol({ ...base, swing: 0.5, moving: true }), 59, 'backswing beats walk');
  assert.equal(rakanishuCol({ ...base, hitAge: 0 }), 62);
  assert.equal(rakanishuCol({ ...base, hitAge: RAK_HIT_S - 0.001 }), 65);
  assert.equal(rakanishuCol({ ...base, hitAge: RAK_HIT_S }), RAK_COL.idle);
  assert.equal(rakanishuCol({ ...base, alive: false, deadFor: 0 }), 13);
  assert.equal(rakanishuCol({ ...base, alive: false, deadFor: 5, swing: 1 }), 17, 'death holds its last frame');
});

test('facing: Rakanishu rows come from the shared on-screen compass mapping (PR #94, classSheetRow)', () => {
  const render = readFileSync('src/game/render.ts', 'utf8');
  assert.match(render, /drawRakanishu\(ctx, classSheetRow\(pose\.compass\), col,/);
  assert.match(render, /if \(unit\.defId === RAKANISHU_ID\) return this\.paintRakanishu\(/);
});

test('atlas: trimmed WebP matches its frame table, keeps every shipped column in 8 rows, decoded well under the full sheet', () => {
  const buf = readFileSync('public/sprites/bosses/rakanishu-atlas.webp');
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buf.toString('ascii', 12, 16), 'VP8L', 'lossless');
  const bits = buf.readUInt32LE(21);
  assert.deepEqual([(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1], [atlas.w, atlas.h]);
  assert.equal(((bits >>> 28) & 1), 1, 'alpha');
  const cols = [0, 13, 14, 15, 16, 17, ...Array.from({ length: 12 }, (_, i) => 26 + i), ...Array.from({ length: 12 }, (_, i) => 50 + i), 62, 63, 64, 65];
  assert.deepEqual(atlas.cols, cols);
  assert.equal(atlas.frames.length, 8 * cols.length);
  const seen = new Set<string>();
  for (const [row, col, x, y, w, h, ox, oy] of atlas.frames) {
    seen.add(`${row}:${col}`);
    assert.ok(x >= 3 && y >= 3 && x + w + 3 <= atlas.w && y + h + 3 <= atlas.h, 'inside with outline margin');
    assert.ok(ox >= 0 && oy >= 0 && ox + w <= atlas.cell && oy + h <= atlas.cell, 'inside its 128 cell');
  }
  assert.equal(seen.size, 8 * cols.length);
  const decoded = atlas.w * atlas.h * 4;
  const fullSheet = 66 * 128 * 8 * 128 * 4;
  assert.ok(decoded <= 6.5 * 2 ** 20, `decoded ${(decoded / 2 ** 20).toFixed(2)} MiB`);
  assert.ok(decoded < fullSheet / 5);
  const sorc = readPng('public/sprites/classes/sorceress-full-sheet-64.png');
  assert.ok(decoded < sorc.w * sorc.h * 4, 'below a hero sheet');
  assert.ok(statSync('public/sprites/bosses/rakanishu-atlas.webp').size < 400_000);
  const spark = readPng('public/sprites/bosses/rakanishu-spark.png');
  assert.deepEqual([spark.w, spark.h], [768, 96]);
});

test('credits: CREDITS.md names the CC0 sources of the Rakanishu art', () => {
  const credits = readFileSync('CREDITS.md', 'utf8');
  assert.match(credits, /Rakanishu/);
  assert.match(credits, /Universal Base Characters/);
  assert.match(credits, /Universal Animation Library/);
  assert.match(credits, /CC0/);
});

console.log(`rakanishu: ${passed} passed`);
