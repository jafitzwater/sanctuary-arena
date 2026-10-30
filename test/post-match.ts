import assert from 'node:assert/strict';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { getClass } from '../src/game/data/classes';
import { damageUnit } from '../src/game/combat';
import { player } from '../src/game/query';
import { createMatch, updateSim } from '../src/game/sim';
import { emptyInput, type Sim } from '../src/game/types';
import { POST_BANNER_SECONDS, postMatchAction, startPostMatch, summarizeMatch, tickPostMatch } from '../src/game/postMatch';

/** Post-match flow (Joseph t309u): state transitions, and a summary built only from tracked stats. */

function endMatch(win: boolean): Sim {
  const sim = createMatch(sanctuary, getClass('barbarian'), 5);
  for (let i = 0; i < 30 * 20; i++) updateSim(sim, emptyInput(), 1 / 30);
  const base = sim.units.find((u) => u.kind === 'base' && u.team === (win ? 'enemy' : 'ally'));
  assert.ok(base, 'base exists');
  damageUnit(sim, base, base.maxHp * 50 + 1e6, player(sim));
  assert.equal(sim.phase, win ? 'victory' : 'defeat', 'destroying a Worldstone ends the match');
  return sim;
}

assert.throws(() => startPostMatch('playing'), 'no post-match flow while playing');

for (const win of [true, false]) {
  const sim = endMatch(win);
  let pm = startPostMatch(sim.phase);
  assert.equal(pm.result, win ? 'victory' : 'defeat');
  assert.equal(pm.step, 'banner');

  // (1) Banner holds, then opens the game breakdown on its own.
  pm = tickPostMatch(pm, POST_BANNER_SECONDS * 0.5);
  assert.equal(pm.step, 'banner');
  assert.deepEqual(postMatchAction(pm, 'again'), { post: pm, mode: 'end' }, 'leave buttons do nothing on the banner');
  assert.deepEqual(postMatchAction(pm, 'menu'), { post: pm, mode: 'end' });
  pm = tickPostMatch(pm, POST_BANNER_SECONDS);
  assert.equal(pm.step, 'game');
  assert.equal(pm.t, 0);
  // A tap on the banner skips straight to the game breakdown.
  assert.equal(postMatchAction(startPostMatch(sim.phase), 'continue').post?.step, 'game');

  // (2) Game breakdown waits for Continue.
  pm = tickPostMatch(pm, 120);
  assert.equal(pm.step, 'game');
  assert.deepEqual(postMatchAction(pm, 'again'), { post: pm, mode: 'end' });
  let next = postMatchAction(pm, 'continue');
  assert.equal(next.mode, 'end');
  assert.equal(next.post?.step, 'character');
  pm = next.post!;

  // (3) Character breakdown is the last step.
  pm = tickPostMatch(pm, 120);
  assert.equal(pm.step, 'character');
  assert.equal(postMatchAction(pm, 'continue').post?.step, 'character');

  // (4) The two buttons leave the flow.
  next = postMatchAction(pm, 'again');
  assert.deepEqual(next, { post: null, mode: 'play' });
  next = postMatchAction(pm, 'menu');
  assert.deepEqual(next, { post: null, mode: 'title' });

  // Summary: both teams, the player first, only tracked stats.
  const sum = summarizeMatch(sim);
  assert.equal(sum.result, win ? 'victory' : 'defeat');
  assert.deepEqual(sum.teams.map((t) => t.team), ['ally', 'enemy']);
  assert.equal(sum.teams[0].kills, sim.allyKills);
  assert.equal(sum.teams[1].kills, sim.enemyKills);
  const champs = (team: string) => sim.units.filter((u) => u.kind === 'champion' && u.team === team).length;
  assert.equal(sum.teams[0].rows.length, champs('ally'));
  assert.equal(sum.teams[1].rows.length, champs('enemy'));
  assert.ok(sum.teams[0].rows.length >= 2 && sum.teams[1].rows.length >= 2);
  assert.ok(sum.teams[0].rows[0].you, 'the player leads the ally scoreboard');
  assert.equal(sum.teams.flatMap((t) => t.rows).filter((r) => r.you).length, 1);
  assert.equal(sum.you.kills, sim.kills);
  assert.equal(sum.you.deaths, sim.deaths);
  assert.equal(sum.you.assists, sim.assists);
  assert.equal(sum.you.level, sim.level);
  for (const row of sum.teams.flatMap((t) => t.rows).filter((r) => !r.you)) {
    assert.equal(row.kills, null, 'bot kills are not tracked');
    assert.equal(row.assists, null, 'bot assists are not tracked');
    assert.ok(row.items.every((id) => id === null), 'bots never shop');
    assert.equal(row.deaths, sim.units.find((u) => u.id === row.id)?.deathCount);
    assert.ok(row.netWorth >= 0);
    assert.ok(row.className.length > 0);
  }
  assert.ok(sum.teams[win ? 0 : 1].structures >= 1, 'the destroyed Worldstone counts');
  assert.deepEqual(sum.bars.map((b) => b.label), ['Kill participation', 'Kills', 'Assists', 'Deaths', 'Last hits', 'Net worth', 'Level']);
  for (const bar of sum.bars) assert.ok(bar.fill >= 0 && bar.fill <= 1, `${bar.label} fill in range`);

  // "Play another match" starts from a fresh sim with no leftover state.
  const fresh = createMatch(sanctuary, getClass('barbarian'));
  assert.equal(fresh.phase, 'playing');
  assert.equal(fresh.time, 0);
  assert.equal(fresh.kills + fresh.deaths + fresh.assists + fresh.allyKills + fresh.enemyKills, 0);
  assert.ok(fresh.units.filter((u) => u.kind === 'base').every((u) => u.alive));
}

console.log('post-match ok');
