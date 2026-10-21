import { HERO_FACING_DEADBAND, STICK_GAIT_HOLD_MS, STICK_IDLE_TILT, STICK_RUN_TILT } from './data/classes/barbarian';

export { STICK_GAIT_HOLD_MS, STICK_IDLE_TILT, STICK_RUN_TILT };

/** One direction of the run cycle. The source row continues past this into the next action. */
export const RUN_FRAMES = 12;
/**
 * Fixed run cadence. Twelve frames at 40ms is a 480ms stride.
 * At 216 px/s that stride is 103.68px.
 */
export const RUN_FRAME_MS = 40;
/** Town walk is the first eight frames of each direction row. Frame 9 is the next action. */
export const WALK_FRAMES = 8;
/** Walk cadence stays inside 55–60ms. Eight real columns. */
export const WALK_FRAME_MS = 58;

export type HeroArmor = 'light' | 'medium' | 'heavy';
/** Source-sheet crop. x1 and y1 are exclusive, matching the atlas cut. */
export type PixelRect = readonly [number, number, number, number];
export type HeroAction = 'attack' | 'hit' | 'cast' | 'death';
export interface HeroCombatBand {
  action: HeroAction;
  y0: number;
  y1: number;
}

/** Actual speed at or above this is the run cycle. Town click-to-move stays at 144. */
export const HERO_RUN_SPEED = 180;

export interface HeroGaitStep {
  moving: boolean;
  elapsed: number;
  speed: number;
  running: boolean;
}

/**
 * Advance the locomotion clock from displacement only.
 * Facing, the deadband, and the held row are not inputs, so a turn cannot pause or reset it.
 */
export function heroGaitStep(elapsed: number, step: number, dt: number): HeroGaitStep {
  const moving = step > 0.4;
  const speed = dt > 0 ? step / dt : 0;
  return {
    moving,
    speed,
    elapsed: elapsed + (moving && dt > 0 ? dt * 1000 : 0),
    running: moving && speed >= HERO_RUN_SPEED,
  };
}

/**
 * Joystick and keyboard ignore the town walk scale.
 * A directing stick walks at 144 or runs at 216 from its own tilt, including inside camp.
 * Click-to-move inside the shop radius stays at walkSpeed / runSpeed.
 */
export function heroMoveScale(inTown: boolean, direct: boolean, walkSpeed: number, runSpeed: number): number {
  if (direct) {
    if (stickDirecting && runSpeed > 0) {
      if (commandedGait === 'walk') return walkSpeed / runSpeed;
      if (commandedGait === 'idle') return 0;
    }
    return 1;
  }
  if (!inTown || runSpeed <= 0) return 1;
  return walkSpeed / runSpeed;
}

export type StickGait = 'idle' | 'walk' | 'run';

export interface StickGaitMemory {
  gait: StickGait;
  hold: 'walk' | 'run' | null;
  holdMs: number;
}

/** Last stick command. Direct input that never committed a tilt stays a full run. */
let commandedGait: StickGait = 'idle';
let stickDirecting = false;

export function readStickMotion(): { gait: StickGait; directing: boolean } {
  return { gait: commandedGait, directing: stickDirecting };
}

export function commitStickGait(gait: StickGait, directing: boolean): void {
  commandedGait = gait;
  stickDirecting = directing;
}

/**
 * Tilt below 0.15 is idle immediately. Leaving idle is immediate.
 * Walk and run change only after the tilt stays on the other side of 0.60 for 150ms.
 */
export function stepStickGait(memory: StickGaitMemory, tilt: number, dtMs: number): StickGaitMemory {
  const raw: StickGait = tilt < STICK_IDLE_TILT ? 'idle' : tilt <= STICK_RUN_TILT ? 'walk' : 'run';
  if (raw === 'idle' || memory.gait === 'idle' || raw === memory.gait) {
    const gait = raw === 'idle' || memory.gait === 'idle' ? raw : memory.gait;
    return { gait, hold: null, holdMs: 0 };
  }
  const held = (memory.hold === raw ? memory.holdMs : 0) + Math.max(0, dtMs);
  if (held >= STICK_GAIT_HOLD_MS) return { gait: raw, hold: null, holdMs: 0 };
  return { gait: memory.gait, hold: raw, holdMs: held };
}

/** currentFrame = floor(elapsedAnimTime / frameDuration) % totalFrames. Never past the last frame. */
export function animFrame(elapsedMs: number, frameMs: number, totalFrames: number): number {
  if (totalFrames <= 1 || frameMs <= 0) return 0;
  const elapsed = elapsedMs < 0 ? 0 : elapsedMs;
  return Math.floor(elapsed / frameMs) % totalFrames;
}

/** Pixels covered by one full cycle when speed is constant. Same dt feeds both. */
export function strideLength(speed: number, frameMs: number, frames: number): number {
  return (speed * frames * frameMs) / 1000;
}

/**
 * Run cells: eight even direction rows, frames 0–11 only.
 * Sheet row 0 is southeast (toward the camera). Rows then turn clockwise.
 */
export const HERO_RUN_RECTS: Record<HeroArmor, readonly (readonly PixelRect[])[]> = {
  light: [
    [[31,3512,105,3626], [159,3512,238,3626], [290,3512,378,3626], [439,3512,523,3626], [578,3512,657,3626], [712,3512,791,3626], [847,3512,926,3626], [973,3512,1058,3626], [1098,3512,1188,3626], [1228,3512,1319,3626], [1358,3512,1448,3626], [1499,3512,1578,3626]],
    [[37,3732,96,3838], [157,3732,222,3838], [276,3732,358,3838], [412,3732,499,3838], [548,3732,638,3838], [670,3732,774,3838], [806,3732,907,3838], [945,3732,1036,3838], [1085,3732,1167,3838], [1222,3732,1302,3838], [1360,3732,1437,3838], [1509,3732,1571,3838]],
    [[34,3953,98,4064], [157,3953,216,4064], [280,3953,347,4064], [409,3953,484,4064], [537,3953,619,4064], [670,3953,752,4064], [806,3953,885,4064], [943,3953,1018,4064], [1081,3953,1154,4064], [1227,3953,1294,4064], [1360,3953,1438,4064], [1505,3953,1572,4064]],
    [[19,4177,102,4278], [148,4177,228,4278], [278,4177,352,4278], [410,4177,482,4278], [543,4177,616,4278], [677,4177,749,4278], [811,4177,882,4278], [945,4177,1016,4278], [1083,4177,1157,4278], [1218,4177,1298,4278], [1359,4177,1441,4278], [1489,4177,1576,4278]],
    [[34,4386,115,4496], [165,4386,248,4496], [293,4386,376,4496], [418,4386,497,4496], [550,4386,627,4496], [684,4386,760,4496], [818,4386,897,4496], [953,4386,1036,4496], [1092,4386,1175,4496], [1229,4386,1315,4496], [1367,4386,1452,4496], [1503,4386,1589,4496]],
    [[41,4601,114,4710], [180,4601,246,4710], [312,4601,392,4710], [440,4601,522,4710], [570,4601,666,4710], [703,4601,799,4710], [847,4601,932,4710], [976,4601,1064,4710], [1111,4601,1191,4710], [1244,4601,1324,4710], [1376,4601,1455,4710], [1511,4601,1575,4710]],
    [[43,4820,114,4936], [186,4820,263,4936], [323,4820,390,4936], [454,4820,536,4936], [587,4820,672,4936], [723,4820,810,4936], [855,4820,951,4936], [992,4820,1079,4936], [1123,4820,1196,4936], [1251,4820,1316,4936], [1377,4820,1446,4936], [1513,4820,1589,4936]],
    [[33,5046,112,5152], [174,5046,256,5152], [316,5046,398,5152], [456,5046,526,5152], [591,5046,660,5152], [725,5046,794,5152], [860,5046,936,5152], [992,5046,1066,5152], [1120,5046,1197,5152], [1246,5046,1327,5152], [1374,5046,1454,5152], [1504,5046,1582,5152]],
  ],
  medium: [
    [[36,1960,101,2090], [164,1960,235,2090], [301,1960,373,2090], [442,1960,512,2090], [578,1960,647,2090], [712,1960,781,2090], [846,1960,915,2090], [978,1960,1048,2090], [1109,1960,1179,2090], [1239,1960,1311,2090], [1372,1960,1441,2090], [1506,1960,1575,2090]],
    [[35,2206,96,2323], [153,2206,224,2323], [281,2206,358,2323], [412,2206,498,2323], [536,2206,633,2323], [679,2206,767,2323], [806,2206,900,2323], [944,2206,1033,2323], [1085,2206,1166,2323], [1229,2206,1302,2323], [1369,2206,1437,2323], [1505,2206,1570,2323]],
    [[35,2440,98,2557], [153,2440,216,2557], [280,2440,348,2557], [409,2440,483,2557], [519,2440,618,2557], [668,2440,751,2557], [805,2440,885,2557], [942,2440,1019,2557], [1081,2440,1154,2557], [1230,2440,1294,2557], [1370,2440,1438,2557], [1504,2440,1572,2557]],
    [[32,2681,100,2788], [159,2681,228,2788], [289,2681,352,2788], [421,2681,483,2788], [552,2681,617,2788], [676,2681,750,2788], [821,2681,883,2788], [957,2681,1017,2788], [1092,2681,1156,2788], [1229,2681,1296,2788], [1367,2681,1441,2788], [1502,2681,1574,2788]],
    [[37,2904,100,3022], [168,2904,236,3022], [298,2904,366,3022], [426,2904,494,3022], [559,2904,627,3022], [693,2904,761,3022], [827,2904,894,3022], [962,2904,1030,3022], [1099,2904,1169,3022], [1235,2904,1305,3022], [1372,2904,1440,3022], [1507,2904,1574,3022]],
    [[43,3134,103,3251], [181,3134,247,3251], [312,3134,386,3251], [440,3134,522,3251], [573,3134,666,3251], [707,3134,799,3251], [842,3134,932,3251], [978,3134,1056,3251], [1113,3134,1189,3251], [1246,3134,1315,3251], [1378,3134,1444,3251], [1513,3134,1576,3251]],
    [[45,3370,101,3488], [186,3370,247,3488], [323,3370,391,3488], [455,3370,534,3488], [587,3370,669,3488], [722,3370,807,3488], [857,3370,941,3488], [991,3370,1081,3488], [1123,3370,1200,3488], [1252,3370,1315,3488], [1379,3370,1443,3488], [1513,3370,1576,3488]],
    [[38,3609,106,3725], [177,3609,242,3725], [317,3609,380,3725], [454,3609,519,3725], [589,3609,651,3725], [723,3609,792,3725], [858,3609,926,3725], [992,3609,1065,3725], [1121,3609,1185,3725], [1249,3609,1316,3725], [1374,3609,1447,3725], [1508,3609,1580,3725]],
  ],
  heavy: [
    [[29,1855,105,1970], [162,1855,238,1970], [291,1855,379,1970], [439,1855,521,1970], [578,1855,658,1970], [712,1855,795,1970], [843,1855,929,1970], [972,1855,1060,1970], [1099,1855,1190,1970], [1228,1855,1318,1970], [1359,1855,1447,1970], [1503,1855,1579,1970]],
    [[34,2083,98,2192], [152,2083,222,2192], [276,2083,360,2192], [410,2083,501,2192], [546,2083,638,2192], [680,2083,772,2192], [816,2083,904,2192], [945,2083,1036,2192], [1085,2083,1168,2192], [1222,2083,1303,2192], [1360,2083,1439,2192], [1503,2083,1572,2192]],
    [[34,2305,95,2422], [152,2305,222,2422], [285,2305,346,2422], [408,2305,486,2422], [538,2305,624,2422], [665,2305,756,2422], [808,2305,886,2422], [943,2305,1018,2422], [1077,2305,1153,2422], [1226,2305,1292,2422], [1365,2305,1433,2422], [1498,2305,1568,2422]],
    [[24,2533,102,2644], [148,2533,228,2644], [277,2533,354,2644], [412,2533,485,2644], [537,2533,619,2644], [675,2533,753,2644], [811,2533,885,2644], [943,2533,1020,2644], [1080,2533,1157,2644], [1217,2533,1298,2644], [1360,2533,1440,2644], [1496,2533,1577,2644]],
    [[32,2761,115,2874], [163,2761,240,2874], [293,2761,375,2874], [420,2761,497,2874], [550,2761,628,2874], [684,2761,760,2874], [814,2761,897,2874], [952,2761,1037,2874], [1091,2761,1176,2874], [1229,2761,1315,2874], [1367,2761,1452,2874], [1502,2761,1581,2874]],
    [[40,2987,115,3099], [179,2987,246,3099], [310,2987,392,3099], [437,2987,523,3099], [568,2987,657,3099], [703,2987,798,3099], [838,2987,920,3099], [974,2987,1056,3099], [1109,2987,1191,3099], [1242,2987,1324,3099], [1375,2987,1454,3099], [1510,2987,1587,3099]],
    [[41,3206,110,3326], [185,3206,255,3326], [323,3206,391,3326], [451,3206,527,3326], [581,3206,673,3326], [717,3206,808,3326], [855,3206,939,3326], [990,3206,1065,3326], [1123,3206,1198,3326], [1253,3206,1322,3326], [1380,3206,1446,3326], [1513,3206,1582,3326]],
    [[34,3441,114,3555], [172,3441,255,3555], [315,3441,394,3555], [452,3441,530,3555], [585,3441,668,3555], [720,3441,804,3555], [856,3441,940,3555], [990,3441,1066,3555], [1119,3441,1197,3555], [1246,3441,1319,3555], [1372,3441,1454,3555], [1504,3441,1586,3555]],
  ],
};

/** Walk cells: the same eight rows, frames 0–7 only. */
export const HERO_WALK_RECTS: Record<HeroArmor, readonly (readonly PixelRect[])[]> = {
  light: [
    [[5,12,77,91], [77,12,153,91], [153,12,230,91], [230,12,304,91], [304,12,381,91], [382,12,456,91], [456,12,532,91], [532,12,608,91]],
    [[7,173,73,245], [79,173,150,245], [152,173,225,245], [229,173,300,245], [309,173,376,245], [381,173,452,245], [461,173,528,245], [535,173,604,245]],
    [[3,335,70,420], [84,335,146,420], [163,335,217,420], [222,335,295,420], [302,335,372,420], [390,335,446,420], [448,335,521,420], [522,335,597,420]],
    [[0,502,70,581], [79,502,146,581], [157,502,223,581], [232,502,301,581], [307,502,376,581], [384,502,452,581], [461,502,527,581], [535,502,602,581]],
    [[4,662,74,743], [74,662,150,743], [151,662,228,743], [228,662,304,743], [304,662,379,743], [379,662,456,743], [456,662,530,743], [530,662,607,743]],
    [[5,820,72,902], [77,820,148,902], [156,820,223,902], [232,820,300,902], [308,820,375,902], [384,820,450,902], [459,820,525,902], [534,820,604,902]],
    [[13,991,79,1074], [87,991,154,1074], [163,991,237,1074], [237,991,311,1074], [312,991,374,1074], [391,991,463,1074], [467,991,540,1074], [543,991,602,1074]],
    [[9,1159,73,1236], [78,1159,147,1236], [155,1159,224,1236], [231,1159,300,1236], [305,1159,377,1236], [382,1159,452,1236], [459,1159,528,1236], [536,1159,604,1236]],
  ],
  medium: [
    [[8,12,77,110], [82,12,156,110], [160,12,234,110], [238,12,313,110], [316,12,391,110], [394,12,469,110], [472,12,547,110], [550,12,624,110]],
    [[4,208,73,303], [76,208,151,303], [157,208,228,303], [234,208,304,303], [313,208,382,303], [390,208,460,303], [469,208,539,303], [544,208,619,303]],
    [[4,409,71,513], [83,409,148,513], [161,409,222,513], [239,409,302,513], [313,409,383,513], [394,409,461,513], [471,409,534,513], [550,409,612,513]],
    [[6,606,71,706], [80,606,148,706], [156,606,225,706], [231,606,303,706], [312,606,381,706], [387,606,459,706], [469,606,537,706], [548,606,615,706]],
    [[3,801,72,900], [76,801,150,900], [154,801,228,900], [233,801,306,900], [311,801,384,900], [389,801,462,900], [466,801,540,900], [544,801,619,900]],
    [[8,999,77,1096], [83,999,156,1096], [162,999,233,1096], [242,999,311,1096], [319,999,389,1096], [398,999,467,1096], [475,999,545,1096], [551,999,624,1096]],
    [[14,1190,77,1302], [90,1190,154,1302], [167,1190,232,1302], [244,1190,310,1302], [318,1190,388,1302], [398,1190,466,1302], [479,1190,543,1302], [558,1190,622,1302]],
    [[12,1396,74,1495], [86,1396,154,1495], [164,1396,234,1495], [242,1396,313,1495], [319,1396,391,1495], [398,1396,469,1495], [476,1396,546,1495], [554,1396,622,1495]],
  ],
  heavy: [
    [[11,12,83,114], [94,12,172,114], [182,12,261,114], [270,12,348,114], [358,12,435,114], [446,12,523,114], [534,12,611,114], [622,12,699,114]],
    [[7,213,80,304], [93,213,168,304], [181,213,255,304], [270,213,342,304], [358,213,430,304], [446,213,518,304], [533,213,606,304], [621,213,695,304]],
    [[16,405,74,505], [100,405,160,505], [183,405,247,505], [273,405,336,505], [356,405,425,505], [441,405,512,505], [533,405,599,505], [621,405,686,505]],
    [[7,604,78,705], [91,604,166,705], [178,604,255,705], [273,604,344,705], [360,604,432,705], [448,604,520,705], [536,604,607,705], [618,604,694,705]],
    [[7,803,81,901], [91,803,169,901], [178,803,258,901], [268,803,346,901], [356,803,434,901], [444,803,522,901], [531,803,610,901], [620,803,698,901]],
    [[12,1003,81,1102], [96,1003,173,1102], [185,1003,258,1102], [273,1003,345,1102], [362,1003,435,1102], [450,1003,521,1102], [537,1003,611,1102], [624,1003,696,1102]],
    [[17,1202,83,1301], [103,1202,167,1301], [191,1202,251,1301], [278,1202,341,1301], [364,1202,434,1301], [454,1202,524,1301], [543,1202,609,1301], [632,1202,694,1301]],
    [[13,1397,86,1501], [96,1397,173,1501], [183,1397,260,1501], [270,1397,343,1501], [358,1397,431,1501], [446,1397,519,1501], [535,1397,616,1501], [624,1397,702,1501]],
  ],
};

/**
 * Y ranges of the non-locomotion modes on the source sheet.
 * Medium has no separate cast block after get-hit; those rows are the death band.
 */
export const HERO_COMBAT_BANDS: Record<HeroArmor, readonly HeroCombatBand[]> = {
  light: [{ action: 'attack', y0: 5291, y1: 7333 }, { action: 'hit', y0: 7416, y1: 9422 }, { action: 'cast', y0: 9518, y1: 11338 }, { action: 'death', y0: 11388, y1: 11645 }],
  medium: [{ action: 'attack', y0: 3882, y1: 6128 }, { action: 'hit', y0: 6225, y1: 8112 }, { action: 'death', y0: 8216, y1: 8627 }],
  heavy: [{ action: 'attack', y0: 3706, y1: 5922 }, { action: 'hit', y0: 6007, y1: 8298 }, { action: 'cast', y0: 8395, y1: 10295 }, { action: 'death', y0: 10351, y1: 10496 }],
};

const LOCOMOTION: Record<'run' | 'walk', Record<HeroArmor, readonly (readonly PixelRect[])[]>> = {
  run: HERO_RUN_RECTS,
  walk: HERO_WALK_RECTS,
};

/** Source rectangle for one locomotion cell. The index wraps inside that cycle. */
export function heroSourceRect(tier: HeroArmor, mode: 'run' | 'walk', sheetRow: number, frame: number): PixelRect {
  const rows = LOCOMOTION[mode][tier];
  const row = rows[((sheetRow % rows.length) + rows.length) % rows.length];
  const total = mode === 'run' ? RUN_FRAMES : WALK_FRAMES;
  const index = animFrame(frame * (mode === 'run' ? RUN_FRAME_MS : WALK_FRAME_MS), mode === 'run' ? RUN_FRAME_MS : WALK_FRAME_MS, total);
  return row[index];
}

/** True when a crop shares rows with attack, get-hit, cast, or death. */
export function heroRectOverlapsCombat(tier: HeroArmor, rect: PixelRect): boolean {
  const y0 = rect[1];
  const y1 = rect[3];
  return HERO_COMBAT_BANDS[tier].some((band) => y0 < band.y1 && y1 > band.y0);
}

/** 0 east, then clockwise: E, SE, S, SW, W, NW, N, NE. */
export function heroCompass(facing: number): number {
  const turn = facing % (Math.PI * 2);
  const wrapped = turn < 0 ? turn + Math.PI * 2 : turn;
  return Math.round(wrapped / (Math.PI / 4)) % 8;
}

/** Atlas row whose art faces that compass. Row 0 is southeast, toward the camera. */
export function heroSheetRow(compass: number): number {
  return (compass + 7) % 8;
}

function wrapSigned(angle: number): number {
  const turn = angle % (Math.PI * 2);
  const wrapped = turn < 0 ? turn + Math.PI * 2 : turn;
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;
}

/**
 * Keep the current facing row until the stick leaves its sector by the 15° deadband.
 * Outside the band, step one sector. The run frame clock is not an input.
 */
export function heroHoldCompass(prev: number | null, facing: number): number {
  const next = heroCompass(facing);
  if (prev == null) return next;
  const center = prev * (Math.PI / 4);
  if (Math.abs(wrapSigned(facing - center)) <= Math.PI / 8 + HERO_FACING_DEADBAND) return prev;
  let step = (next - prev + 8) % 8;
  if (step > 4) step -= 8;
  if (step === 0) return prev;
  return (prev + Math.sign(step) + 8) % 8;
}

/** Bottom-center of a trimmed frame. Ground is the bottom edge. */
export function heroDrawOrigin(x: number, y: number, frameWidth: number, frameHeight: number): { drawX: number; drawY: number } {
  return { drawX: x - frameWidth / 2, drawY: y - frameHeight };
}
