import { ROSTER } from './data/classes/roster';
import { itemById } from './data/items';
import { MAX_LEVEL } from './combat';
import type { Loadout, Sim, Team, Unit } from './types';

/**
 * Post-match flow, Wild Rift style (Joseph t309u). Pure state + summary data, read-only on the sim.
 * Steps: VICTORY/DEFEAT banner -> game breakdown (both teams' scoreboard) -> character breakdown
 * (the player's performance bars) with "Play another match" and "Back to main screen".
 * Only stats the sim already tracks are used. Not tracked (skipped, see sanctuary-status.md):
 * damage dealt, damage taken, healing, total gold earned, per-bot kills and assists, bot items
 * (bots never shop), structure damage, vision, a game score or MVP rating.
 */
export type PostStep = 'banner' | 'game' | 'character';
export type PostResult = 'victory' | 'defeat';
export type PostAction = 'continue' | 'again' | 'menu';

/** [TEMP] Seconds the banner holds before the game breakdown opens on its own (a tap skips it). */
export const POST_BANNER_SECONDS = 3;
/** [TEMP] Last hits per minute that fills the last-hits bar. */
export const POST_CS_PER_MIN_FULL = 10;

export interface PostMatch {
  result: PostResult;
  step: PostStep;
  /** Seconds spent on the current step. */
  t: number;
}

export function startPostMatch(phase: Sim['phase']): PostMatch {
  if (phase === 'playing') throw new Error('The match is still being played');
  return { result: phase, step: 'banner', t: 0 };
}

export function tickPostMatch(pm: PostMatch, dt: number): PostMatch {
  const t = pm.t + Math.max(0, dt);
  if (pm.step === 'banner' && t >= POST_BANNER_SECONDS) return { ...pm, step: 'game', t: 0 };
  return { ...pm, t };
}

/**
 * Where an action leads. `continue` steps banner -> game -> character (the last step stays).
 * `again` and `menu` only exist on the character breakdown and leave the flow: a fresh match,
 * or the main screen (character select).
 */
export function postMatchAction(pm: PostMatch, action: PostAction): { post: PostMatch | null; mode: 'end' | 'play' | 'title' } {
  if (action === 'continue') {
    const step: PostStep = pm.step === 'banner' ? 'game' : 'character';
    return { post: { ...pm, step, t: 0 }, mode: 'end' };
  }
  if (pm.step !== 'character') return { post: pm, mode: 'end' };
  return { post: null, mode: action === 'again' ? 'play' : 'title' };
}

export interface ScoreRow {
  id: number;
  name: string;
  classId: string;
  className: string;
  you: boolean;
  level: number;
  /** null where the sim does not track it (bot kills and assists). */
  kills: number | null;
  deaths: number;
  assists: number | null;
  /** Gold held plus the purchase price of worn gear (bots never shop, so purse only). */
  netWorth: number;
  items: (string | null)[];
  highlights: string[];
}

export interface TeamSummary {
  team: Team;
  kills: number;
  /** Enemy towers, seals and Worldstone this team destroyed. */
  structures: number;
  rows: ScoreRow[];
}

export interface PerfBar {
  label: string;
  value: string;
  /** 0..1 */
  fill: number;
  note: string;
}

export interface MatchSummary {
  result: PostResult;
  time: number;
  mapName: string;
  teams: [TeamSummary, TeamSummary];
  you: ScoreRow;
  bars: PerfBar[];
  cs: number;
}

const GEAR_ORDER: (keyof Loadout)[] = ['weapon', 'offhand', 'armor', 'helm', 'belt'];

function gearValue(loadout: Loadout): number {
  let sum = 0;
  for (const slot of GEAR_ORDER) {
    const id = loadout[slot];
    if (id) sum += itemById(id)?.cost ?? 0;
  }
  return sum;
}

function rowFor(sim: Sim, unit: Unit): ScoreRow {
  const you = unit.id === sim.playerId;
  const classId = you ? sim.classDef.id : (unit.look ?? unit.defId);
  return {
    id: unit.id,
    name: unit.name,
    classId,
    className: you ? sim.classDef.name : (ROSTER.find((entry) => entry.id === classId)?.name ?? classId),
    you,
    level: you ? sim.level : unit.level,
    kills: you ? sim.kills : null,
    deaths: you ? sim.deaths : unit.deathCount,
    assists: you ? sim.assists : null,
    netWorth: Math.round(you ? sim.gold + gearValue(sim.loadout) : (unit.purse ?? 0)),
    items: you ? GEAR_ORDER.map((slot) => sim.loadout[slot]) : GEAR_ORDER.map(() => null),
    highlights: [],
  };
}

/** [TEMP] Highlight medals from tracked stats only: top level, top net worth, fewest deaths (per team, no ties). */
function addHighlights(rows: ScoreRow[]): void {
  if (!rows.length) return;
  const best = (score: (row: ScoreRow) => number, label: string) => {
    let top = rows[0];
    for (const row of rows) if (score(row) > score(top)) top = row;
    if (rows.some((row) => row !== top && score(row) === score(top))) return;
    top.highlights.push(label);
  };
  best((row) => row.level, 'Highest level');
  best((row) => row.netWorth, 'Richest');
  best((row) => -row.deaths, 'Fewest deaths');
  for (const row of rows) if (row.kills != null && row.kills >= 3) row.highlights.push(`${row.kills} kills`);
}

function structuresDestroyed(sim: Sim, by: Team): number {
  const foe: Team = by === 'ally' ? 'enemy' : 'ally';
  return sim.units.filter((u) => u.team === foe && (u.kind === 'tower' || u.kind === 'seal' || u.kind === 'base') && !u.alive).length;
}

export function summarizeMatch(sim: Sim): MatchSummary {
  const result: PostResult = sim.phase === 'defeat' ? 'defeat' : 'victory';
  const teams = (['ally', 'enemy'] as const).map((team) => {
    const rows = sim.units
      .filter((u) => u.kind === 'champion' && u.team === team)
      .sort((a, b) => (a.id === sim.playerId ? -1 : b.id === sim.playerId ? 1 : a.id - b.id))
      .map((u) => rowFor(sim, u));
    addHighlights(rows);
    return { team, kills: team === 'ally' ? sim.allyKills : sim.enemyKills, structures: structuresDestroyed(sim, team), rows };
  }) as [TeamSummary, TeamSummary];
  const you = teams[0].rows.find((row) => row.you) ?? rowFor(sim, sim.units.find((u) => u.id === sim.playerId) as Unit);
  const teamKills = Math.max(1, sim.allyKills);
  const teamDeaths = Math.max(1, sim.enemyKills);
  const richest = Math.max(1, ...teams.flatMap((t) => t.rows.map((r) => r.netWorth)));
  const minutes = Math.max(1 / 60, sim.time / 60);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const kp = (sim.kills + sim.assists) / teamKills;
  const bars: PerfBar[] = [
    { label: 'Kill participation', value: pct(Math.min(1, kp)), fill: kp, note: `${sim.kills + sim.assists} of ${sim.allyKills} team kills` },
    { label: 'Kills', value: String(sim.kills), fill: sim.kills / teamKills, note: 'share of team kills' },
    { label: 'Assists', value: String(sim.assists), fill: sim.assists / teamKills, note: 'share of team kills' },
    { label: 'Deaths', value: String(sim.deaths), fill: sim.deaths / teamDeaths, note: 'share of team deaths' },
    { label: 'Last hits', value: String(sim.cs), fill: sim.cs / minutes / POST_CS_PER_MIN_FULL, note: `${(sim.cs / minutes).toFixed(1)} per minute` },
    { label: 'Net worth', value: String(you.netWorth), fill: you.netWorth / richest, note: 'gold + gear, vs richest hero' },
    { label: 'Level', value: String(sim.level), fill: sim.level / MAX_LEVEL, note: `of ${MAX_LEVEL}` },
  ].map((bar) => ({ ...bar, fill: Math.max(0, Math.min(1, Number.isFinite(bar.fill) ? bar.fill : 0)) }));
  return { result, time: sim.time, mapName: sim.map.name, teams, you, bars, cs: sim.cs };
}
