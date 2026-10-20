import type { Sim, Team, Unit, UnitKind } from './types';

export function byId(sim: Sim, id: number | null | undefined): Unit | undefined {
  if (id == null) return undefined;
  return sim.units.find((unit) => unit.id === id);
}

export function player(sim: Sim): Unit {
  const unit = byId(sim, sim.playerId);
  if (!unit) throw new Error('Player champion is missing');
  return unit;
}

export function findBase(sim: Sim, team: Team): Unit {
  const base = sim.units.find((unit) => unit.kind === 'base' && unit.team === team);
  if (!base) throw new Error(`Missing ${team} base`);
  return base;
}

export function nearestEnemy(
  sim: Sim,
  from: Unit,
  reach: number,
  allow?: (unit: Unit) => boolean,
): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const other of sim.units) {
    if (!other.alive || other.team === from.team) continue;
    if (allow && !allow(other)) continue;
    const d = Math.hypot(other.x - from.x, other.y - from.y);
    if (d <= reach + other.radius && d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

export function inRange(attacker: Unit, target: Unit): boolean {
  return Math.hypot(attacker.x - target.x, attacker.y - target.y) <= attacker.attackRange + target.radius;
}

export function isStructure(kind: UnitKind): boolean {
  return kind === 'tower' || kind === 'base' || kind === 'seal';
}
