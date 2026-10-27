import assert from 'node:assert/strict';
import {
  AttackPhase,
  attackProfile,
  cooldownAtTrigger,
  createAttackState,
  stepAttack,
  type AttackInput,
  type AttackState,
} from '../src/game/combat/attackCycle';
import { barbarian } from '../src/game/data/classes/barbarian';
import { sanctuary } from '../src/game/data/acts/sanctuary';
import { mitigated } from '../src/game/combat';
import { createMatch, spawnMinion, updateSim } from '../src/game/sim';
import { player } from '../src/game/query';
import { emptyInput, type FrameInput, type Sim, type Unit } from '../src/game/types';

/** Skip the 15 s opening wait (item 3) so older tests can move heroes out of base. */
function pastOpening<T extends { time: number; map: { openingWait?: number } }>(sim: T): T {
  sim.time = Math.max(sim.time, sim.map.openingWait ?? 0);
  return sim;
}

const heroProfile = attackProfile(barbarian.stats.attackInterval, barbarian.stats.attackRange);
const ravenProfile = attackProfile(1.15, 250, 460);
const rosterProfile = attackProfile(1, 48);

function order(dtMs: number, patch: Partial<AttackInput> = {}): AttackInput {
  return {
    dtMs,
    move: false,
    orderTargetId: 7,
    orderPersists: true,
    target: { id: 7, alive: true, inRange: true },
    attackerAlive: true,
    intervalScale: 1,
    allowStart: true,
    ...patch,
  };
}

function run(state: AttackState, profile: typeof heroProfile, frames: AttackInput[]): { state: AttackState; log: string[] } {
  const log: string[] = [];
  let current = state;
  for (const frame of frames) {
    const stepped = stepAttack(current, profile, frame);
    current = stepped.state;
    for (const event of stepped.events) {
      const reason = 'reason' in event ? event.reason : '';
      log.push(`${event.type}${reason ? ':' + reason : ''} phase=${current.phase} cd=${current.cooldownRemainingMs.toFixed(1)} elapsed=${current.phaseElapsedMs.toFixed(1)}`);
    }
    if (!stepped.events.length) {
      log.push(`tick phase=${current.phase} cd=${current.cooldownRemainingMs.toFixed(1)} elapsed=${current.phaseElapsedMs.toFixed(1)}`);
    }
  }
  return { state: current, log };
}

{
  const lockout = cooldownAtTrigger(heroProfile);
  const remainder = heroProfile.attackIntervalMs - heroProfile.windupMs - heroProfile.backswingMs;
  console.log(
    'PROFILE hero',
    JSON.stringify({
      attackIntervalMs: heroProfile.attackIntervalMs,
      windupMs: heroProfile.windupMs,
      backswingMs: heroProfile.backswingMs,
      cooldownPhaseMs: remainder,
      triggerLockoutMs: lockout,
      range: heroProfile.range,
      melee: true,
    }),
  );
  console.log(
    'PROFILE blood-raven',
    JSON.stringify({
      attackIntervalMs: ravenProfile.attackIntervalMs,
      windupMs: ravenProfile.windupMs,
      backswingMs: ravenProfile.backswingMs,
      cooldownPhaseMs: ravenProfile.attackIntervalMs - ravenProfile.windupMs - ravenProfile.backswingMs,
      triggerLockoutMs: cooldownAtTrigger(ravenProfile),
      range: ravenProfile.range,
      projectileSpeed: ravenProfile.projectile?.speed,
    }),
  );
  console.log(
    'PROFILE roster',
    JSON.stringify({
      attackIntervalMs: rosterProfile.attackIntervalMs,
      windupMs: rosterProfile.windupMs,
      backswingMs: rosterProfile.backswingMs,
      cooldownPhaseMs: rosterProfile.attackIntervalMs - rosterProfile.windupMs - rosterProfile.backswingMs,
      range: rosterProfile.range,
    }),
  );
  assert.equal(heroProfile.windupMs, heroProfile.attackIntervalMs * 0.3);
  assert.equal(heroProfile.backswingMs, heroProfile.attackIntervalMs * 0.3);
  assert.equal(remainder, heroProfile.attackIntervalMs * 0.4);
  assert.equal(lockout, heroProfile.attackIntervalMs - heroProfile.windupMs);
  assert.equal(ravenProfile.projectile?.speed, 460);
}

{
  const trace = run(createAttackState(), heroProfile, [order(heroProfile.windupMs)]);
  console.log('TRACE windup-trigger', trace.log.join(' | '));
  assert.equal(trace.log[0].startsWith('AttackStarted'), true);
  assert.equal(trace.log[1].startsWith('AttackFired'), true);
  assert.equal(trace.state.phase, AttackPhase.Backswing);
  assert.equal(trace.state.cooldownRemainingMs, cooldownAtTrigger(heroProfile));
  const melee = stepAttack(createAttackState(), heroProfile, order(heroProfile.windupMs));
  assert.equal(melee.events.find((event) => event.type === 'AttackFired') && true, true);
  const fired = melee.events.find((event) => event.type === 'AttackFired');
  assert.equal(fired && fired.type === 'AttackFired' && fired.melee, true);
  const ranged = stepAttack(createAttackState(), ravenProfile, order(ravenProfile.windupMs));
  const shot = ranged.events.find((event) => event.type === 'AttackFired');
  assert.equal(shot && shot.type === 'AttackFired' && shot.melee, false);
}

{
  let state = createAttackState();
  state = stepAttack(state, heroProfile, order(40)).state;
  assert.equal(state.phase, AttackPhase.Windup);
  const before = state.phaseElapsedMs;
  const canceled = stepAttack(state, heroProfile, order(16, { move: true }));
  console.log('TRACE windup-move', canceled.events.map((event) => event.type + ('reason' in event ? ':' + event.reason : '')).join(' | '));
  assert.equal(canceled.events[0].type, 'AttackCanceled');
  assert.equal(canceled.events[0].type === 'AttackCanceled' && canceled.events[0].reason, 'move');
  assert.equal(canceled.state.phase, AttackPhase.Idle);
  assert.equal(canceled.state.cooldownRemainingMs, 0);
  assert.ok(before > 0);
  const restarted = stepAttack(canceled.state, heroProfile, order(10));
  assert.equal(restarted.state.phase, AttackPhase.Windup);
  assert.equal(restarted.state.phaseElapsedMs, 10);
}

{
  let state = stepAttack(createAttackState(), heroProfile, order(heroProfile.windupMs)).state;
  assert.equal(state.phase, AttackPhase.Backswing);
  const cooldown = state.cooldownRemainingMs;
  const moved = stepAttack(state, heroProfile, order(20, { move: true }));
  console.log('TRACE backswing-move', moved.events.map((event) => event.type).join(' | '), 'cd', moved.state.cooldownRemainingMs.toFixed(1));
  assert.equal(moved.events[0].type, 'BackswingCanceled');
  assert.ok(moved.state.cooldownRemainingMs > 0);
  assert.ok(moved.state.cooldownRemainingMs < cooldown);
  assert.notEqual(moved.state.phase, AttackPhase.Windup);
  const held = stepAttack(state, heroProfile, order(heroProfile.backswingMs));
  assert.equal(held.state.phase, AttackPhase.Cooldown);
  assert.ok(Math.abs(held.state.cooldownRemainingMs - (cooldownAtTrigger(heroProfile) - heroProfile.backswingMs)) < 1e-6);
}

{
  let state = stepAttack(createAttackState(), heroProfile, order(heroProfile.windupMs + heroProfile.backswingMs)).state;
  assert.equal(state.phase, AttackPhase.Cooldown);
  const free = stepAttack(state, heroProfile, order(30, { move: true, allowStart: false }));
  assert.equal(free.events.length, 0);
  assert.ok(free.state.cooldownRemainingMs < state.cooldownRemainingMs);
  const ready = stepAttack(free.state, heroProfile, order(free.state.cooldownRemainingMs));
  console.log('TRACE reattack', ready.events.map((event) => event.type).join(' | '), ready.state.phase);
  assert.equal(ready.events.some((event) => event.type === 'AttackStarted'), true);
  assert.equal(ready.state.phase, AttackPhase.Windup);
}

{
  let state = stepAttack(createAttackState(), heroProfile, order(80)).state;
  const elapsed = state.phaseElapsedMs;
  const again = stepAttack(state, heroProfile, order(15));
  console.log('TRACE spam', `elapsed ${elapsed} -> ${again.state.phaseElapsedMs}`);
  assert.equal(again.events.some((event) => event.type === 'AttackStarted'), false);
  assert.equal(again.state.phaseElapsedMs, elapsed + 15);
}

{
  let state = stepAttack(createAttackState(), heroProfile, order(80)).state;
  const dead = stepAttack(state, heroProfile, order(10, { target: { id: 7, alive: false, inRange: true } }));
  assert.equal(dead.events[0].type === 'AttackCanceled' && dead.events[0].reason, 'target-dead');
  assert.equal(dead.state.cooldownRemainingMs, 0);
  const missing = stepAttack(state, heroProfile, order(10, { target: null }));
  assert.equal(missing.events[0].type === 'AttackCanceled' && missing.events[0].reason, 'invalid');
  const left = stepAttack(state, heroProfile, order(10, { target: { id: 7, alive: true, inRange: false } }));
  console.log('TRACE out-of-range', left.events.map((event) => ('reason' in event ? event.reason : event.type)).join(' | '), 'queued', left.state.queuedTargetId);
  assert.equal(left.events[0].type === 'AttackCanceled' && left.events[0].reason, 'out-of-range');
  assert.equal(left.state.queuedTargetId, 7);
  assert.equal(left.state.cooldownRemainingMs, 0);
  const dropped = stepAttack(state, heroProfile, order(10, { orderPersists: false, target: { id: 7, alive: true, inRange: false } }));
  assert.equal(dropped.state.queuedTargetId, null);
  const slain = stepAttack(state, heroProfile, order(10, { attackerAlive: false }));
  assert.equal(slain.events[0].type === 'AttackCanceled' && slain.events[0].reason, 'dead');
  assert.equal(slain.state.phase, AttackPhase.Idle);
  assert.equal(slain.state.cooldownRemainingMs, 0);
}

{
  let state = stepAttack(createAttackState(), heroProfile, order(100)).state;
  const scaledProfile = attackProfile(barbarian.stats.attackInterval * 0.5, heroProfile.range);
  const scaled = stepAttack(state, scaledProfile, order(0, { intervalScale: 0.5 }));
  console.log('TRACE haste', `elapsed ${state.phaseElapsedMs} -> ${scaled.state.phaseElapsedMs} windup ${scaledProfile.windupMs}`);
  assert.equal(scaled.state.phaseElapsedMs, 50);
  const rest = scaledProfile.windupMs - scaled.state.phaseElapsedMs;
  const fired = stepAttack(scaled.state, scaledProfile, order(rest));
  assert.equal(fired.events.some((event) => event.type === 'AttackFired'), true);
}

function quiet(sim: Sim, keep: number[]): void {
  for (const unit of sim.units) {
    if (keep.includes(unit.id)) continue;
    if (unit.kind === 'champion' || unit.kind === 'tower' || unit.kind === 'base' || unit.kind === 'minion') {
      unit.stun = 30;
      unit.attackCd = 30;
    }
  }
  sim.waveIn = 30;
}

function pit(): { sim: Sim; hero: Unit; foe: Unit } {
  const sim = pastOpening(createMatch(sanctuary, barbarian, 1));
  const hero = player(sim);
  hero.x = 2000;
  hero.y = 1400;
  const foe = spawnMinion(sim, 'fallen', 'enemy', hero.x + 40, hero.y, 0);
  foe.armor = 0;
  foe.hp = 5000;
  foe.maxHp = 5000;
  foe.ad = 0;
  foe.moveSpeed = 0;
  foe.attackCd = 999;
  foe.aggro = 0;
  foe.stun = 30;
  quiet(sim, [hero.id, foe.id]);
  return { sim, hero, foe };
}

function attackInput(): FrameInput {
  const input = emptyInput();
  input.attack = true;
  return input;
}

{
  const { sim, hero, foe } = pit();
  const hit = mitigated(hero.ad, 0);
  const times: number[] = [];
  let hp = foe.hp;
  for (let i = 0; i < 250; i++) {
    updateSim(sim, attackInput(), 0.01);
    if (foe.hp <= hp - hit + 0.1) {
      times.push(sim.time);
      hp = foe.hp;
    }
  }
  const gaps = times.slice(1).map((time, index) => Number((time - times[index]).toFixed(3)));
  console.log('TRACE standing', JSON.stringify({ hits: times.length, gaps }));
  assert.ok(gaps.length >= 2, 'standing attack never repeated');
  for (const gap of gaps) assert.ok(Math.abs(gap - hero.attackInterval) < 0.021, `standing gap ${gap}`);
}

{
  const { sim, hero, foe } = pit();
  const hp = foe.hp;
  updateSim(sim, attackInput(), 0.05);
  assert.equal(foe.hp, hp);
  assert.equal(hero.attackCycle.phase, AttackPhase.Windup);
  const input = attackInput();
  input.moveX = 1;
  input.moveY = 0;
  const x = hero.x;
  updateSim(sim, input, 0.05);
  console.log('TRACE sim windup cancel', hero.attackCycle.phase, 'moved', hero.x - x, 'hp', foe.hp);
  assert.equal(foe.hp, hp);
  assert.notEqual(hero.x, x);
  assert.equal(hero.attackCycle.cooldownRemainingMs, 0);
  assert.notEqual(hero.attackCycle.phase, AttackPhase.Windup);
}

{
  const { sim, hero, foe } = pit();
  const hp0 = foe.hp;
  for (let i = 0; i < 20 && foe.hp === hp0; i++) updateSim(sim, attackInput(), 0.05);
  assert.ok(foe.hp < hp0, 'backswing sample never fired');
  const hp = foe.hp;
  const x = hero.x;
  assert.ok(hero.attackCycle.cooldownRemainingMs > 0);
  const input = emptyInput();
  input.moveX = 1;
  updateSim(sim, input, 0.05);
  console.log('TRACE sim backswing', hero.attackCycle.phase, 'cd', hero.attackCycle.cooldownRemainingMs.toFixed(1), 'dx', hero.x - x);
  assert.equal(foe.hp, hp);
  assert.ok(hero.x !== x);
  assert.ok(hero.attackCycle.cooldownRemainingMs > 0);
  assert.notEqual(hero.attackCycle.phase, AttackPhase.Backswing);
}

{
  const stand = pit();
  const hit = mitigated(stand.hero.ad, 0);
  const standTimes: number[] = [];
  let hp = stand.foe.hp;
  for (let i = 0; i < 200; i++) {
    updateSim(stand.sim, attackInput(), 0.01);
    if (stand.foe.hp <= hp - hit + 0.1) {
      standTimes.push(stand.sim.time);
      hp = stand.foe.hp;
    }
  }
  const orb = pit();
  const orbTimes: number[] = [];
  hp = orb.foe.hp;
  let saw = 0;
  for (let i = 0; i < 400 && orbTimes.length < standTimes.length; i++) {
    const input = attackInput();
    const winding = orb.hero.attackCycle.phase === AttackPhase.Backswing;
    if (winding) {
      input.attack = false;
      input.moveX = 1;
      saw += 1;
    }
    updateSim(orb.sim, input, 0.01);
    if (orb.foe.hp <= hp - hit + 0.1) {
      orbTimes.push(orb.sim.time);
      hp = orb.foe.hp;
    }
  }
  const gap = (times: number[]) => times.slice(1).map((time, index) => time - times[index]);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const standGap = mean(gap(standTimes));
  const orbGap = mean(gap(orbTimes));
  console.log('TRACE orbwalk', JSON.stringify({ standGap: Number(standGap.toFixed(3)), orbGap: Number(orbGap.toFixed(3)), cancels: saw }));
  assert.ok(saw > 0, 'orbwalk never canceled a backswing');
  assert.ok(Math.abs(orbGap - standGap) < 0.03, `orbwalk gap ${orbGap} vs standing ${standGap}`);
}

{
  const { sim, hero, foe } = pit();
  updateSim(sim, attackInput(), 0.05);
  assert.equal(hero.attackCycle.phase, AttackPhase.Windup);
  foe.alive = false;
  foe.hp = 0;
  updateSim(sim, attackInput(), 0.05);
  console.log('TRACE target dead', hero.attackCycle.phase, hero.attackCycle.cooldownRemainingMs);
  assert.equal(hero.attackCycle.phase, AttackPhase.Idle);
  assert.equal(hero.attackCycle.cooldownRemainingMs, 0);
}

{
  const { sim, hero, foe } = pit();
  updateSim(sim, attackInput(), 0.05);
  const x = hero.x;
  foe.x = hero.x + 500;
  updateSim(sim, attackInput(), 0.05);
  assert.equal(hero.attackCycle.cooldownRemainingMs, 0);
  assert.notEqual(hero.attackCycle.phase, AttackPhase.Windup);
  updateSim(sim, attackInput(), 0.05);
  console.log('TRACE chase', 'dx', hero.x - x, 'queued', hero.attackCycle.queuedTargetId);
  assert.ok(hero.x !== x, 'hero did not chase after the windup cancel');
}

{
  const { sim, foe } = pit();
  foe.alive = false;
  sim.projectiles.push({
    id: sim.nextId++,
    team: 'ally',
    x: foe.x,
    y: foe.y,
    speed: 400,
    damage: 40,
    targetId: foe.id,
    attackerId: player(sim).id,
    life: 1,
    color: '#fff',
    radius: 4,
  });
  updateSim(sim, emptyInput(), 0.05);
  console.log('TRACE fizzle', 'hp', foe.hp, 'shots', sim.projectiles.length);
  assert.equal(foe.hp, 5000);
  assert.equal(foe.alive, false);
  assert.equal(sim.projectiles.length, 0);
}

{
  const sim = pastOpening(createMatch(sanctuary, barbarian, 1));
  const hero = player(sim);
  const rival = sim.units.find((unit) => unit.bot && unit.kind === 'champion' && unit.team !== hero.team);
  if (!rival) throw new Error('missing rival champion');
  hero.x = 2000;
  hero.y = 1400;
  rival.x = hero.x + 20;
  rival.y = hero.y;
  hero.armor = 0;
  rival.armor = 0;
  hero.ad = 80;
  rival.ad = 80;
  hero.hp = 80;
  hero.maxHp = 80;
  rival.hp = 80;
  rival.maxHp = 80;
  quiet(sim, [hero.id, rival.id]);
  const heroWind = attackProfile(hero.attackInterval, hero.attackRange).windupMs;
  const rivalWind = attackProfile(rival.attackInterval, rival.attackRange).windupMs;
  hero.attackCycle = {
    phase: AttackPhase.Windup,
    phaseElapsedMs: heroWind - 5,
    targetId: rival.id,
    cooldownRemainingMs: 0,
    queuedTargetId: null,
  };
  rival.attackCycle = {
    phase: AttackPhase.Windup,
    phaseElapsedMs: rivalWind - 5,
    targetId: hero.id,
    cooldownRemainingMs: 0,
    queuedTargetId: null,
  };
  hero.attackPaceMs = hero.attackInterval * 1000;
  rival.attackPaceMs = rival.attackInterval * 1000;
  rival.targetId = hero.id;
  updateSim(sim, attackInput(), 0.05);
  console.log('TRACE trade', 'hero', hero.alive, hero.hp, 'rival', rival.alive, rival.hp);
  assert.equal(hero.alive, false);
  assert.equal(rival.alive, false);
}

{
  const { sim, hero } = pit();
  const minion = spawnMinion(sim, 'fallen', 'ally', hero.x + 30, hero.y + 10, 0);
  const foe = spawnMinion(sim, 'quillrat', 'enemy', hero.x + 36, hero.y + 8, 0);
  foe.armor = 0;
  foe.hp = 400;
  foe.maxHp = 400;
  foe.ad = 0;
  foe.moveSpeed = 0;
  foe.stun = 30;
  foe.attackCd = 999;
  minion.attackCd = 0;
  minion.targetId = foe.id;
  minion.stun = 0;
  const hp = foe.hp;
  updateSim(sim, emptyInput(), 0.05);
  console.log('TRACE minion', 'drop', hp - foe.hp, 'heroPhase', hero.attackCycle.phase);
  assert.ok(foe.hp < hp, 'minion attack did not resolve on the same tick');
  assert.notEqual(hero.attackCycle.phase, AttackPhase.Backswing);
}

console.log('attack cycle tests passed');
