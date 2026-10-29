// ORDER "Make Necromancer playable" (Necromancer only). Mirrors test/sorceress.ts: class values vs the docs,
// kit levels / auto-learn / manual points, the 2% mana step, MS 330 through the single-MS formula,
// item gate reachability for the Necromancer, skill handlers, and the class sheet wiring in 8 directions.
import assert from 'node:assert/strict';
import { necromancer, NECRO_MANA_STEP, NECRO_ENERGY_STEP_AT } from '../src/game/data/classes/necromancer';
import { sorceress } from '../src/game/data/classes/sorceress';
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
import { BONE_ARMOR, SPEAR_REACH_BONUS, SPIRIT_REACH_BONUS, TEETH } from '../src/game/skills/necromancer';
import { skillAimKind, skillReach } from '../src/game/mobileInput';
import { CLASS_COLS, CLASS_SHEET, CLASS_SHEET_IDS, classSheetCol, classSheetRow, hasClassSheet } from '../src/game/art/sheet-frames';
import { cellHasFigure, readPng } from './png';

// --- Registry and selection.
const ALL = ['amazon', 'barbarian', 'necromancer', 'paladin', 'sorceress'];
assert.equal(getClass('necromancer'), necromancer);
assert.deepEqual(Object.keys(CLASSES).sort(), ALL);
assert.deepEqual(playableIds().sort(), ALL, 'all five doc classes playable');
assert.equal(ROSTER.find((r) => r.id === 'necromancer')?.playable, true);

// --- Values vs docs.
// [JOSEPH] joseph-answers-oct27 answer 6: "Necromancer 15/15/15/25".
assert.deepEqual(
  { str: necromancer.stats.str, dex: necromancer.stats.dex, vit: necromancer.stats.vit, energy: necromancer.stats.energy },
  { str: 15, dex: 15, vit: 15, energy: 25 },
);
assert.deepEqual(STARTING_STATS.necromancer, { str: 15, dex: 15, vit: 15, energy: 25 });
// [DOC] "Necromancer | same as the sorceress" (2 energy, 2 vitality, 1 strength, 0 dexterity).
assert.deepEqual(STAT_GROWTH.necromancer, { energy: 2, vit: 2, str: 1, dex: 0 });
// [DOC] "Teeth: teeth, bone spear, bone armor, bone spirit." One path built (Teeth); Minions not built.
// Skill rework order [JOSEPH]: top skill Blood Splash (skill follow-ups order: L9 [JOSEPH]); Bone Spear stays L3.
assert.deepEqual(necromancer.skills.map((s) => s.name), ['Teeth', 'Bone Spear', 'Bone Armor', 'Bone Spirit', 'Blood Splash']);
assert.equal(necromancer.skills.length, 5);
assert.ok(necromancer.skills[4].topTier);
for (const s of necromancer.skills) assert.ok(!/skeleton|mage|wall/i.test(s.name), 'no Minions skill mixed in');
// [DOC] 1/3/5/7.
assert.deepEqual(necromancer.skills.map((s) => s.unlockLevel), [1, 3, 5, 7, 9]);
assert.ok(necromancer.skills.every((s) => s.maxRank === 3 && !s.passive));
assert.deepEqual(necromancer.startingBelt, ['teeth', '', '', '']);
assert.equal(necromancer.role, 'ranged');
assert.equal(necromancer.token, 'NE');
// [DOC][P] energy >= 10 -> 2% step: 10/12/14/16/18% (kits-final table). He starts at 25 >= 10.
assert.ok(necromancer.stats.energy >= NECRO_ENERGY_STEP_AT);
assert.equal(NECRO_MANA_STEP, 0.02);
assert.deepEqual([1, 2, 3, 4, 5].map((r) => manaCost(necromancer.skills[0], r, 500)), [50, 60, 70, 80, 90]);
for (const s of necromancer.skills) assert.equal(s.manaStep, 0.02);
// Other kits unchanged: 5% step for Barbarian/Amazon/Paladin, 2% for the Sorceress.
for (const k of [barbarian, amazon, paladin]) {
  assert.deepEqual([1, 2, 3, 4, 5].map((r) => manaCost(k.skills[0], r, 200)), [20, 30, 40, 50, 60]);
}
for (const s of sorceress.skills) assert.equal(s.manaStep, 0.02);
assert.equal(barbarian.stats.moveSpeed, 345);
assert.deepEqual(barbarian.skills.map((s) => s.id), ['bash', 'shout', 'leap-attack', 'battle-orders', 'whirlwind']);
assert.equal(amazon.stats.moveSpeed, 340);
assert.deepEqual(amazon.skills.map((s) => s.id), ['magic-arrow', 'multi-shot', 'ice-shot', 'fire-shot', 'strafe']);
assert.equal(paladin.stats.moveSpeed, 335);
assert.deepEqual(paladin.skills.map((s) => s.id), ['zeal', 'smite', 'charge', 'holy-shield', 'battle-hammers']);
assert.equal(sorceress.stats.moveSpeed, 325);
assert.deepEqual(sorceress.skills.map((s) => s.id), ['ice-bolt', 'lightning', 'teleport', 'fire-blast', 'blizzard']);

// --- Movement speed: [JOSEPH] Necromancer 330 through the existing single-MS formula.
assert.equal(BASE_MS.necromancer, 330);
assert.equal(necromancer.stats.moveSpeed, 330);
assert.ok(Math.abs(totalMS(330) - 330 * UNIT_SCALE) < 1e-9);
assert.ok(Math.abs(totalMS(330) - 330) < 0.01, `330 -> ${totalMS(330)} px/s`);
{
  const sim = createMatch(sanctuary, necromancer, 1);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  assert.equal(hero.defId, 'necromancer');
  assert.equal(hero.msBase, 330);
  assert.ok(Math.abs(hero.moveSpeed - totalMS(330)) < 1e-9);
  assert.equal(hero.ranged, true, 'projectile basic attacks [TEMP]');
  assert.equal(hero.attackRange, 200);
  assert.equal(hero.maxHp, 111);
  const ad0 = heroNumbers(sim, { bo: false, berserk: false }).ad;
  sim.attributes.str += 10;
  sim.attributes.dex += 10;
  assert.equal(heroNumbers(sim, { bo: false, berserk: false }).ad, ad0, '[TEMP] flat AD');
}

// --- Kit levels, rank-1 auto-learn, extra points manual.
{
  const sim = createMatch(sanctuary, necromancer, 1);
  const rank = (i: number) => sim.skillRanks[necromancer.skills[i].id] ?? 0;
  assert.equal(rank(0), 1);
  assert.equal(sim.skillPoints, 0);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    grantXp(sim, xpToNext(sim.level));
    necromancer.skills.forEach((s, i) => assert.equal(rank(i), lv >= s.unlockLevel ? 1 : 0, `L${lv} ${s.name}`));
    const auto = necromancer.skills.filter((s) => s.unlockLevel > 1 && s.unlockLevel <= lv).length;
    assert.equal(sim.skillPoints, lv - 1 - auto);
  }
  assert.equal(sim.attributes.energy, 25 + 2 * 14);
  assert.equal(sim.attributes.vit, 15 + 2 * 14);
  assert.equal(sim.attributes.str, 15 + 14);
  assert.equal(sim.attributes.dex, 15);
  const before = sim.skillPoints;
  assert.ok(before > 0);
  assert.ok(tryUpgrade(sim, 'bone-spear'));
  assert.equal(rank(1), 2);
  assert.equal(sim.skillPoints, before - 1);
  assert.deepEqual(sim.belt.slice(0, 4), ['teeth', 'bone-spear', 'bone-armor', 'bone-spirit']);
}

// --- Skill handlers use existing mechanics.
{
  const sim = createMatch(sanctuary, necromancer, 1);
  sim.units = sim.units.filter((u) => u.kind !== 'minion' && u.kind !== 'champion' || u.id === sim.playerId);
  const hero = sim.units.find((u) => u.id === sim.playerId)!;
  for (const s of necromancer.skills) assert.ok(SKILLS[s.id], `${s.id} handler registered`);
  assert.equal(skillAimKind('teeth'), 'single');
  assert.equal(skillAimKind('bone-spear'), 'single');
  assert.equal(skillAimKind('bone-spirit'), 'single');
  assert.equal(skillAimKind('bone-armor'), 'self');
  assert.equal(skillReach('teeth', 200), 240);
  assert.equal(skillReach('bone-spear', 200), 200 + SPEAR_REACH_BONUS);
  assert.equal(skillReach('bone-spirit', 200), 200 + SPIRIT_REACH_BONUS);
  // Other classes' aiming unchanged.
  assert.equal(skillAimKind('ice-bolt'), 'single');
  assert.equal(skillAimKind('blizzard'), 'ground');
  assert.equal(skillReach('ice-bolt', 200), 240);
  const ctx = (rank: number, focusId: number | null = null) => ({ sim, hero, rank, aimX: hero.x, aimY: hero.y, focusId });
  for (const id of ['teeth', 'bone-spear', 'bone-spirit']) assert.equal(SKILLS[id](ctx(1)), false, `${id}: nobody in reach`);
  const foes = [0, 1, 2, 3].map((i) => {
    const f = spawnMinion(sim, waveMob(1), 'enemy', hero.x + 100 + i * 10, hero.y + i * 8);
    f.maxHp = f.hp = 1e6;
    return f;
  });
  let shots = sim.projectiles.length;
  assert.ok(SKILLS.teeth(ctx(1)));
  assert.equal(sim.projectiles.length, shots + TEETH.base + 1, 'teeth fires 3 existing projectiles at rank 1');
  shots = sim.projectiles.length;
  assert.ok(SKILLS['bone-spear'](ctx(1, foes[2].id)));
  assert.equal(sim.projectiles.length, shots + 1);
  assert.equal(sim.projectiles[sim.projectiles.length - 1].targetId, foes[2].id, 'focus target honoured');
  // Bone Spirit reaches beyond Teeth.
  for (const f of foes) f.x = hero.x + 200 + SPIRIT_REACH_BONUS - 5;
  assert.equal(SKILLS.teeth(ctx(1)), false);
  assert.ok(SKILLS['bone-spirit'](ctx(1)));
  const armor0 = hero.buffArmor;
  assert.ok(SKILLS['bone-armor'](ctx(2)));
  assert.equal(hero.buffArmor, Math.max(armor0, BONE_ARMOR.armor + BONE_ARMOR.perRank));
  assert.ok(hero.buffT >= BONE_ARMOR.t);
  // Skill rework order [JOSEPH]: Blood Splash, magic blast around the target ([TEMP] values).
  foes.forEach((f, i) => { f.x = hero.x + 100 + i * 10; f.y = hero.y + i * 8; });
  const hp0 = foes.map((f) => f.hp);
  assert.ok(SKILLS['blood-splash'](ctx(1, foes[0].id)));
  assert.ok(foes.every((f, i) => f.hp < hp0[i]), 'blood splash hits the target and foes around it');
}

// --- Item gates: Barbarian gates unchanged; every gear item reachable for the Necromancer at its own
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
  // Other classes' gates unchanged by the Necromancer order.
  assert.deepEqual(CLASS_GATES.amazon, {
    ssd: { reqStr: 22 }, lea: { reqStr: 22 }, skp: { reqStr: 22 }, flc: { reqStr: 24 }, stu: { reqStr: 24 },
    hlm: { reqStr: 24 }, mbl: { reqStr: 24 }, '2hs': { reqStr: 26 }, rng: { reqStr: 26 }, fhl: { reqStr: 26 },
  });
  assert.deepEqual(CLASS_GATES.paladin, {
    ssd: { reqStr: 29 }, lea: { reqStr: 29 }, skp: { reqStr: 29 }, flc: { reqStr: 33 }, stu: { reqStr: 33 },
    hlm: { reqStr: 33 }, mbl: { reqStr: 33 }, '2hs': { reqStr: 37 }, rng: { reqStr: 37 }, fhl: { reqStr: 37 },
  });
  assert.deepEqual(CLASS_GATES.sorceress, {
    qui: { reqStr: 10 }, ssd: { reqStr: 12 }, lea: { reqStr: 12 }, skp: { reqStr: 12 }, flc: { reqStr: 14 }, stu: { reqStr: 14 },
    hlm: { reqStr: 14 }, mbl: { reqStr: 14 }, '2hs': { reqStr: 16, reqDex: 15 }, rng: { reqStr: 16 }, fhl: { reqStr: 16 },
  });
  // Old -> new Necromancer gates [TEMP].
  assert.deepEqual(CLASS_GATES.necromancer, {
    ssd: { reqStr: 17 }, lea: { reqStr: 17 }, skp: { reqStr: 17 }, flc: { reqStr: 19 }, stu: { reqStr: 19 },
    hlm: { reqStr: 19 }, mbl: { reqStr: 19 }, '2hs': { reqStr: 21, reqDex: 15 }, rng: { reqStr: 21 }, fhl: { reqStr: 21 },
  });

  const LAST_HIT = 0.4;
  const GATE_BY = 8 * 60;
  const START_GOLD = createMatch(sanctuary, necromancer, 1).gold;
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
  const sim = createMatch(sanctuary, necromancer, 1);
  const attrs: { str: number; dex: number }[] = [];
  attrs[1] = { str: sim.attributes.str, dex: sim.attributes.dex };
  for (let lv = 2; lv <= 15; lv++) {
    grantXp(sim, xpToNext(sim.level));
    attrs[lv] = { str: sim.attributes.str, dex: sim.attributes.dex };
  }
  for (const item of ITEMS.filter((i) => !i.consumable)) {
    const gate = itemGate(item, 'necromancer');
    let lv = item.unlockLevel ?? 1;
    while (lv <= 15 && (attrs[lv].str < gate.reqStr || attrs[lv].dex < gate.reqDex)) lv++;
    assert.equal(lv, item.unlockLevel ?? 1, `${item.id}: Necromancer meets ${gate.reqStr} str / ${gate.reqDex} dex at its own level`);
    const t = pace.findIndex((p) => p.level >= lv);
    assert.ok(t >= 0 && t <= GATE_BY, `${item.id} opens for the Necromancer by ${GATE_BY}s`);
    assert.ok(pace[t].gold >= item.cost, `${item.id} affordable when it opens`);
    if ((CLASS_GATES.necromancer as Record<string, unknown>)[item.id]) assert.ok(gate.reqStr < (item.reqStr ?? 0) && gate.reqDex <= (item.reqDex ?? 0));
  }
}

// --- Sprite sheet wiring: the Necromancer sheet exists, has a figure in all 8 directions for idle,
// move, attack and death, and the renderer's class-hero path covers it (hasClassSheet).
{
  assert.ok((CLASS_SHEET_IDS as readonly string[]).includes('necromancer'));
  assert.ok(hasClassSheet('necromancer'));
  const png = readPng('public/sprites/classes/necromancer-full-sheet-64.png');
  assert.deepEqual([png.w, png.h], [CLASS_SHEET.cols * CLASS_SHEET.cell, CLASS_SHEET.rows * CLASS_SHEET.cell]);
  const rows = new Set<number>();
  for (let c = 0; c < 8; c++) {
    const row = classSheetRow(c);
    rows.add(row);
    for (const a of ['idle', 'move', 'attack', 'death'] as const) {
      for (let f = 0; f < CLASS_COLS[a].frames; f++) {
        assert.ok(cellHasFigure(png, classSheetCol(a, f), row), `necromancer ${a} f${f} dir ${c}`);
      }
    }
  }
  assert.equal(rows.size, 8);
}

console.log('necromancer ok');
