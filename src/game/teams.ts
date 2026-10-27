import { ROSTER } from './data/classes/roster';
import { Rng } from './math';

export interface Seat {
  classId: string;
  name: string;
  tint: string;
  lane: number;
}

const ALLY_NAMES = ['Qual-Kehk', 'Larzuk', 'Anya', 'Malah'];
const ENEMY_NAMES = ['Korlic', 'Madawc', 'Talic', 'Bartuc', 'Toorc'];
const TINTS = ['#c4a574', '#8aa0b8', '#7d9a6a', '#b88898', '#d0b070', '#a07058', '#6a8a9a', '#c47858', '#9a7a4a'];

/**
 * Doc: "4 players on each side. No duplicate character on a side."
 * The player plus 3 AI allies, and 4 AI enemies. Each side draws distinct
 * classes from the doc roster. Until the other kits land, every AI seat
 * fights with the Barbarian body (stand-in, see NEEDS JOSEPH in the status file).
 */
export const SIDE_SIZE = 4;

export function dealTeams(seed: number, playerClass: string): { allies: Seat[]; enemies: Seat[] } {
  const rng = new Rng(seed);
  const pool = ROSTER.map((entry) => entry.id);
  return {
    allies: seats(SIDE_SIZE - 1, pool.filter((id) => id !== playerClass), ALLY_NAMES, [0, 1, 2], rng),
    enemies: seats(SIDE_SIZE, pool, ENEMY_NAMES, [0, 1, 2, 0], rng),
  };
}

function seats(count: number, source: string[], names: string[], lanes: number[], rng: Rng): Seat[] {
  const picked = shuffle(source, rng).slice(0, count);
  if (picked.length < count) throw new Error('not enough classes for a side without duplicates');
  return picked.map((classId, index) => ({
    classId,
    name: names[index] ?? `Hero ${index + 1}`,
    tint: TINTS[(index + names.length) % TINTS.length],
    lane: lanes[index] ?? index % 3,
  }));
}

function shuffle(list: string[], rng: Rng): string[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}
