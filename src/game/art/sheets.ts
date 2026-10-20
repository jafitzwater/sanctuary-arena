import pr23Manifest from './pr23-manifest.json';
import raven from '../../assets/art/generated/blood-raven.png';
import ravenWalk from '../../assets/art/generated/blood-raven-walk.png';
import lightIdle from '../../assets/art/d2/barb-light-idle.webp';
import lightWalk from '../../assets/art/d2/barb-light-walk.webp';
import lightRun from '../../assets/art/d2/barb-light-run.webp';
import lightAttack from '../../assets/art/d2/barb-light-attack.webp';
import mediumIdle from '../../assets/art/d2/barb-medium-idle.webp';
import mediumWalk from '../../assets/art/d2/barb-medium-walk.webp';
import mediumRun from '../../assets/art/d2/barb-medium-run.webp';
import mediumAttack from '../../assets/art/d2/barb-medium-attack.webp';
import heavyIdle from '../../assets/art/d2/barb-heavy-idle.webp';
import heavyWalk from '../../assets/art/d2/barb-heavy-walk.webp';
import heavyRun from '../../assets/art/d2/barb-heavy-run.webp';
import heavyAttack from '../../assets/art/d2/barb-heavy-attack.webp';
import rogueMerc from '../../assets/art/d2/rogue.webp';
import akaraSheet from '../../assets/art/d2/akara.webp';
import ground from '../../assets/art/d2/ground.webp';
import tree0 from '../../assets/art/d2/tree0.webp';
import tree1 from '../../assets/art/d2/tree1.webp';
import tree2 from '../../assets/art/d2/tree2.webp';
import tree3 from '../../assets/art/d2/tree3.webp';
import tree4 from '../../assets/art/d2/tree4.webp';
import rock0 from '../../assets/art/d2/rock0.webp';
import rock1 from '../../assets/art/d2/rock1.webp';
import rock2 from '../../assets/art/d2/rock2.webp';
import fence0 from '../../assets/art/d2/fence0.webp';
import fence1 from '../../assets/art/d2/fence1.webp';
import fence2 from '../../assets/art/d2/fence2.webp';
import stump0 from '../../assets/art/d2/stump0.webp';
import stump1 from '../../assets/art/d2/stump1.webp';
import stump2 from '../../assets/art/d2/stump2.webp';
import wagon0 from '../../assets/art/d2/wagon0.webp';
import tent0 from '../../assets/art/d2/tent0.webp';
import tent1 from '../../assets/art/d2/tent1.webp';
import tent2 from '../../assets/art/d2/tent2.webp';
import stone0 from '../../assets/art/d2/stone0.webp';
import stone1 from '../../assets/art/d2/stone1.webp';
import fallenIdle from '../../assets/art/d2/fallen-idle.webp';
import fallenWalk from '../../assets/art/d2/fallen-walk.webp';
import zombieIdle from '../../assets/art/d2/zombie-idle.webp';
import zombieWalk from '../../assets/art/d2/zombie-walk.webp';
import shamanIdle from '../../assets/art/d2/shaman-idle.webp';
import shamanWalk from '../../assets/art/d2/shaman-walk.webp';
import quill from '../../assets/art/d2/quillrat.webp';
import banner from '../../assets/art/d2/banner.webp';

/**
 * Real Spriters Resource atlases. Eight direction rows, southeast toward the
 * camera, then clockwise. Barbarian run and walk use only the leading
 * locomotion cells (12 run, 8 walk). The next blob on that row, and every
 * attack, get-hit, cast, and death band, is outside those rectangles.
 * The rectangles themselves live in gait.ts so the match test can read them
 * without loading image modules. They are re-exported here.
 */
export {
  HERO_COMBAT_BANDS,
  HERO_RUN_RECTS,
  HERO_WALK_RECTS,
  heroRectOverlapsCombat,
  heroSourceRect,
  type HeroArmor,
  type HeroCombatBand,
  type PixelRect,
} from '../gait';

/**
 * One magnification for idle, walk, and run.
 * The packed walk cell is the native pixel size (light 84, medium 104, heavy 102).
 * Run cells are taller (114 / 121 / 117) only because the sheet's tallest frame
 * sets the cell. Dividing by that cell shrinks a body that is the same source size.
 */
export const HERO_HEIGHT = 108;
export const HERO_NATIVE_PX = {
  light: 84,
  medium: 104,
  heavy: 102,
} as const;
export type HeroScaleTier = keyof typeof HERO_NATIVE_PX;

export function heroDrawScale(tier: HeroScaleTier, zoom = 1): number {
  return (HERO_HEIGHT * zoom) / HERO_NATIVE_PX[tier];
}

/** frameWidth and frameHeight are native pixels times that one scale. */
export function heroDrawBox(
  x: number,
  y: number,
  nativeW: number,
  nativeH: number,
  tier: HeroScaleTier,
  zoom = 1,
): { scale: number; frameWidth: number; frameHeight: number; drawX: number; drawY: number } {
  const scale = heroDrawScale(tier, zoom);
  const frameWidth = nativeW * scale;
  const frameHeight = nativeH * scale;
  return { scale, frameWidth, frameHeight, drawX: x - frameWidth / 2, drawY: y - frameHeight };
}

export const HERO_RUN_TOP: Record<HeroScaleTier, readonly (readonly number[])[]> = {
  light: [
    [26,28,20,11,9,10,13,18,20,23,26,27],
    [15,16,12,9,10,11,14,18,17,17,17,16],
    [7,4,1,3,6,8,12,14,11,9,8,8],
    [1,0,0,0,0,0,2,4,2,1,1,2],
    [16,7,0,0,2,3,7,10,9,11,14,16],
    [26,19,7,1,3,4,8,12,13,15,21,26],
    [29,28,14,3,2,3,7,12,13,17,25,32],
    [22,25,13,0,0,0,2,7,11,16,22,24],
  ],
  medium: [
    [18,20,13,9,10,10,14,17,16,16,18,19],
    [1,3,0,1,4,3,7,10,5,3,3,2],
    [0,0,0,3,10,7,12,15,6,2,0,0],
    [0,0,0,0,4,1,7,10,0,0,0,0],
    [2,0,0,3,11,8,15,19,7,4,4,3],
    [9,4,0,5,10,7,13,18,9,9,10,11],
    [11,9,0,0,2,1,7,13,6,11,12,12],
    [8,9,0,0,2,0,0,5,2,5,8,9],
  ],
  heavy: [
    [14,21,14,5,3,4,8,13,14,16,19,17],
    [9,10,6,3,4,6,9,13,12,11,11,10],
    [8,5,2,5,9,11,15,17,14,11,10,9],
    [6,0,0,0,5,7,12,13,9,7,7,7],
    [10,1,0,0,0,1,6,8,6,6,9,11],
    [11,7,0,0,0,0,3,6,6,10,15,13],
    [17,18,13,3,3,4,8,12,16,20,21,19],
    [8,14,10,0,0,0,0,5,9,14,13,11],
  ],
};

export const HERO_RUN_BOTTOM: Record<HeroScaleTier, readonly (readonly number[])[]> = {
  light: [
    [103,103,103,103,103,103,103,103,104,103,103,103],
    [104,104,104,104,104,104,104,104,104,104,104,104],
    [99,110,110,110,99,99,99,99,99,99,99,99],
    [87,87,100,100,87,87,87,87,87,87,87,87],
    [100,93,90,109,90,90,91,91,91,90,100,100],
    [104,100,91,91,91,91,92,91,92,93,104,104],
    [102,99,91,115,115,115,91,91,91,97,102,102],
    [90,89,89,89,89,89,89,89,91,93,90,90],
  ],
  medium: [
    [114,114,114,129,114,129,114,114,115,114,114,114],
    [116,116,116,105,105,105,105,105,105,105,105,105],
    [116,116,116,103,103,103,103,103,103,103,116,116],
    [105,106,106,90,90,90,90,90,90,90,90,90],
    [105,117,117,96,95,95,96,96,96,95,105,105],
    [110,106,97,97,97,97,98,97,98,99,110,110],
    [107,104,96,117,96,117,96,96,96,102,107,107],
    [98,97,97,115,115,115,97,97,99,101,98,98],
  ],
  heavy: [
    [104,104,104,104,104,104,104,104,104,104,104,104],
    [105,105,105,105,105,105,105,105,105,105,105,105],
    [106,116,116,116,106,106,106,106,106,106,106,106],
    [97,97,110,97,97,97,97,97,97,97,98,97],
    [100,96,112,112,112,90,90,90,90,90,100,100],
    [100,98,87,111,111,111,87,87,87,88,100,100],
    [108,105,95,119,119,119,95,95,95,102,108,108],
    [95,94,93,113,113,113,93,93,96,97,95,95],
  ],
};


/** Lowest opaque row in each run direction. The same value for all 12 frames. */
export function heroRunBaseline(tier: HeroScaleTier, row: number): number {
  const bottoms = HERO_RUN_BOTTOM[tier][row % 8];
  let baseline = bottoms[0];
  for (const bottom of bottoms) if (bottom > baseline) baseline = bottom;
  return baseline;
}

/**
 * Run only. The trimmed bitmap keeps its size at the shared scale, and its bottom
 * sits `lift` source pixels above the row baseline so a raised foot is not snapped down.
 * drawX is the center of the trimmed frame.
 */
export function heroRunDraw(
  x: number,
  y: number,
  nativeW: number,
  nativeH: number,
  tier: HeroScaleTier,
  row: number,
  frame: number,
  zoom = 1,
): { scale: number; frameWidth: number; frameHeight: number; drawX: number; drawY: number; baseline: number; lift: number } {
  const scale = heroDrawScale(tier, zoom);
  const frameWidth = nativeW * scale;
  const frameHeight = nativeH * scale;
  const baseline = heroRunBaseline(tier, row);
  const bottom = HERO_RUN_BOTTOM[tier][row % 8][frame % 12];
  const lift = baseline - bottom;
  return {
    scale,
    frameWidth,
    frameHeight,
    baseline,
    lift,
    drawX: x - frameWidth / 2,
    drawY: y - frameHeight - lift * scale,
  };
}

/**
 * Fallen, zombie, and fallen shaman walk the same way. The quill rat has no
 * sheet here — the plain rat sheet is not used — so quillrat.webp is drawn
 * in the Act I browns. ground.webp is 4 variants by 7 rows of 160×80 diamonds:
 * grass, shoulder, path, town, pale stone, dark, then grass-to-dirt
 * transitions facing east, south, west, and north.
 */
export const d2Atlas = {
  light: { idle: lightIdle, walk: lightWalk, run: lightRun, attack: lightAttack },
  medium: { idle: mediumIdle, walk: mediumWalk, run: mediumRun, attack: mediumAttack },
  heavy: { idle: heavyIdle, walk: heavyWalk, run: heavyRun, attack: heavyAttack },
  fallen: { idle: fallenIdle, walk: fallenWalk },
  zombie: { idle: zombieIdle, walk: zombieWalk },
  shaman: { idle: shamanIdle, walk: shamanWalk },
  quill,
  rogue: rogueMerc,
  akara: akaraSheet,
  ground,
  banner,
};

/** Act I outdoor and town objects, keyed off magenta. No drawn stand-ins. */
export const actProps = {
  tree: [tree0, tree1, tree2, tree3, tree4],
  rock: [rock0, rock1, rock2],
  fence: [fence0, fence1, fence2],
  stump: [stump0, stump1, stump2],
  wagon: [wagon0],
  tent: [tent0, tent1, tent2],
  stone: [stone0, stone1],
};

/** Blood Raven has no supplied sheet. */
export const monsterSheets = {
  raven,
  ravenWalk,
};

export const TWO_HAND_WCLASS = new Set(['2HS', '2HT', 'STF']);

interface Pr23Entry {
  file: string;
  rows: number;
  cols: number;
  placeholder: boolean;
  missing?: string;
  gifFrames?: number;
  groundRow?: number;
  source?: string;
}

const pr23Files = import.meta.glob('../../assets/art/d2/pr23/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const manifest = pr23Manifest as Record<string, Pr23Entry>;

function pr23Url(file: string): string {
  const hit = Object.entries(pr23Files).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`missing cut sheet ${file}`);
  return hit[1];
}

export interface FrameSheet {
  src: string;
  rows: number;
  cols: number;
}

export interface CastSheet {
  idle: FrameSheet;
  walk: FrameSheet;
  attack?: FrameSheet;
  placeholder: boolean;
  missing?: string;
  gifFrames?: number;
}

function frameOf(entry: Pr23Entry): FrameSheet {
  return { src: pr23Url(entry.file), rows: entry.rows, cols: entry.cols };
}

function must(key: string): Pr23Entry {
  const entry = manifest[key];
  if (!entry) throw new Error(`missing manifest entry ${key}`);
  return entry;
}

function castOf(stem: string): CastSheet {
  const walk = must(`${stem}-walk`);
  const idle = manifest[`${stem}-idle`] ?? walk;
  const attack = manifest[`${stem}-attack`];
  return {
    idle: frameOf(idle),
    walk: frameOf(walk),
    attack: attack ? frameOf(attack) : undefined,
    placeholder: Boolean(walk.placeholder || idle.placeholder),
    missing: walk.missing ?? idle.missing,
    gifFrames: walk.gifFrames,
  };
}

function singleOf(key: string): CastSheet {
  const entry = must(key);
  const frame = frameOf(entry);
  return {
    idle: frame,
    walk: frame,
    placeholder: entry.placeholder,
    missing: entry.missing,
  };
}

/** Cut PR #23 atlases. The hero's measured foot pivot is not in this set. */
export const pr23Cast = {
  rogue: castOf('minion-hero-basic-rogue'),
  guard: castOf('minion-hero-hard-guard'),
  valkyrie: singleOf('minion-hero-medium-valkyrie'),
  fallen: castOf('minion-enemy-basic-fallen'),
  goatman: castOf('minion-enemy-basic-goatman'),
  sandraider: castOf('minion-enemy-medium-sandraider'),
  blunderbore: castOf('minion-enemy-medium-blunderbore'),
  destruction: castOf('minion-enemy-hard-destruction'),
  bovine: castOf('minion-enemy-hard-bovine'),
  diablo: castOf('boss-herald-diablo'),
  duriel: castOf('boss-arena-duriel'),
  andariel: castOf('boss-arena-andariel'),
  heroPath: castOf('tower-hero-path'),
  enemyPath: castOf('tower-enemy-path'),
  heroBase: castOf('tower-hero-base'),
  enemyBase: castOf('tower-enemy-base'),
};

export const mephisto = {
  idle: frameOf(must('boss-herald-mephisto-idle-walk')),
  walk: frameOf(must('boss-herald-mephisto-walk-walk')),
  attack1: frameOf(must('boss-herald-mephisto-attack-1-walk')),
  attack2: frameOf(must('boss-herald-mephisto-attack-2-walk')),
  getHit: frameOf(must('boss-herald-mephisto-get-hit-walk')),
  death: frameOf(must('boss-herald-mephisto-death-walk')),
  die: frameOf(must('boss-herald-mephisto-die-walk')),
};

export const pr23Boulders = [0, 1, 2].map((index) => pr23Url(`boulder${index}.webp`));

/**
 * #FF00FF, near-magenta halos, the grey and teal sheet backdrops, and a flat
 * near-white backdrop. Black is left alone so outlines survive.
 */
export function isSheetMatte(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return true;
  if (g <= 110 && r > 170 && b > 120 && Math.min(r, b) - g > 70 && Math.abs(r - b) < 120) return true;
  if (Math.abs(r - 170) <= 4 && Math.abs(g - 170) <= 4 && Math.abs(b - 170) <= 4) return true;
  if (r < 18 && Math.abs(g - 128) <= 18 && Math.abs(b - 128) <= 18) return true;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return chroma <= 12 && r >= 220 && g >= 220 && b >= 220;
}
