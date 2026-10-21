import type { Sim, Unit } from '../types';

export interface CastContext {
  sim: Sim;
  hero: Unit;
  rank: number;
  aimX: number;
  aimY: number;
  /** Preferred unit for bash and stun. Ignored when it is out of reach. */
  focusId?: number | null;
}

export type SkillHandler = (ctx: CastContext) => boolean;
