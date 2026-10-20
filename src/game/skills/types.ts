import type { Sim, Unit } from '../types';

export interface CastContext {
  sim: Sim;
  hero: Unit;
  rank: number;
  aimX: number;
  aimY: number;
}

export type SkillHandler = (ctx: CastContext) => boolean;
