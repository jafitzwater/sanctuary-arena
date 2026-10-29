// ORDER "Make Paladin playable" (Paladin only). Mirrors test/amazon.ts: class values vs the docs,
// kit levels / auto-learn / manual points, MS 335 through the single-MS formula, item gate
// reachability for the Paladin, skill handlers, and the class sheet wiring in 8 directions.
import assert from 'node:assert/strict';
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
import { HAMMER_RADIUS, HOLY_SHIELD, SMITE_STUN, ZEAL_HITS } from '../src/game/skills/paladin';
import { skillAimKind, skillReach } from '../src/game/mobileInput';
import { CLASS_COLS, CLASS_SHEET, CLASS_SHEET_IDS, classSheetCol, classSheetRow, hasClassSheet } from '../src/game/art/sheet-frames';
import { cellHasFigure, readPng } from './png';

// --- Registry and selection.
assert.equal(getClass('paladin'), paladin);
assert.deepEqual(Object.keys(CLASSES).sort(), ['amazon', 'barbarian', 'paladin', 'sorceress']); // Sorceress order added sorceress
assert.deepEqual(playableIds().sort(), ['amazon', 'barbarian', 'paladin', 'sorceress']);
assert.equal(ROSTER.find((r) => r.id === 'paladin')?.playable, true);
for (const id of ['necromancer']) assert.equal(ROSTER.find((r) => r.id === id)?.playable, false);

// --- Values vs docs.
// [JOSEPH] joseph-answers-oct27 answer 6: "Paladin 25/20/25/15".
assert.deepEqual(
  { str: paladin.stats.str, dex: paladin.stats.dex, vit: paladin.stats.vit, energy: paladin.stats.energy },
  { str: 25, dex: 20, vit: 25, energy: 15 },
);
assert.deepEqual(STARTING_STATS.paladin, { str: 25, dex: 20, vit: 25, energy: 15 });
// [DOC] "Paladin 2 strength, 2 dexterity, 1 vitality, 0 energy".
assert.deepEqual(STAT_GROWTH.paladin, { str: 2, dex: 2, vit: 1, energy: 0 });
// [DOC] kits-final: "One path. In order: zeal, smite, charge, holy shield. Battle hammers is the top tier skill."
assert.deepEqual(paladin.skills.map((s) => s.name), ['Zeal', 'Smite', 'Charge', 'Holy Shield', 'Battle Hammers']);
assert.equal(paladin.skills.length, 5, 'doc names exactly five Paladin skills, no invented extra');
// [DOC] 1/3/5/7; top tier [TEMP] 10 (doc: "after level 7"), same as the Barbarian Whirlwind.
assert.deepEqual(paladin.skills.map((s) => s.unlockLevel), [1, 3, 5, 7, 10]);
assert.ok(paladin.skills[4].unlockLevel > 7);
assert.ok(paladin.skills.every((s) => s.maxRank === 5 && !s.passive));
assert.deepEqual(paladin.startingBelt, ['zeal', '', '', '']);
assert.equal(paladin.role, 'melee');
assert.equal(paladin.token, 'PA');
// [DOC] shared mana rule 10/15/20/25/30%.
assert.deepEqual([1, 2, 3, 4, 5].map((r) => manaCost(paladin.skills[0], r, 200)), [20, 30, 40, 50, 60]);
// Barbarian and Amazon untouched.
assert.equal(barbarian.stats.moveSpeed, 345);
assert.deepEqual(barbarian.skills.map((s) => s.id), ['bash', 'shout', 'leap-attack', 'battle-orders', 'whirlwind']);
assert.equal(amazon.stats.moveSpeed, 340);
assert.deepEqual(amazon.skills.map((s) => s.id), ['magic-arrow', 'multi-shot', 'ice-shot', 'fire-shot']);

// --- Movement speed: [JOSEPH] Paladin 335 through the existing single-MS formula.
assert.equal(BASE_MS.paladin, 335);
assert.equal(paladin.stats.moveSpeed, 335);
assert.ok(Math.abs(totalMS(335) - 335 * UNIT_SCALE) < 1e-9);
assert.ok(Math.abs(totalMS(335) - 139.826) < 0.01, `335 -> ${totalMS(335)} px/s`);
{
  const sim = createMatch(sanctuary, paladin, 1);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  assert.equal(hero.defId, 'paladin');
  assert.equal(hero.msBase, 335);
  assert.ok(Math.abs(hero.moveSpeed - totalMS(335)) < 1e-9);
  assert.equal(hero.ranged, false, 'melee basic attacks');
  assert.equal(hero.attackRange, 74);
  assert.equal(hero.maxHp, 194);
  // Strength (not dexterity) raises Paladin AD [TEMP].
  const ad0 = heroNumbers(sim, { bo: false, berserk: false }).ad;
  sim.attributes.str += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, Math.round(ad0 + 10 * 0.15));
  sim.attributes.str -= 10;
  sim.attributes.dex += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, ad0);
}

// --- Kit levels, rank-1 auto-learn, extra points manual.
{
  const sim = createMatch(sanctuary, paladin, 1);
  const rank = (i: number) => sim.skillRanks[paladin.skills[i].id] ?? 0;
  assert.equal(rank(0), 1);
  assert.equal(sim.skillPoints, 0);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    grantXp(sim, xpToNext(sim.level));
    paladin.skills.forEach((s, i) => assert.equal(rank(i), lv >= s.unlockLevel ? 1 : 0, `L${lv} ${s.name}`));
    const auto = paladin.skills.filter((s) => s.unlockLevel > 1 && s.unlockLevel <= lv).length;
    assert.equal(sim.skillPoints, lv - 1 - auto);
  }
  assert.equal(sim.attributes.str, 25 + 2 * 14);
  assert.equal(sim.attributes.dex, 20 + 2 * 14);
  assert.equal(sim.attributes.vit, 25 + 14);
  assert.ok(sim.skillPoints > 0);
  const before = sim.skillPoints;
  assert.ok(tryUpgrade(sim, 'smite'));
  assert.equal(rank(1), 2);
  assert.equal(sim.skillPoints, before - 1);
  assert.deepEqual(sim.belt.slice(0, 4), ['zeal', 'smite', 'charge', 'holy-shield']);
}

// --- Skill handlers use existing mechanics.
{
  const sim = createMatch(sanctuary, paladin, 1);
  sim.units = sim.units.filter((u) => u.kind !== 'minion' && u.kind !== 'champion' || u.id === sim.playerId);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  for (const s of paladin.skills) assert.ok(SKILLS[s.id], `${s.id} handler registered`);
  assert.equal(skillAimKind('zeal'), 'single');
  assert.equal(skillAimKind('smite'), 'single');
  assert.equal(skillAimKind('charge'), 'single');
  assert.equal(skillAimKind('holy-shield'), 'self');
  assert.equal(skillAimKind('battle-hammers'), 'self');
  assert.equal(skillReach('charge', 74), 260);
  const ctx = (rank: number, focusId: number | null = null) => ({ sim, hero, rank, aimX: hero.x, aimY: hero.y, focusId });
  for (const id of ['zeal', 'smite', 'charge']) assert.equal(SKILLS[id](ctx(1)), false, `${id}: nobody in reach`);
  const foe = spawnMinion(sim, waveMob(1), 'enemy', hero.x + 60, hero.y);
  foe.maxHp = foe.hp = 1e6;
  let hp = foe.hp;
  assert.ok(SKILLS.zeal(ctx(1)));
  assert.ok(foe.hp < hp, 'zeal damages');
  assert.ok(ZEAL_HITS === 3);
  hp = foe.hp;
  assert.ok(SKILLS.smite(ctx(1)));
  assert.ok(foe.hp < hp);
  assert.ok(Math.abs(foe.stun - SMITE_STUN) < 1e-9, 'smite stuns');
  const armor0 = hero.buffArmor;
  assert.ok(SKILLS['holy-shield'](ctx(2)));
  assert.equal(hero.buffArmor, Math.max(armor0, HOLY_SHIELD.armor + HOLY_SHIELD.perRank));
  assert.ok(hero.buffT >= HOLY_SHIELD.t);
  const near = spawnMinion(sim, waveMob(1), 'enemy', hero.x - HAMMER_RADIUS + 20, hero.y);
  near.maxHp = near.hp = 1e6;
  const h1 = near.hp, h2 = foe.hp;
  assert.ok(SKILLS['battle-hammers'](ctx(1)));
  assert.ok(near.hp < h1 && foe.hp < h2, 'hammers hit every foe nearby');
  const far = spawnMinion(sim, waveMob(1), 'enemy', hero.x + 220, hero.y + 40);
  far.maxHp = far.hp = 1e6;
  sim.units = sim.units.filter((u) => u.id !== foe.id && u.id !== near.id);
  assert.ok(SKILLS.charge(ctx(1, far.id)));
  assert.ok(hero.leap, 'charge uses the existing leap');
  assert.ok(Math.hypot(hero.leap!.x1 - far.x, hero.leap!.y1 - far.y) < Math.hypot(hero.x - far.x, hero.y - far.y));
}

// --- Item gates: Barbarian gates unchanged; every gear item reachable for the Paladin at its own
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
  assert.deepEqual(Object.keys(CLASS_GATES), ['amazon', 'paladin', 'sorceress']);
  // Amazon gates unchanged by the Paladin order.
  assert.deepEqual(CLASS_GATES.amazon, {
    ssd: { reqStr: 22 }, lea: { reqStr: 22 }, skp: { reqStr: 22 }, flc: { reqStr: 24 }, stu: { reqStr: 24 },
    hlm: { reqStr: 24 }, mbl: { reqStr: 24 }, '2hs': { reqStr: 26 }, rng: { reqStr: 26 }, fhl: { reqStr: 26 },
  });

  const LAST_HIT = 0.4;
  const GATE_BY = 8 * 60;
  const START_GOLD = createMatch(sanctuary, paladin, 1).gold;
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
  const sim = createMatch(sanctuary, paladin, 1);
  const attrs: { str: number; dex: number }[] = [];
  attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
  for (let lv = 2; lv <= 15; lv++) {
    grantXp(sim, xpToNext(sim.level));
    attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
  }
  for (const item of ITEMS.filter((i) => !i.consumable)) {
    const gate = itemGate(item, 'paladin');
    let lv = item.unlockLevel ?? 1;
    while (lv <= 15 && (attrs[lv].str < gate.reqStr || attrs[lv].dex < gate.reqDex)) lv++;
    assert.equal(lv, item.unlockLevel ?? 1, `${item.id}: Paladin meets ${gate.reqStr} str / ${gate.reqDex} dex at its own level`);
    const t = pace.findIndex((p) => p.level >= lv);
    assert.ok(t >= 0 && t <= GATE_BY, `${item.id} opens for the Paladin by ${GATE_BY}s`);
    assert.ok(pace[t].gold >= item.cost, `${item.id} affordable when it opens`);
    // Same level and price as the Barbarian; only the strength number changed.
    if (CLASS_GATES.paladin[item.id]) assert.ok(gate.reqStr < (item.reqStr ?? 0));
  }
}

// --- Sprite sheet wiring: the Paladin sheet exists, has a figure in all 8 directions for idle,
// move, attack and death, and the renderer's class-hero path covers it (hasClassSheet).
{
  assert.ok((CLASS_SHEET_IDS as readonly string[]).includes('paladin'));
  assert.ok(hasClassSheet('paladin'));
  const png = readPng('public/sprites/classes/paladin-full-sheet-64.png');
  assert.deepEqual([png.w, png.h], [CLASS_SHEET.cols * CLASS_SHEET.cell, CLASS_SHEET.rows * CLASS_SHEET.cell]);
  const rows = new Set<number>();
  for (let c = 0; c < 8; c++) {
    const row = classSheetRow(c);
    rows.add(row);
    for (const a of ['idle', 'move', 'attack', 'death'] as const) {
      for (let f = 0; f < CLASS_COLS[a].frames; f++) {
        assert.ok(cellHasFigure(png, classSheetCol(a, f), row), `paladin ${a} f${f} dir ${c}`);
      }
    }
  }
  assert.equal(rows.size, 8);
}

console.log('paladin ok');
