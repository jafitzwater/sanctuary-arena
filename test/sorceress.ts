// ORDER "Make Sorceress playable" (Sorceress only). Mirrors test/paladin.ts: class values vs the docs,
// kit levels / auto-learn / manual points, the 2% mana step, MS 325 through the single-MS formula,
// item gate reachability for the Sorceress, skill handlers, and the class sheet wiring in 8 directions.
import assert from 'node:assert/strict';
import { sorceress, SORC_MANA_STEP, SORC_ENERGY_STEP_AT } from '../src/game/data/classes/sorceress';
import { paladin } from '../src/game/data/classes/paladin';
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
import { BLIZZARD, FIRE_BLAST, ICE_BOLT_SLOW, TELEPORT } from '../src/game/skills/sorceress';
import { skillAimKind, skillReach } from '../src/game/mobileInput';
import { CLASS_COLS, CLASS_SHEET, CLASS_SHEET_IDS, classSheetCol, classSheetRow, hasClassSheet } from '../src/game/art/sheet-frames';
import { cellHasFigure, readPng } from './png';

// --- Registry and selection.
assert.equal(getClass('sorceress'), sorceress);
assert.deepEqual(Object.keys(CLASSES).sort(), ['amazon', 'barbarian', 'necromancer', 'paladin', 'sorceress']);
assert.deepEqual(playableIds().sort(), ['amazon', 'barbarian', 'necromancer', 'paladin', 'sorceress']);
assert.equal(ROSTER.find((r) => r.id === 'sorceress')?.playable, true);
assert.equal(ROSTER.find((r) => r.id === 'necromancer')?.playable, true); // Necromancer order

// --- Values vs docs.
// [JOSEPH] joseph-answers-oct27 answer 6: "Sorceress 10/15/10/35".
assert.deepEqual(
  { str: sorceress.stats.str, dex: sorceress.stats.dex, vit: sorceress.stats.vit, energy: sorceress.stats.energy },
  { str: 10, dex: 15, vit: 10, energy: 35 },
);
assert.deepEqual(STARTING_STATS.sorceress, { str: 10, dex: 15, vit: 10, energy: 35 });
// [DOC] "Sorceress 2 energy, 2 vitality, 1 strength, 0 dexterity".
assert.deepEqual(STAT_GROWTH.sorceress, { energy: 2, vit: 2, str: 1, dex: 0 });
// Skill rework order [JOSEPH]: "Frost Bolt (L1), Lightning (L3), Teleport (L5), Fire Blast (L7), Blizzard (L9)".
assert.deepEqual(sorceress.skills.map((s) => s.name), ['Frost Bolt', 'Lightning', 'Teleport', 'Fire Blast', 'Blizzard']);
assert.equal(sorceress.skills.length, 5);
assert.deepEqual(sorceress.skills.map((s) => s.unlockLevel), [1, 3, 5, 7, 9]);
assert.deepEqual(sorceress.skills.map((s) => !!s.topTier), [false, false, false, false, true]);
assert.deepEqual(sorceress.skills.map((s) => s.maxRank), [3, 3, 3, 3, 3]);
assert.ok(!sorceress.skills.some((s) => /frozen|meteor/.test(s.id)), 'no Frozen Nova/Orb or Meteor');
assert.ok(sorceress.skills.every((s) => !s.passive));
assert.deepEqual(sorceress.startingBelt, ['ice-bolt', '', '', '']);
assert.equal(sorceress.role, 'ranged');
assert.equal(sorceress.token, 'SO');
// [DOC][P] energy >= 10 -> 2% step: 10/12/14/16/18% (kits-final table). She starts at 35 >= 10.
assert.ok(sorceress.stats.energy >= SORC_ENERGY_STEP_AT);
assert.equal(SORC_MANA_STEP, 0.02);
assert.deepEqual([1, 2, 3].map((r) => manaCost(sorceress.skills[0], r, 500)), [50, 60, 70]);
for (const s of sorceress.skills) assert.equal(s.manaStep, 0.02);
// Other kits keep the shared 5% step.
for (const k of [barbarian, amazon, paladin]) {
  assert.deepEqual([1, 2, 3, 4, 5].map((r) => manaCost(k.skills[0], r, 200)), [20, 30, 40, 50, 60]);
}
// Barbarian, Amazon and Paladin untouched.
assert.equal(barbarian.stats.moveSpeed, 345);
assert.deepEqual(barbarian.skills.map((s) => s.id), ['bash', 'shout', 'leap-attack', 'battle-orders', 'whirlwind']);
assert.equal(amazon.stats.moveSpeed, 340);
assert.deepEqual(amazon.skills.map((s) => s.id), ['magic-arrow', 'multi-shot', 'ice-shot', 'fire-shot', 'strafe']);
assert.equal(paladin.stats.moveSpeed, 335);
assert.deepEqual(paladin.skills.map((s) => s.id), ['zeal', 'smite', 'charge', 'holy-shield', 'battle-hammers']);
// Skill follow-ups order [JOSEPH]: top tier at 9 (was 5).
assert.deepEqual(paladin.skills.map((s) => s.unlockLevel), [1, 3, 5, 7, 9], 'Paladin top tier at 9');

// --- Movement speed: [JOSEPH] Sorceress 325 through the existing single-MS formula.
assert.equal(BASE_MS.sorceress, 325);
assert.equal(sorceress.stats.moveSpeed, 325);
assert.ok(Math.abs(totalMS(325) - 325 * UNIT_SCALE) < 1e-9);
assert.ok(Math.abs(totalMS(325) - 325) < 0.01, `325 -> ${totalMS(325)} px/s`);
{
  const sim = createMatch(sanctuary, sorceress, 1);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  assert.equal(hero.defId, 'sorceress');
  assert.equal(hero.msBase, 325);
  assert.ok(Math.abs(hero.moveSpeed - totalMS(325)) < 1e-9);
  assert.equal(hero.ranged, true, 'projectile basic attacks [TEMP]');
  assert.equal(hero.attackRange, 200);
  assert.equal(hero.maxHp, 92);
  // [TEMP] flat AD: neither strength nor dexterity scales her.
  const ad0 = heroNumbers(sim, { bo: false, berserk: false }).ad;
  sim.attributes.str += 10;
  sim.attributes.dex += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, ad0);
}

// --- Kit levels, rank-1 auto-learn, extra points manual.
{
  const sim = createMatch(sanctuary, sorceress, 1);
  const rank = (i: number) => sim.skillRanks[sorceress.skills[i].id] ?? 0;
  assert.equal(rank(0), 1);
  assert.equal(sim.skillPoints, 0);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    grantXp(sim, xpToNext(sim.level));
    sorceress.skills.forEach((s, i) => assert.equal(rank(i), lv >= s.unlockLevel ? 1 : 0, `L${lv} ${s.name}`));
    const auto = sorceress.skills.filter((s) => s.unlockLevel > 1 && s.unlockLevel <= lv).length;
    assert.equal(sim.skillPoints, lv - 1 - auto);
  }
  assert.equal(sim.attributes.energy, 35 + 2 * 14);
  assert.equal(sim.attributes.vit, 10 + 2 * 14);
  assert.equal(sim.attributes.str, 10 + 14);
  assert.equal(sim.attributes.dex, 15);
  assert.ok(sim.skillPoints > 0);
  const before = sim.skillPoints;
  assert.ok(tryUpgrade(sim, 'lightning'));
  assert.equal(rank(1), 2);
  assert.equal(sim.skillPoints, before - 1);
  assert.deepEqual(sim.belt.slice(0, 4), ['ice-bolt', 'lightning', 'teleport', 'fire-blast']);
}

// --- Skill handlers use existing mechanics.
{
  const sim = createMatch(sanctuary, sorceress, 1);
  sim.units = sim.units.filter((u) => u.kind !== 'minion' && u.kind !== 'champion' || u.id === sim.playerId);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  for (const s of sorceress.skills) assert.ok(SKILLS[s.id], `${s.id} handler registered`);
  assert.equal(skillAimKind('ice-bolt'), 'single');
  assert.equal(skillAimKind('lightning'), 'single');
  assert.equal(skillAimKind('fire-blast'), 'single');
  assert.equal(skillAimKind('blizzard'), 'ground');
  assert.equal(skillAimKind('teleport'), 'ground');
  assert.equal(skillReach('ice-bolt', 200), 240);
  const ctx = (rank: number, aimX = hero.x, aimY = hero.y, focusId: number | null = null) => ({ sim, hero, rank, aimX, aimY, focusId });
  for (const id of ['ice-bolt', 'lightning', 'fire-blast']) assert.equal(SKILLS[id](ctx(1)), false, `${id}: nobody in reach`);
  const foe = spawnMinion(sim, waveMob(1), 'enemy', hero.x + 100, hero.y);
  foe.maxHp = foe.hp = 1e6;
  const shots = sim.projectiles.length;
  assert.ok(SKILLS['ice-bolt'](ctx(1)));
  assert.equal(sim.projectiles.length, shots + 1, 'ice bolt fires the existing projectile');
  assert.ok(foe.slows.some((s) => s.pct === ICE_BOLT_SLOW.pct));
  let hp = foe.hp;
  assert.ok(SKILLS.lightning(ctx(1)));
  assert.ok(foe.hp < hp, 'lightning hits at once');
  hp = foe.hp;
  assert.ok(SKILLS.blizzard(ctx(1, foe.x, foe.y)));
  assert.ok(foe.hp < hp && foe.slows.some((s) => s.pct === BLIZZARD.pct), 'blizzard hits and slows');
  hp = foe.hp;
  const near = spawnMinion(sim, waveMob(1), 'enemy', foe.x + FIRE_BLAST.radius - 20, foe.y);
  near.maxHp = near.hp = 1e6;
  const h2 = near.hp;
  assert.ok(SKILLS['fire-blast'](ctx(1, hero.x, hero.y, foe.id)));
  assert.ok(foe.hp < hp && near.hp < h2, 'fire blast bursts on the foe and around it');
  const x0 = hero.x, y0 = hero.y;
  assert.ok(SKILLS.teleport(ctx(1, hero.x + 1000, hero.y)));
  const moved = Math.hypot(hero.x - x0, hero.y - y0);
  assert.ok(moved > 0 && moved <= TELEPORT.range + 1e-6, `teleport moved ${moved}`);
}

// --- Item gates: Barbarian gates unchanged; every gear item reachable for the Sorceress at its own
// level on the same pace model as test/items/item-19b-gate-pace.ts [TEMP].
{
  const barbGates: Record<string, [number, number]> = {
    ssd: [34, 0], flc: [38, 0], '2hs': [42, 26], lea: [34, 0], stu: [38, 0], rng: [42, 0], skp: [34, 0], hlm: [38, 0], fhl: [42, 0], mbl: [38, 0], qui: [12, 0],
  };
  for (const [id, [s, d]] of Object.entries(barbGates)) {
    const item = ITEMS.find((i) => i.id === id)!;
    assert.deepEqual([item.reqStr ?? 0, item.reqDex ?? 0], [s, d], `${id} Barbarian gate unchanged`);
    assert.deepEqual(itemGate(item, 'barbarian'), { reqStr: s, reqDex: d });
  }
  assert.deepEqual(Object.keys(CLASS_GATES), ['amazon', 'paladin', 'sorceress', 'necromancer']);
  // Amazon and Paladin gates unchanged by the Sorceress order.
  assert.deepEqual(CLASS_GATES.amazon, {
    ssd: { reqStr: 22 }, lea: { reqStr: 22 }, skp: { reqStr: 22 }, flc: { reqStr: 24 }, stu: { reqStr: 24 },
    hlm: { reqStr: 24 }, mbl: { reqStr: 24 }, '2hs': { reqStr: 26 }, rng: { reqStr: 26 }, fhl: { reqStr: 26 },
  });
  assert.deepEqual(CLASS_GATES.paladin, {
    ssd: { reqStr: 29 }, lea: { reqStr: 29 }, skp: { reqStr: 29 }, flc: { reqStr: 33 }, stu: { reqStr: 33 },
    hlm: { reqStr: 33 }, mbl: { reqStr: 33 }, '2hs': { reqStr: 37 }, rng: { reqStr: 37 }, fhl: { reqStr: 37 },
  });

  const LAST_HIT = 0.4;
  const GATE_BY = 8 * 60;
  const START_GOLD = createMatch(sanctuary, sorceress, 1).gold;
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
  const sim = createMatch(sanctuary, sorceress, 1);
  const attrs: { str: number; dex: number }[] = [];
  attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
  for (let lv = 2; lv <= 15; lv++) {
    grantXp(sim, xpToNext(sim.level));
    attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
  }
  for (const item of ITEMS.filter((i) => !i.consumable)) {
    const gate = itemGate(item, 'sorceress');
    let lv = item.unlockLevel ?? 1;
    while (lv <= 15 && (attrs[lv].str < gate.reqStr || attrs[lv].dex < gate.reqDex)) lv++;
    assert.equal(lv, item.unlockLevel ?? 1, `${item.id}: Sorceress meets ${gate.reqStr} str / ${gate.reqDex} dex at its own level`);
    const t = pace.findIndex((p) => p.level >= lv);
    assert.ok(t >= 0 && t <= GATE_BY, `${item.id} opens for the Sorceress by ${GATE_BY}s`);
    assert.ok(pace[t].gold >= item.cost, `${item.id} affordable when it opens`);
    // Same level and price as the Barbarian; only the stat numbers dropped.
    if (CLASS_GATES.sorceress[item.id]) assert.ok(gate.reqStr < (item.reqStr ?? 0) && gate.reqDex <= (item.reqDex ?? 0));
  }
}

// --- Sprite sheet wiring: the Sorceress sheet exists, has a figure in all 8 directions for idle,
// move, attack and death, and the renderer's class-hero path covers it (hasClassSheet).
{
  assert.ok((CLASS_SHEET_IDS as readonly string[]).includes('sorceress'));
  assert.ok(hasClassSheet('sorceress'));
  const png = readPng('public/sprites/classes/sorceress-full-sheet-64.png');
  // 3D v1 (t302u): 62-col sheet like the Barbarian v3; cols 0-17 keep the 18-col layout the game reads.
  assert.deepEqual([png.w, png.h], [62 * CLASS_SHEET.cell, CLASS_SHEET.rows * CLASS_SHEET.cell]);
  const rows = new Set<number>();
  for (let c = 0; c < 8; c++) {
    const row = classSheetRow(c);
    rows.add(row);
    for (const a of ['idle', 'move', 'attack', 'death'] as const) {
      for (let f = 0; f < CLASS_COLS[a].frames; f++) {
        assert.ok(cellHasFigure(png, classSheetCol(a, f), row), `sorceress ${a} f${f} dir ${c}`);
      }
    }
  }
  assert.equal(rows.size, 8);
}

console.log('sorceress ok');
