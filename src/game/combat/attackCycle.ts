/**
 * Auto-attack cycle for champions. Pure step: no DOM, canvas, or Math.random.
 * A server can run the same function on the same state, input, and dt.
 *
 * The existing attack interval is the time from one attack's start to the next
 * attack's start, so standing and orb-walk damage share that cadence.
 * windupMs and backswingMs are each 30% of that interval. The cooldown phase
 * is the remaining 40%. The cooldown clock starts at the trigger and lasts
 * attackIntervalMs - windupMs, which is backswing plus that remainder.
 * The next windup can start at trigger + (attackIntervalMs - windupMs).
 */

export enum AttackPhase {
  Idle = 'Idle',
  Windup = 'Windup',
  Backswing = 'Backswing',
  Cooldown = 'Cooldown',
}

export const WINDUP_SHARE = 0.3;
export const BACKSWING_SHARE = 0.3;

export interface AttackProfile {
  /** Cast point. 30% of the base attack time. */
  windupMs: number;
  /** Follow-through. 30% of the base attack time. Movement cancels what is left. */
  backswingMs: number;
  /** Base attack time, in milliseconds. Start of one attack to the start of the next. */
  attackIntervalMs: number;
  range: number;
  projectile?: { speed: number };
}

export interface AttackState {
  phase: AttackPhase;
  phaseElapsedMs: number;
  targetId: number | null;
  cooldownRemainingMs: number;
  queuedTargetId: number | null;
}

export type AttackCancelReason = 'move' | 'target-dead' | 'invalid' | 'out-of-range' | 'dead';

export type AttackEvent =
  | { type: 'AttackStarted'; targetId: number }
  | { type: 'AttackFired'; targetId: number; melee: boolean }
  | { type: 'AttackCanceled'; reason: AttackCancelReason; targetId: number | null }
  | { type: 'BackswingCanceled'; targetId: number | null };

export interface AttackTargetView {
  id: number;
  alive: boolean;
  inRange: boolean;
}

export interface AttackInput {
  dtMs: number;
  /** Stick tilt at least 0.15, or any other move command, this tick. */
  move: boolean;
  /** Attack order. The same id during windup must not restart the cast. */
  orderTargetId: number | null;
  /** Keep chasing after the target walks out of range. */
  orderPersists: boolean;
  target: AttackTargetView | null;
  attackerAlive: boolean;
  /**
   * newInterval / oldInterval. Scales the time left in the current phase
   * and the cooldown. Pass 1 when the attack speed did not change.
   */
  intervalScale: number;
  /** Movement wins: a move command does not begin a new windup on this tick. */
  allowStart: boolean;
}

/** Profile whose full cycle equals the existing attack interval, in seconds. */
export function attackProfile(intervalSec: number, range: number, projectileSpeed?: number): AttackProfile {
  const attackIntervalMs = intervalSec * 1000;
  const profile: AttackProfile = {
    windupMs: attackIntervalMs * WINDUP_SHARE,
    backswingMs: attackIntervalMs * BACKSWING_SHARE,
    attackIntervalMs,
    range,
  };
  if (projectileSpeed != null) profile.projectile = { speed: projectileSpeed };
  return profile;
}

/** Time from the trigger until the next windup may start. */
export function cooldownAtTrigger(profile: AttackProfile): number {
  return profile.attackIntervalMs - profile.windupMs;
}

export function createAttackState(): AttackState {
  return {
    phase: AttackPhase.Idle,
    phaseElapsedMs: 0,
    targetId: null,
    cooldownRemainingMs: 0,
    queuedTargetId: null,
  };
}

export function cancelAttackForMove(state: AttackState): { state: AttackState; events: AttackEvent[] } {
  if (state.phase === AttackPhase.Windup) {
    return {
      state: createAttackState(),
      events: [{ type: 'AttackCanceled', reason: 'move', targetId: state.targetId }],
    };
  }
  if (state.phase === AttackPhase.Backswing) {
    const cooldown = state.cooldownRemainingMs;
    return {
      state: {
        phase: cooldown > 0 ? AttackPhase.Cooldown : AttackPhase.Idle,
        phaseElapsedMs: 0,
        targetId: null,
        cooldownRemainingMs: cooldown,
        queuedTargetId: state.queuedTargetId,
      },
      events: [{ type: 'BackswingCanceled', targetId: state.targetId }],
    };
  }
  return { state, events: [] };
}

function idleCanceled(reason: AttackCancelReason, queued: number | null): AttackState {
  return {
    phase: AttackPhase.Idle,
    phaseElapsedMs: 0,
    targetId: null,
    cooldownRemainingMs: 0,
    queuedTargetId: reason === 'out-of-range' ? queued : null,
  };
}

export function stepAttack(
  prev: AttackState,
  profile: AttackProfile,
  input: AttackInput,
): { state: AttackState; events: AttackEvent[] } {
  const events: AttackEvent[] = [];
  let state: AttackState = { ...prev };
  const scale = input.intervalScale > 0 ? input.intervalScale : 1;
  if (scale !== 1 && state.phase !== AttackPhase.Idle) {
    state = {
      ...state,
      phaseElapsedMs: state.phaseElapsedMs * scale,
      cooldownRemainingMs: state.cooldownRemainingMs * scale,
    };
  }

  if (!input.attackerAlive) {
    if (state.phase === AttackPhase.Windup) {
      events.push({ type: 'AttackCanceled', reason: 'dead', targetId: state.targetId });
    }
    return { state: createAttackState(), events };
  }

  if (input.move && state.phase === AttackPhase.Windup) {
    events.push({ type: 'AttackCanceled', reason: 'move', targetId: state.targetId });
    return { state: createAttackState(), events };
  }
  if (input.move && state.phase === AttackPhase.Backswing) {
    events.push({ type: 'BackswingCanceled', targetId: state.targetId });
    const cooldown = state.cooldownRemainingMs;
    state = {
      phase: cooldown > 0 ? AttackPhase.Cooldown : AttackPhase.Idle,
      phaseElapsedMs: 0,
      targetId: null,
      cooldownRemainingMs: cooldown,
      queuedTargetId: input.orderTargetId ?? state.queuedTargetId,
    };
  }

  const allowStart = input.allowStart && !input.move;
  let budget = Math.max(0, input.dtMs);
  for (let guard = 0; guard < 4 && budget >= 0; guard++) {
    if (state.phase === AttackPhase.Windup) {
      const target = input.target;
      if (!target || target.id !== state.targetId) {
        events.push({ type: 'AttackCanceled', reason: 'invalid', targetId: state.targetId });
        state = idleCanceled('invalid', null);
        break;
      }
      if (!target.alive) {
        events.push({ type: 'AttackCanceled', reason: 'target-dead', targetId: state.targetId });
        state = idleCanceled('target-dead', null);
        break;
      }
      if (!target.inRange) {
        const queued = input.orderPersists ? state.targetId : null;
        events.push({ type: 'AttackCanceled', reason: 'out-of-range', targetId: state.targetId });
        state = idleCanceled('out-of-range', queued);
        break;
      }
      const need = profile.windupMs - state.phaseElapsedMs;
      if (budget + 1e-6 < need) {
        state = { ...state, phaseElapsedMs: state.phaseElapsedMs + budget };
        budget = 0;
        break;
      }
      budget -= Math.max(0, need);
      state = {
        ...state,
        phase: AttackPhase.Backswing,
        phaseElapsedMs: 0,
        cooldownRemainingMs: cooldownAtTrigger(profile),
      };
      events.push({
        type: 'AttackFired',
        targetId: state.targetId as number,
        melee: profile.projectile == null,
      });
      continue;
    }

    if (state.phase === AttackPhase.Backswing) {
      const need = profile.backswingMs - state.phaseElapsedMs;
      const use = Math.min(budget, Math.max(0, need));
      state = {
        ...state,
        phaseElapsedMs: state.phaseElapsedMs + use,
        cooldownRemainingMs: Math.max(0, state.cooldownRemainingMs - use),
      };
      budget -= use;
      if (state.phaseElapsedMs + 1e-6 < profile.backswingMs) break;
      state = {
        phase: state.cooldownRemainingMs > 1e-6 ? AttackPhase.Cooldown : AttackPhase.Idle,
        phaseElapsedMs: 0,
        targetId: null,
        cooldownRemainingMs: state.cooldownRemainingMs,
        queuedTargetId: input.orderTargetId ?? state.queuedTargetId,
      };
      continue;
    }

    if (state.phase === AttackPhase.Cooldown) {
      const use = Math.min(budget, state.cooldownRemainingMs);
      state = { ...state, cooldownRemainingMs: state.cooldownRemainingMs - use, phaseElapsedMs: state.phaseElapsedMs + use };
      budget -= use;
      if (state.cooldownRemainingMs > 1e-6) {
        if (input.orderTargetId != null) state = { ...state, queuedTargetId: input.orderTargetId };
        break;
      }
      state = {
        phase: AttackPhase.Idle,
        phaseElapsedMs: 0,
        targetId: null,
        cooldownRemainingMs: 0,
        queuedTargetId: input.orderTargetId ?? state.queuedTargetId,
      };
      continue;
    }

    const order = input.orderTargetId ?? state.queuedTargetId;
    const target = input.target;
    if (
      allowStart &&
      order != null &&
      target &&
      target.id === order &&
      target.alive &&
      target.inRange &&
      state.cooldownRemainingMs <= 1e-6
    ) {
      state = {
        phase: AttackPhase.Windup,
        phaseElapsedMs: 0,
        targetId: order,
        cooldownRemainingMs: 0,
        queuedTargetId: null,
      };
      events.push({ type: 'AttackStarted', targetId: order });
      continue;
    }
    if (order != null && input.orderPersists) state = { ...state, queuedTargetId: order };
    budget = 0;
    break;
  }

  return { state, events };
}
