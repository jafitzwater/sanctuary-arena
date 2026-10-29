/** Batch 2 fixes [JOSEPH widget answers t236]: A respawn running, B bot flee rule, C item bugs, C2 stat/shop numbers. */
import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { getClass } from '../src/game/data/classes';
import { itemById, itemGate, ITEMS } from '../src/game/data/items';
import { grantXp, heroNumbers, kill, recomputeHero, TWO_HAND_REACH, weaponRange } from '../src/game/combat';
import { clearCommandsWhileDead } from '../src/game/input';
import { attacksPerSecond, combatStatsText, flavourOf, itemShopText, shopTextFor } from '../src/game/itemText';
import { player } from '../src/game/query';
import { BOT_CAUGHT_SLACK, BOT_CAUGHT_SPEED, BOT_COMMIT_RADIUS, BOT_FLEE_HP, botShouldCommit, createMatch, updateSim } from '../src/game/sim';
import { emptyInput, type FrameInput, type Sim, type Unit } from '../src/game/types';
import type { Vec } from '../src/game/math';

const DT = 1 / 60;

// ---------- A. Respawn running: stale destination / lock is cleared while dead, revived hero stays put. ----------
{
  const s = { dest: { x: 1, y: 2 } as Vec | null, targetId: 7 as number | null };
  clearCommandsWhileDead(s, true);
  assert.deepEqual(s, { dest: { x: 1, y: 2 }, targetId: 7 }, 'alive: commands kept');
  clearCommandsWhileDead(s, false);
  assert.deepEqual(s, { dest: null, targetId: null }, 'dead: commands dropped');

  // Drive the sim the way InputController feeds it: state -> FrameInput each frame.
  const respawnRun = (clear: boolean, stale: 'lock' | 'dest'): number => {
    const sim = createMatch(sanctuary, getClass('barbarian'), 1);
    for (let t = 0; t < 30; t += DT) updateSim(sim, emptyInput(), DT);
    const hero = player(sim);
    const foe = sim.units.find((u) => u.kind === 'champion' && u.team === 'enemy' && u.bot)!;
    const state = {
      dest: stale === 'dest' ? ({ x: hero.x + 2000, y: hero.y - 2000 } as Vec | null) : null,
      targetId: stale === 'lock' ? (foe.id as number | null) : null,
    };
    const frame = (): FrameInput => ({ ...emptyInput(), targetId: state.targetId, destX: state.dest?.x ?? null, destY: state.dest?.y ?? null });
    kill(sim, hero, null);
    let n = 0;
    while (!hero.alive && n++ < 60 * 120) {
      if (clear) clearCommandsWhileDead(state, hero.alive);
      updateSim(sim, frame(), DT);
    }
    assert.ok(hero.alive, 'hero revived');
    const x0 = hero.x, y0 = hero.y;
    for (let t = 0; t < 3; t += DT) {
      if (clear) clearCommandsWhileDead(state, hero.alive);
      updateSim(sim, frame(), DT);
    }
    return Math.hypot(hero.x - x0, hero.y - y0);
  };
  for (const stale of ['lock', 'dest'] as const) {
    assert.ok(respawnRun(false, stale) > 500, `control: without the fix a stale ${stale} runs the hero off`);
    assert.equal(respawnRun(true, stale), 0, `fix: a stale ${stale} leaves the revived hero at 0 px movement`);
  }
}

// ---------- B. Bot flee rule ----------
{
  assert.equal(BOT_FLEE_HP, 0.32);
  assert.deepEqual([BOT_COMMIT_RADIUS, BOT_CAUGHT_SLACK, BOT_CAUGHT_SPEED], [700, 30, 0.97]);

  const arena = (): { sim: Sim; hero: Unit; bot: Unit } => {
    const sim = createMatch(sanctuary, getClass('barbarian'), 3);
    sim.time = 20;
    const hero = player(sim);
    const bot = sim.units.find((u) => u.kind === 'champion' && u.team === 'enemy' && u.bot)!;
    for (const u of sim.units) if (u.kind === 'champion' && u !== hero && u !== bot) { u.x = 11000; u.y = 1000; }
    sim.units = sim.units.filter((u) => u.kind !== 'minion' || Math.hypot(u.x - 3500, u.y - 3500) > 1500);
    hero.x = 3500; hero.y = 3500;
    bot.x = 3560; bot.y = 3500;
    bot.hp = bot.maxHp * 0.25;
    hero.hp = hero.maxHp;
    hero.moveSpeed = bot.moveSpeed; // an equally fast chaser
    return { sim, hero, bot };
  };

  // Caught by an equally fast chaser in range, 1v1, no tower: keep fighting (even when losing the race).
  {
    const { sim, hero, bot } = arena();
    assert.equal(botShouldCommit(sim, bot), hero);
    for (let i = 0; i < 10; i++) updateSim(sim, { ...emptyInput() }, DT);
    assert.equal(bot.targetId, hero.id, 'the low bot keeps its target on the player in the sim');
  }
  // Same, but the chaser is slower than 97%: not caught; losing the damage race -> flee.
  {
    const { sim, hero, bot } = arena();
    hero.moveSpeed = bot.moveSpeed * 0.9;
    assert.equal(botShouldCommit(sim, bot), null);
    // ... but winning the damage race (player nearly dead) -> keep fighting.
    hero.hp = 1;
    assert.equal(botShouldCommit(sim, bot), hero);
  }
  // Outnumbered: a second enemy (to the bot) champion within 700 px -> flee.
  {
    const { sim, hero, bot } = arena();
    const other = sim.units.find((u) => u.kind === 'champion' && u.team === 'ally' && u !== hero)!;
    other.x = 3700; other.y = 3500;
    assert.equal(botShouldCommit(sim, bot), null);
    for (let i = 0; i < 10; i++) updateSim(sim, emptyInput(), DT);
    assert.equal(bot.targetId, null, 'the outnumbered low bot drops its target and retreats');
  }
  // Under an enemy tower: flee even when caught.
  {
    const { sim, hero, bot } = arena();
    const tower = sim.units.find((u) => u.kind === 'tower' && u.team === 'ally')!;
    bot.x = tower.x + 100; bot.y = tower.y;
    hero.x = tower.x + 40; hero.y = tower.y;
    assert.equal(botShouldCommit(sim, bot), null);
  }
  // Nobody within 700 px: nothing to commit to.
  {
    const { sim, hero, bot } = arena();
    hero.x = bot.x + BOT_COMMIT_RADIUS + 50;
    assert.equal(botShouldCommit(sim, bot), null);
  }
}

// ---------- C. Item bugs ----------
{
  assert.equal(TWO_HAND_REACH, 96);
  assert.equal(weaponRange(74, true, '2HS'), 96, 'melee two-hander reach 96');
  assert.equal(weaponRange(200, true, '2HS'), 200, 'ranged class keeps its own range');
  assert.equal(weaponRange(74, false, '1HS'), 74);
  const withWeapon = (classId: string, weapon: string | null) => {
    const sim = createMatch(sanctuary, getClass(classId), 1);
    sim.loadout.weapon = weapon;
    return heroNumbers(sim, { bo: false, berserk: false });
  };
  for (const classId of ['barbarian', 'paladin']) assert.equal(withWeapon(classId, '2hs').attackRange, 96, `${classId} 2HS 96`);
  for (const classId of ['amazon', 'sorceress', 'necromancer']) {
    assert.equal(withWeapon(classId, '2hs').attackRange, 200, `${classId} keeps 200 with 2HS`);
    assert.equal(withWeapon(classId, null).attackRange, 200);
  }
  // Nothing else changed: 2HS still +22 AD.
  assert.equal(withWeapon('sorceress', '2hs').ad - withWeapon('sorceress', null).ad, 22);
  const club = itemById('clb')!;
  assert.equal(club.ad, 5);
  assert.ok(club.description.includes('+5 attack damage'), club.description);
  assert.ok(!/1.6 damage/.test(club.description));
}

// ---------- C2. Stats line and shop texts ----------
{
  assert.equal(attacksPerSecond(0.5), '2.00');
  assert.equal(combatStatsText({ ad: 26, armor: 40, attackInterval: 0.78, attackRange: 74 }), 'AD 26 · Armor 40 · AS 1.28/s · Range 74');
  assert.equal(flavourOf('Slow two-hander. Requires 42 strength and 26 dexterity.'), 'Slow two-hander.');
  assert.equal(flavourOf('Requires 34 strength.'), '');
  assert.equal(flavourOf('+5 attack damage. No strength requirement.'), '+5 attack damage.');

  const pure = itemShopText(
    itemById('ssd')!,
    'amazon',
    { ad: 20, armor: 10, attackInterval: 0.8, attackRange: 200 },
    { ad: 29, armor: 10, attackInterval: 0.78, attackRange: 200 },
    { maxHp: 100, maxMana: 50, potionCap: 3, potionCapAfter: 3 },
  );
  assert.equal(pure, 'Stronger one-hand sword. +9 attack damage (AD 20 → 29). Attack speed 1.25/s → 1.28/s. Range 200. Requires 22 strength.');

  for (const classId of ['barbarian', 'amazon', 'paladin', 'sorceress', 'necromancer']) {
    const sim = createMatch(sanctuary, getClass(classId), 1);
    let guard = 0;
    while (sim.level < 7 && guard++ < 5000) grantXp(sim, 40);
    recomputeHero(sim);
    const before = heroNumbers(sim, { bo: false, berserk: false });
    const snapshot = JSON.stringify({ loadout: sim.loadout, before });
    for (const item of ITEMS) {
      const text = shopTextFor(sim, item);
      assert.ok(!/undefined|NaN/.test(text), `${classId} ${item.id}: ${text}`);
      if (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helm' || item.slot === 'belt') {
        const after = heroNumbers({ ...sim, loadout: { ...sim.loadout, [item.slot]: item.id } }, { bo: false, berserk: false });
        if (item.slot === 'weapon') {
          assert.ok(text.includes(`AD ${before.ad} → ${after.ad}`), `${classId} ${item.id}: ${text}`);
          assert.ok(new RegExp(`Range (${before.attackRange} → )?${after.attackRange}\\.`).test(text), `${classId} ${item.id}: ${text}`);
        }
        if (item.armor) assert.ok(text.includes(`Armor ${before.armor} → ${after.armor}`), `${classId} ${item.id}: ${text}`);
      }
      const gate = itemGate(item, classId);
      if (gate.reqStr) assert.ok(text.includes(`Requires ${gate.reqStr} strength`), `${classId} ${item.id}: ${text}`);
    }
    assert.equal(JSON.stringify({ loadout: sim.loadout, before: heroNumbers(sim, { bo: false, berserk: false }) }), snapshot, 'display code changes no stat');
  }
  // A Sorceress no longer reads the Barbarian strength number.
  const sorc = createMatch(sanctuary, getClass('sorceress'), 1);
  const ssdText = shopTextFor(sorc, itemById('ssd')!);
  const barbText = shopTextFor(createMatch(sanctuary, getClass('barbarian'), 1), itemById('ssd')!);
  assert.ok(barbText.includes('Requires 34 strength'), barbText);
  console.log('sorceress ssd:', ssdText);
  console.log('barbarian 2hs:', shopTextFor(createMatch(sanctuary, getClass('barbarian'), 1), itemById('2hs')!));
  console.log('amazon 2hs:', shopTextFor(createMatch(sanctuary, getClass('amazon'), 1), itemById('2hs')!));
  console.log('health potion:', shopTextFor(sorc, itemById('health-potion')!));
  console.log('mbl:', shopTextFor(sorc, itemById('mbl')!));
}

console.log('batch-2-fixes: ok');
