/**
 * t345u: Rakanishu's lightning. Pure sim logic: triggerSparks queues bolts when Rakanishu is hit;
 * resolveSparks (called from updateSim) lands them after SPARK_DELAY with the dodge rule from data/rakanishu.ts.
 */
import {
  RAKANISHU_ID,
  SPARK_COOLDOWN,
  SPARK_DAMAGE,
  SPARK_DELAY,
  SPARK_DODGE_SLACK,
  SPARK_FADE,
  SPARK_RADIUS,
} from './data/rakanishu';
import type { Sim, Spark, Unit } from './types';

/** Non-mob units the lightning can strike: living heroes and lane minions (never wild camp units, towers, bases). */
export function sparkVictim(unit: Unit): boolean {
  return unit.alive && unit.team !== 'wild' && (unit.kind === 'champion' || unit.kind === 'minion');
}

/** Called after Rakanishu takes a hit. Starts a burst unless one started less than SPARK_COOLDOWN ago. */
export function triggerSparks(sim: Sim, boss: Unit): boolean {
  if (boss.defId !== RAKANISHU_ID || !boss.alive) return false;
  if (boss.sparkCd > 0) return false;
  boss.sparkCd = SPARK_COOLDOWN;
  sim.sparks.push({ kind: 'burst', id: sim.nextId++, fromId: boss.id, x0: boss.x, y0: boss.y, tx: boss.x, ty: boss.y, targetId: 0, t: 0, life: 0.5, landed: true, hit: false });
  for (const unit of sim.units) {
    if (!sparkVictim(unit)) continue;
    if (Math.hypot(unit.x - boss.x, unit.y - boss.y) > SPARK_RADIUS + unit.radius) continue;
    sim.sparks.push({
      kind: 'bolt',
      id: sim.nextId++,
      fromId: boss.id,
      x0: boss.x,
      y0: boss.y,
      tx: unit.x,
      ty: unit.y,
      targetId: unit.id,
      t: 0,
      life: SPARK_DELAY + SPARK_FADE,
      landed: false,
      hit: false,
    });
  }
  return true;
}

/** Dodge rule: still within its own radius + slack of the spot the bolt was aimed at when it lands. */
export function boltConnects(bolt: Spark, unit: Unit | undefined): boolean {
  if (!unit || !sparkVictim(unit)) return false;
  return Math.hypot(unit.x - bolt.tx, unit.y - bolt.ty) <= unit.radius + SPARK_DODGE_SLACK;
}

/** Advances bolts; a bolt that reaches SPARK_DELAY lands once: damage(target) if it connects, else a miss. */
export function resolveSparks(sim: Sim, dt: number, damage: (target: Unit, attacker: Unit | null, amount: number) => void): void {
  for (const spark of sim.sparks) {
    spark.t += dt;
    if (spark.kind !== 'bolt' || spark.landed || spark.t < SPARK_DELAY) continue;
    spark.landed = true;
    const target = sim.units.find((unit) => unit.id === spark.targetId);
    if (!boltConnects(spark, target)) continue;
    spark.hit = true;
    const boss = sim.units.find((unit) => unit.id === spark.fromId) ?? null;
    damage(target as Unit, boss, SPARK_DAMAGE);
  }
  sim.sparks = sim.sparks.filter((spark) => spark.t < spark.life);
}
