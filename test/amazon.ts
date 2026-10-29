// ORDER "Make Amazon playable" (Amazon only). Mirrors the Barbarian tests: class values vs the
// docs, kit levels / auto-learn / manual points, MS 340 through the single-MS formula, item gate
// reachability for the Amazon, skill handlers, and the class sheet wiring in 8 directions.
// Nothing here depends on map coordinates (it passes at any MAP_SCALE).
import assert from 'node:assert/strict';
import { amazon } from '../src/game/data/classes/amazon';
import { barbarian } from '../src/game/data/classes/barbarian';
import { CLASSES, getClass } from '../src/game/data/classes';
import { playableIds, ROSTER } from '../src/game/data/classes/roster';
import { STARTING_STATS } from '../src/game/data/classes/startingStats';
import { STAT_GROWTH } from '../src/game/data/classes/statGrowth';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { CLASS_GATES, ITEMS, itemGate } from '../src/game/data/items';
import { BASE_MS, totalMS, UNIT_SCALE } from '../src/game/data/moveSpeed';
import { unitDef } from '../src/game/data/units';
import { waveMob, WAVE_INTERVAL, WAVE_SIZE } from '../src/game/data/waves';
import { grantXp, heroNumbers, manaCost, MAX_LEVEL, tryUpgrade, xpToNext } from '../src/game/combat';
import { comebackMul } from '../src/game/pace';
import { createMatch, PASSIVE_GOLD, spawnMinion } from '../src/game/sim';
import { SKILLS } from '../src/game/skills';
import { ICE_SHOT_SLOW } from '../src/game/skills/amazon';
import { skillAimKind } from '../src/game/mobileInput';
import { CLASS_COLS, CLASS_SHEET, CLASS_SHEET_IDS, classSheetCol, classSheetRow, hasClassSheet } from '../src/game/art/sheet-frames';
import { cellHasFigure, readPng } from './png';

// --- Registry and selection (the existing title-screen class picker reads ROSTER/CLASSES).
assert.equal(getClass('amazon'), amazon);
assert.deepEqual(Object.keys(CLASSES).sort(), ['amazon', 'barbarian', 'paladin']); // Paladin order added paladin
assert.deepEqual(playableIds().sort(), ['amazon', 'barbarian', 'paladin']);
assert.equal(ROSTER.find((r) => r.id === 'amazon')?.playable, true);
for (const id of ['necromancer', 'sorceress']) assert.equal(ROSTER.find((r) => r.id === id)?.playable, false);

// --- Values vs docs.
// [JOSEPH] joseph-answers-oct27 answer 6: "Amazon Str20 Dex25 Vit20 Ene15".
assert.deepEqual(
  { str: amazon.stats.str, dex: amazon.stats.dex, vit: amazon.stats.vit, energy: amazon.stats.energy },
  { str: 20, dex: 25, vit: 20, energy: 15 },
);
assert.deepEqual(STARTING_STATS.amazon, { str: 20, dex: 25, vit: 20, energy: 15 });
// [DOC] "Amazon 2 dexterity, 2 vitality, 1 strength, 0 energy".
assert.deepEqual(STAT_GROWTH.amazon, { dex: 2, vit: 2, str: 1, energy: 0 });
// [DOC] kits-final Magic Arrow path, in order at levels 1/3/5/7, max rank 5.
assert.deepEqual(amazon.skills.map((s) => s.name), ['Magic Arrow', 'Multi Shot', 'Ice Shot', 'Fire Shot']);
assert.deepEqual(amazon.skills.map((s) => s.unlockLevel), [1, 3, 5, 7]);
assert.ok(amazon.skills.every((s) => s.maxRank === 5 && !s.passive));
assert.deepEqual(amazon.startingBelt, ['magic-arrow', '', '', '']);
assert.equal(amazon.role, 'ranged');
// [DOC] shared mana rule 10/15/20/25/30%.
const maxMana = 200;
assert.deepEqual([1, 2, 3, 4, 5].map((r) => manaCost(amazon.skills[0], r, maxMana)), [20, 30, 40, 50, 60]);
// Barbarian untouched.
assert.equal(barbarian.stats.moveSpeed, 345);
assert.deepEqual(barbarian.skills.map((s) => s.id), ['bash', 'shout', 'leap-attack', 'battle-orders', 'whirlwind']);
assert.equal(barbarian.stats.adPerDex, undefined);

// --- Movement speed: [JOSEPH] Amazon 340 through the existing single-MS formula.
assert.equal(BASE_MS.amazon, 340);
assert.equal(amazon.stats.moveSpeed, 340);
assert.ok(Math.abs(totalMS(340) - 340 * UNIT_SCALE) < 1e-9);
assert.ok(Math.abs(totalMS(340) - 141.913) < 0.01, `340 -> ${totalMS(340)} px/s`);
{
  const sim = createMatch(sanctuary, amazon, 1);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  assert.equal(hero.defId, 'amazon');
  assert.equal(hero.msBase, 340);
  assert.ok(Math.abs(hero.moveSpeed - totalMS(340)) < 1e-9);
  assert.equal(hero.ranged, true, 'bow basic attacks use the existing projectile');
  assert.equal(hero.projectileSpeed, 460);
  assert.equal(hero.attackRange, 200);
  assert.equal(hero.maxHp, 166);
  // Barbarian player stays melee with the old default projectile speed.
  const barb = createMatch(sanctuary, barbarian, 1);
  const bh = barb.units.find((u) => u.id === barb.playerId)!;
  assert.equal(bh.ranged, false);
  assert.equal(bh.projectileSpeed, 420);
  // Dexterity (not strength) raises Amazon AD [TEMP].
  const ad0 = heroNumbers(sim, { bo: false, berserk: false }).ad;
  sim.attributes.dex += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, Math.round(ad0 + 10 * 0.15));
  sim.attributes.dex -= 10;
  sim.attributes.str += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, ad0);
}

// --- Kit levels, rank-1 auto-learn, extra points manual (same rule as the Barbarian).
{
  const sim = createMatch(sanctuary, amazon, 1);
  const rank = (i: number) => sim.skillRanks[amazon.skills[i].id] ?? 0;
  assert.equal(rank(0), 1);
  assert.equal(sim.skillPoints, 0);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    grantXp(sim, xpToNext(sim.level));
    amazon.skills.forEach((s, i) => assert.equal(rank(i), lv >= s.unlockLevel ? 1 : 0, `L${lv} ${s.name}`));
    const auto = amazon.skills.filter((s) => s.unlockLevel > 1 && s.unlockLevel <= lv).length;
    assert.equal(sim.skillPoints, lv - 1 - auto);
  }
  assert.equal(sim.attributes.dex, 25 + 2 * 14);
  assert.equal(sim.attributes.str, 20 + 14);
  const before = sim.skillPoints;
  assert.ok(tryUpgrade(sim, 'multi-shot'));
  assert.equal(rank(1), 2);
  assert.equal(sim.skillPoints, before - 1);
  assert.deepEqual(sim.belt, ['magic-arrow', 'multi-shot', 'ice-shot', 'fire-shot']);
}

// --- Skill handlers fire the existing projectile at foes in reach; ice slows.
{
  const sim = createMatch(sanctuary, amazon, 1);
  sim.units = sim.units.filter((u) => u.kind !== 'minion' && u.kind !== 'champion' || u.id === sim.playerId);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  for (const id of amazon.skills.map((s) => s.id)) {
    assert.ok(SKILLS[id], `${id} handler registered`);
    assert.equal(skillAimKind(id), 'single');
  }
  const ctx = (rank: number, focusId: number | null = null) => ({ sim, hero, rank, aimX: hero.x, aimY: hero.y, focusId });
  const far = spawnMinion(sim, waveMob(1), 'enemy', hero.x + 2000, hero.y);
  void far;
  // Nothing in reach -> no cast (no mana spent by tryCast).
  for (const id of amazon.skills.map((s) => s.id)) assert.equal(SKILLS[id](ctx(1)), false);
  const foes = [0, 1, 2, 3, 4].map((i) => spawnMinion(sim, waveMob(1), 'enemy', hero.x + 120, hero.y + (i - 2) * 30));
  const shots = () => sim.projectiles.length;
  let n = shots();
  assert.ok(SKILLS['magic-arrow'](ctx(1)));
  assert.equal(shots(), n + 1);
  assert.ok(Math.abs(sim.projectiles.at(-1)!.damage - hero.ad * 1.2) < 1e-9);
  n = shots();
  assert.ok(SKILLS['multi-shot'](ctx(2)));
  assert.equal(shots(), n + 4, 'multi shot: 2 + rank arrows');
  n = shots();
  assert.ok(SKILLS['ice-shot'](ctx(1, foes[4].id)));
  assert.equal(sim.projectiles.at(-1)!.targetId, foes[4].id, 'focus target preferred');
  assert.ok(foes[4].slows.some((s) => s.pct === ICE_SHOT_SLOW.pct && s.t === ICE_SHOT_SLOW.t));
  assert.ok(SKILLS['fire-shot'](ctx(1)));
  assert.ok(Math.abs(sim.projectiles.at(-1)!.damage - hero.ad * 1.4) < 1e-9);
}

// --- Item gates: Barbarian gates unchanged; every gear item reachable for the Amazon at its own
// level on the same pace model as test/items/item-19b-gate-pace.ts [TEMP].
{
  const barbGates: Record<string, [number, number]> = {
    ssd: [34, 0], flc: [38, 0], '2hs': [42, 26], lea: [34, 0], stu: [38, 0], rng: [42, 0], skp: [34, 0], hlm: [38, 0], fhl: [42, 0], mbl: [38, 0],
  };
  for (const [id, [s, d]] of Object.entries(barbGates)) {
    const item = ITEMS.find((i) => i.id === id)!;
    assert.deepEqual([item.reqStr ?? 0, item.reqDex ?? 0], [s, d], `${id} Barbarian gate unchanged`);
    assert.deepEqual(itemGate(item, 'barbarian'), { reqStr: s, reqDex: d });
  }
  assert.deepEqual(Object.keys(CLASS_GATES), ['amazon', 'paladin']);

  const LAST_HIT = 0.4;
  const GATE_BY = 8 * 60;
  const START_GOLD = createMatch(sanctuary, amazon, 1).gold;
  const pace: { level: number; gold: number }[] = [];
  let level = 1, xp = 0, gold = START_GOLD, wave = 0;
  for (let t = 0; t <= 22 * 60; t++) {
    if (t > 0) gold += PASSIVE_GOLD;
    if (t >= 60 && (t - 60) % WAVE_INTERVAL === 0) {
      wave += 1;
      const mob = unitDef(waveMob(wave));
      xp += Math.round(mob.xp * comebackMul(level, t)) * WAVE_SIZE;
      gold += WAVE_SIZE * LAST_HIT * mob.gold;
      while (level < 15 && xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; }
    }
    pace.push({ level, gold });
  }
  const sim = createMatch(sanctuary, amazon, 1);
  const attrs: { str: number; dex: number }[] = [];
  attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
  for (let lv = 2; lv <= 15; lv++) {
    grantXp(sim, xpToNext(sim.level));
    attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
  }
  for (const item of ITEMS.filter((i) => !i.consumable)) {
    const gate = itemGate(item, 'amazon');
    let lv = item.unlockLevel ?? 1;
    while (lv <= 15 && (attrs[lv].str < gate.reqStr || attrs[lv].dex < gate.reqDex)) lv++;
    assert.equal(lv, item.unlockLevel ?? 1, `${item.id}: Amazon meets ${gate.reqStr} str / ${gate.reqDex} dex at its own level`);
    const t = pace.findIndex((p) => p.level >= lv);
    assert.ok(t >= 0 && t <= GATE_BY, `${item.id} opens for the Amazon by ${GATE_BY}s`);
    assert.ok(pace[t].gold >= item.cost, `${item.id} affordable when it opens`);
    // Same level and price as the Barbarian; only the strength number changed.
    if (CLASS_GATES.amazon[item.id]) assert.ok(gate.reqStr < (item.reqStr ?? 0));
  }
}

// --- Sprite sheet wiring: the Amazon sheet exists, has a figure in all 8 directions for idle,
// move, attack and death, and the renderer's class-hero path covers it (hasClassSheet).
{
  assert.ok((CLASS_SHEET_IDS as readonly string[]).includes('amazon'));
  assert.ok(hasClassSheet('amazon'));
  const png = readPng('public/sprites/classes/amazon-full-sheet-64.png');
  assert.deepEqual([png.w, png.h], [CLASS_SHEET.cols * CLASS_SHEET.cell, CLASS_SHEET.rows * CLASS_SHEET.cell]);
  const rows = new Set<number>();
  for (let c = 0; c < 8; c++) {
    const row = classSheetRow(c);
    rows.add(row);
    for (const a of ['idle', 'move', 'attack', 'death'] as const) {
      for (let f = 0; f < CLASS_COLS[a].frames; f++) {
        assert.ok(cellHasFigure(png, classSheetCol(a, f), row), `amazon ${a} f${f} dir ${c}`);
      }
    }
  }
  assert.equal(rows.size, 8);
}

console.log('amazon ok');
