import { mapLen } from './data/mapScale';
import { totalMS } from './data/moveSpeed';
import { championMS } from './sim';
import { advanceLocoClock, CLASS_MOVE_FRAME_MS, locoFrame, locomotionRate } from './locomotion';
import {
  drawBolt,
  drawFire,
  drawPortal,
  drawPropArt,
  drawRecall,
  drawSlash,
  drawSpark,
  paintBarbarian,
  paintBoss,
  paintCreature,
  paintDecorMark,
  paintSpire,
  paintStronghold,
  paintTileVariation,
  collectGroundMarks,
  type AttackPose,
  type BossMark,
  type CreatureKind,
} from './art/d2look';
import {
  advanceHeroPhase,
  heroCycleHz,
  heroDrawHeight,
  heroLean,
  smoothFacing,
  type HeroPose,
} from './art/figures';
import { AttackPhase } from './combat/attackCycle';
import { damageColor } from './combat';
import { attackSheetFrame, cycleFrame } from './art/flare-frames';
import { drawFlare, flareFrameCount, flareReady, type FlareAnim } from './art/flare';
import { classSheetCols, classSheetReady, drawClassPortrait, drawClassSheet, drawMobSheet, mobSheetReady } from './art/director-sheets';
import {
  CLASS_COLS,
  MOB_ROWS,
  barbarianAttackFrame,
  BARBARIAN_MOTION,
  barbarianMotionCol,
  hasBarbarianMotion,
  classSheetCol,
  classSheetRow,
  hasClassSheet,
  mobSheetCol,
  mobSheetId,
  mobSheetRow,
  type SheetAnim,
} from './art/sheet-frames';
import { stampBloodPool } from './decals';
import { drawOutlinedLive, drawStructureStamp } from './art/outline';
import {
  BASE_DRAW_H,
  BITMAP_CONTRAST,
  TOWER_DRAW_H,
  bitmapRect,
  preloadStructureBitmaps,
  structureBitmap,
  structureBitmapKey,
  structureBitmapScale,
} from './art/structure-bitmaps';
import {
  BASE_OUTLINE_PX,
  BASE_PLATFORM_W,
  CHARACTER_OUTLINE_PX,
  LANE_EDGE_BAND,
  LANE_EDGE_DARKEN,
  STRUCTURE_CONTRAST,
  BASE_VISUAL_SCALE,
  STRUCTURE_SHADOW_ALPHA,
  STRUCTURE_SHADOW_GROW,
  TOWER_OUTLINE_PX,
  TOWER_PLATFORM_W,
  TREE_OUTLINE_PX,
  shadeHex,
  structureVisualScale,
  tileTone,
  treeEdgeSize,
  treeSeed,
} from './readability';
import { ChunkedBake } from './bakeChunks';
import { ZONE_MINI, ZONE_SIZES, zoneAt, zoneGrid, zoneGroundPaint, type ZoneId } from './data/mapZones';
import { paintBorderFeature, paintBridge, paintLavaRibbon, paintZoneDecal, themeFamily } from './art/zoneTheme';
import { heroGaitStep, heroHoldCompass, readStickMotion } from './gait';
import type { ActDef } from './data/acts/types';
import { projectIso as isoProject, unprojectIso as isoUnproject } from './iso';
import {
  activeView,
  CAMERA,
  cameraZoom,
  characterScale,
  championSpriteScale,
  facingToView,
  fromView,
  ICONS,
  MINIMAP_ICON_SHADE,
  toView,
  viewOriginX,
  viewTurnsFor,
  towerIconSize,
  viewportFootprint,
  worldToMinimap,
  type ViewTurns,
} from './view';
import { TEAM_GLOW, baseFloorReady, onBaseFloor, paintBaseFloor, paintTeamGlow } from './art/base-ground';
import { drawItemBeam, drawItemNameplate, ITEM_LABEL_CLASS, type GroundDrop } from './itemBeam';
import { FLOOR_STEP, GATE_HALF, LANE_CLEAR_HALF, mirroredBases, propForm, sceneryFor, type Prop } from './landscape';
import { AMBIENT_ALPHA, DarkGothicLighting, LIGHTING, type LightSource } from './lighting';
import type { Vec } from './math';
import { player } from './query';
import { GROUND_BASE, groundAt, tilePaint, walkable, type GroundKind } from './terrain';
import type { Camera, Sim, Unit } from './types';
import { BADGE_RIM, FRAME, FRAME_COLORS, unitFrameData, xpRingRadius, type UnitFrameData } from './unitFrame';

/** Unit-frame restyle: bar left / bar top inside the cached chrome canvas (badge to the left, name above). */
const UF_BX = FRAME.circle * 2 + 3;
const UF_BY = FRAME.name + 5;

export interface DrawOpts {
  mode: 'title' | 'play' | 'end';
  targetId: number | null;
  autoTargetId: number | null;
  attack: boolean;
  time: number;
}

const BAKE_HW = 0.85;
const PAD = 64;
/** World units visible across the screen. WILD RIFT VIEW: CAMERA.worldAcross [TEMP] (was 1040). */
const WORLD_ACROSS = CAMERA.worldAcross;
/** Map size for the view rotation; set when the map bakes. */
let viewW = 4400;
let viewH = 2800;

/** WILD RIFT VIEW: every world -> screen projection rotates into view space first (activeView.turns). */
function projectIso(x: number, y: number, hw: number, ox: number, oy: number): { x: number; y: number } {
  const v = toView(x, y, activeView.turns, viewW, viewH);
  return isoProject(v.x, v.y, hw, ox, oy);
}

function unprojectIso(sx: number, sy: number, hw: number, ox: number, oy: number): { x: number; y: number } {
  const v = isoUnproject(sx, sy, hw, ox, oy);
  return fromView(v.x, v.y, activeView.turns, viewW, viewH);
}

type ArmorTier = 'light' | 'medium' | 'heavy';

interface Pose {
  phase: number;
  shown: number;
  compass: number;
  x: number;
  y: number;
  elapsed: number;
  state: HeroPose;
  /** World distance actually moved while walking/running. Drives the barbarian 12-frame stride (no foot sliding). */
  travel: number;
  /** Wild Rift pass 2 item 3: locomotion clock (ms), advanced by dt x playbackRate while moving or stick-held. */
  loco: number;
}

/** A per-frame jump larger than this is a teleport (recall, respawn), not a step. */
const MAX_STRIDE_STEP = 100;

interface TokenLook {
  mark: CreatureKind;
  scale: number;
}

const STICK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sticklog') === '1';
const LOOK_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('looklog') === '1';
const ATMOS_LOG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('atmoslog') === '1';

export interface AtmosphereProbe {
  lightAlloc: number;
  ambientAlpha: number;
  blood: number;
  drops: number;
  hero: { x: number; y: number; h: number } | null;
}

interface LookLive {
  recall: boolean;
  recallSec: number;
  recallFill: number;
  slash: boolean;
  spark: boolean;
  flinch: boolean;
}

function crisp(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}

/** Backing store is CSS pixels times devicePixelRatio, capped at 2. CSS size stays put. */
export function applyCanvasBacking(canvas: HTMLCanvasElement): { cssW: number; cssH: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.style.imageRendering = 'pixelated';
  const width = Math.max(1, Math.round(cssW * dpr));
  const height = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { cssW, cssH, dpr };
}

export function watchCanvasBacking(canvas: HTMLCanvasElement): void {
  const apply = () => applyCanvasBacking(canvas);
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  const view = window.visualViewport;
  if (!view) return;
  view.addEventListener('resize', apply);
  view.addEventListener('scroll', apply);
}

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - 41);
  ctx.lineTo(sx + 81, sy);
  ctx.lineTo(sx, sy + 41);
  ctx.lineTo(sx - 81, sy);
  ctx.closePath();
}

/** Visual readability item 9: TREE_OUTLINE_PX css px in bake px at this camera zoom, in 0.25 px steps. */
function treeOutlineBakePx(zoom: number): number {
  if (!(zoom > 0)) return TREE_OUTLINE_PX;
  return Math.max(1, Math.round(((TREE_OUTLINE_PX * BAKE_HW) / zoom) * 4) / 4);
}

function hash(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera = {
    x: 0,
    y: 0,
    viewW: WORLD_ACROSS,
    viewH: 640,
    zoom: 1,
    cssW: 1,
    cssH: 1,
    dpr: 1,
  };
  /** Map 12k order: the ground bake is chunked (no single giant canvas, each chunk well under 4096 px). */
  private bake: ChunkedBake | null = null;
  private bakeMap: ActDef | null = null;
  private bakeOx = 0;
  private bakeOy = 0;
  private sceneryAt: { prop: Prop; x: number; y: number }[] = [];
  private lavaLayers: { crust: Vec[]; lava: Vec[]; core: Vec[] } | null = null;
  private bridges: Vec[][] = [];
  /** Blood pools stay on the ground when a chunk is evicted and rebaked. */
  private readonly bloodLog: { x: number; y: number; r: number; ichor: boolean; seed: number }[] = [];
  private mapKey = '';
  /** Visual readability item 9: tree outline width in bake px for the current bake. */
  private treeOutline = 0;
  /** Item 7: the CC0 stone floor is loaded and paints both base yards. */
  private floorArt = false;
  private scenery: Prop[] = [];
  private snapped = false;
  private focusX = 0;
  private focusY = 0;
  private camBakeX = 0;
  private camBakeY = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frameDt = 0;
  private readonly poses = new Map<number, Pose>();
  /** Campfires and braziers. Visual only; they are not collision props. */
  private fires: { x: number; y: number; hell: boolean; blue?: boolean }[] = [];
  private readonly recallTrack = new Map<number, { max: number; x: number; y: number }>();
  private portals: { x: number; y: number; t: number }[] = [];
  private readonly slashT = new Map<number, number>();
  private readonly slashFace = new Map<number, number>();
  private readonly slashArmed = new Map<number, boolean>();
  private readonly sparkArmed = new Set<number>();
  private look: LookLive = { recall: false, recallSec: 0, recallFill: 0, slash: false, spark: false, flinch: false };
  private seen = { slash: 0, spark: 0, flinch: 0, portal: 0, heroSlash: 0 };
  private shadeCanvas: HTMLCanvasElement | null = null;
  private shadeKey = '';
  private readonly lighting = new DarkGothicLighting();
  private readonly lights: LightSource[] = [];
  private readonly hudPaint: (() => void)[] = [];
  private mistCanvas: HTMLCanvasElement | null = null;
  private mistPattern: CanvasPattern | null = null;
  private mistOffset = 0;
  private flashCanvas: HTMLCanvasElement | null = null;
  private readonly aliveWas = new Set<number>();
  private bloodReady = false;
  private bloodStamps = 0;
  private heroScreen: { x: number; y: number; h: number } | null = null;
  private heroLevel = 1;
  private heroXp = 0;
  private simTime = 0;
  private miniStatic: HTMLCanvasElement | null = null;
  private miniStaticKey = '';
  private miniW = 0;
  private miniH = 0;
  private miniView = '';
  private miniCss = -1;
  /** Empty until a future drop system fills it. Rendering only. */
  private readonly groundDrops: GroundDrop[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    preloadStructureBitmaps();
    if (STICK_LOG) {
      (globalThis as { __geometry?: unknown }).__geometry = {
        floorStep: FLOOR_STEP,
        corridorTiles: (LANE_CLEAR_HALF * 2) / FLOOR_STEP,
        gateTiles: (GATE_HALF * 2) / FLOOR_STEP,
      };
    }
  }

  resize(): void {
    const { cssW, cssH, dpr } = applyCanvasBacking(this.canvas);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crisp(this.ctx);
    this.camera.cssW = cssW;
    this.camera.cssH = cssH;
    this.camera.dpr = dpr;
    const hw = cameraZoom(cssW);
    this.camera.viewW = WORLD_ACROSS;
    this.camera.viewH = cssH / (hw * 0.5);
    this.camera.zoom = hw;
    const view = `${cssW}x${cssH}`;
    if (this.miniView !== view) {
      this.miniView = view;
      this.miniW = 0;
      this.miniH = 0;
      this.miniStatic = null;
    }
  }

  screenToWorld(sx: number, sy: number): Vec {
    return unprojectIso(
      this.camBakeX + sx / this.scale,
      this.camBakeY + sy / this.scale,
      BAKE_HW,
      this.ox,
      this.oy,
    );
  }

  updateCamera(sim: Sim, mode: DrawOpts['mode'], dt: number, time: number): void {
    this.frameDt = dt;
    const focus = this.focus(sim, mode, time);
    if (!this.snapped) {
      this.focusX = focus.x;
      this.focusY = focus.y;
      this.snapped = true;
    } else {
      const t = 1 - Math.exp(-dt * CAMERA.followRate);
      this.focusX += (focus.x - this.focusX) * t;
      this.focusY += (focus.y - this.focusY) * t;
    }
    let fx = this.focusX;
    let fy = this.focusY;
    if (!this.reduceMotion && sim.shake > 0) {
      fx += Math.sin(time * 42) * sim.shake;
      fy += Math.cos(time * 37) * sim.shake * 0.6;
    }
    const hw = BAKE_HW;
    this.ox = viewOriginX(activeView.turns, sim.map.width, sim.map.height, hw, PAD);
    this.oy = PAD;
    const projected = projectIso(fx, fy, hw, this.ox, this.oy);
    this.scale = this.camera.zoom / hw;
    this.camBakeX = projected.x - this.camera.cssW / 2 / this.scale;
    this.camBakeY = projected.y - this.camera.cssH * CAMERA.focusY / this.scale;
    this.camera.x = fx - this.camera.viewW / 2;
    this.camera.y = fy - this.camera.viewH / 2;
  }

  draw(sim: Sim, opts: DrawOpts): void {
    this.ensureMap(sim.map, sim);
    const ctx = this.ctx;
    const { dpr, cssW, cssH } = this.camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crisp(ctx);
    ctx.fillStyle = '#1c2410';
    ctx.fillRect(0, 0, cssW, cssH);
    this.observeBlood(sim);
    if (this.bake) {
      const srcX = Math.round(this.camBakeX);
      const srcY = Math.round(this.camBakeY);
      const srcW = Math.max(1, Math.round(cssW / this.scale));
      const srcH = Math.max(1, Math.round(cssH / this.scale));
      this.bake.draw(ctx, srcX, srcY, srcW, srcH, cssW, cssH, 1);
    }
    this.drawMist(sim, cssW, cssH);
    this.drawOrbs(sim);
    this.drawGrass(sim);

    this.tickFx();
    this.syncRecall(sim);
    this.look = { recall: false, recallSec: 0, recallFill: 0, slash: false, spark: false, flinch: false };
    this.lights.length = 0;
    this.hudPaint.length = 0;
    this.heroScreen = null;
    this.heroLevel = sim.level;
    this.heroXp = sim.xp;
    this.simTime = sim.time;
    const u = this.spriteScale();
    const layers: { depth: number; paint: () => void }[] = [];
    const myTeam = sim.units.find((unit) => unit.id === sim.playerId)?.team;
    // Item 17: enemies hidden in grass are not drawn.
    const units = sim.units.filter(
      (unit) => (unit.alive || unit.corpse > 0 || unit.kind !== 'minion') && !(unit.alive && unit.hidden && unit.team !== myTeam),
    );
    for (const unit of units) {
      layers.push({
        depth: this.project(unit.x, unit.y).y,
        paint: () => {
          // Item 17: own side's hidden units are drawn faded so the player can tell they are in grass.
          if (unit.hidden) ctx.globalAlpha = 0.6;
          this.drawUnit(ctx, unit, opts, u, this.armorTier(sim), sim.playerId);
          ctx.globalAlpha = 1;
        },
      });
    }
    layers.sort((a, b) => a.depth - b.depth);
    for (const layer of layers) layer.paint();

    for (const shot of sim.projectiles) {
      const p = this.project(shot.x, shot.y);
      const owner = sim.units.find((unit) => unit.id === shot.attackerId);
      drawBolt(ctx, p.x, p.y, shot.color, owner?.defId === 'blood-raven');
      this.lights.push({ screenX: p.x, screenY: p.y, radius: 40, intensity: 0.85, color: shot.color });
    }
    for (const fx of sim.fx) {
      if (fx.kind === 'text') continue;
      this.drawFx(ctx, fx);
      if (fx.kind === 'ring') {
        const p = this.project(fx.x, fx.y);
        this.lights.push({
          screenX: p.x,
          screenY: p.y,
          radius: Math.max(28, Math.min(72, fx.r * this.camera.zoom)),
          intensity: 0.7,
          color: fx.color,
        });
      }
    }
    for (const fire of this.fires) {
      const p = this.project(fire.x, fire.y);
      if (p.x < -40 || p.y < -40 || p.x > cssW + 40 || p.y > cssH + 40) continue;
      drawFire(ctx, p.x, p.y, opts.time, fire.hell, fire.blue);
      this.lights.push({
        screenX: p.x,
        screenY: p.y - 10,
        radius: fire.hell ? 90 : 100,
        intensity: fire.hell ? 0.75 : 0.9,
        color: fire.blue ? TEAM_GLOW.ally : fire.hell ? TEAM_GLOW.enemy : 'rgb(255, 148, 48)',
        flicker: !this.reduceMotion,
      });
    }
    for (const flash of this.portals) {
      const p = this.project(flash.x, flash.y);
      drawPortal(ctx, p.x, p.y, 1 - flash.t / 0.45);
      this.lights.push({ screenX: p.x, screenY: p.y, radius: 80, intensity: 0.8, color: 'rgb(90, 160, 255)' });
    }
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      drawItemBeam(ctx, p.x, p.y, drop.tier, opts.time);
      if (drop.tier === 'rare' || drop.tier === 'unique' || drop.tier === 'set') {
        this.lights.push({ screenX: p.x, screenY: p.y, radius: 54, intensity: 0.65, color: 'rgb(255, 214, 96)' });
      }
    }

    const shade = this.shadeOverlay(cssW, cssH);
    ctx.drawImage(shade, 0, 0, cssW, cssH);
    this.lighting.draw(ctx, cssW, cssH, this.lights, opts.time);
    crisp(ctx);
    for (const paint of this.hudPaint) paint();
    for (const fx of sim.fx) {
      if (fx.kind === 'text') this.drawFx(ctx, fx, sim);
    }
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      drawItemNameplate(ctx, p.x, p.y - 16, drop.name, drop.tier);
    }
    this.syncItemTags();
    this.publishLook();
    this.publishAtmos();
    this.drawMinimap(sim, opts.targetId);
  }

  /** WILD RIFT VIEW: character scale vs the view (view.ts CHARACTER, hero = 11% of screen height [TEMP]). */
  private spriteScale(): number {
    return characterScale(this.camera.cssH);
  }

  private project(x: number, y: number): Vec {
    const p = projectIso(x, y, BAKE_HW, this.ox, this.oy);
    return { x: (p.x - this.camBakeX) * this.scale, y: (p.y - this.camBakeY) * this.scale };
  }

  private focus(sim: Sim, mode: DrawOpts['mode'], time: number): Vec {
    if (mode === 'title') {
      const lane = sim.map.lane;
      const travel = (time % 48) / 48;
      const idx = travel * (lane.length - 1);
      const i = Math.min(lane.length - 2, Math.floor(idx));
      const f = idx - i;
      return {
        x: lane[i].x + (lane[i + 1].x - lane[i].x) * f,
        y: lane[i].y + (lane[i + 1].y - lane[i].y) * f,
      };
    }
    const hero = player(sim);
    return {
      x: hero.x + Math.cos(hero.facing) * 28,
      y: hero.y + Math.sin(hero.facing) * 18,
    };
  }

  private ensureMap(map: ActDef, sim?: Sim): void {
    const team = sim?.units.find((unit) => unit.id === sim.playerId)?.team;
    const turns: ViewTurns = viewTurnsFor(team);
    activeView.turns = turns;
    viewW = map.width;
    viewH = map.height;
    const mirrored = mirroredBases(map);
    const floor = mirrored && baseFloorReady();
    // Visual readability item 9: tree outline width in bake px so it lands at 2 css px (re-bakes on a zoom change).
    const treeOutline = treeOutlineBakePx(this.camera.zoom);
    const key = `${map.id}${floor ? ':floor' : ''}:t${turns}:o${treeOutline}`;
    if (this.bake && this.mapKey === key) return;
    if (mirrored && !floor) onBaseFloor(() => { this.mapKey = ''; });
    this.floorArt = floor;
    this.treeOutline = treeOutline;
    const hw = BAKE_HW;
    const width = Math.ceil((map.width + map.height) * hw + PAD * 2);
    const height = Math.ceil((map.width + map.height) * hw * 0.5 + PAD * 2);
    const ox = viewOriginX(turns, map.width, map.height, hw, PAD);
    const oy = PAD;
    this.bakeOx = ox;
    this.bakeOy = oy;
    this.bakeMap = map;
    this.scenery = sceneryFor(map);
    this.sceneryAt = this.scenery.map((prop) => ({ prop, ...projectIso(prop.x, prop.y, hw, ox, oy) }));
    this.lavaLayers = this.buildLava(map, hw, ox, oy);
    this.bridges = this.buildBridges(map, hw, ox, oy);
    // Map 12k order: lazily painted 512 px chunks instead of one (W + H) * 0.85 px wide canvas.
    this.bake = new ChunkedBake(width, height, (ctx, x0, y0, w, h) => this.paintChunk(ctx, x0, y0, w, h));
    this.fires = mirrored
      ? [
          // Item 7: the same brazier on each side, mirrored, burning in the side's color.
          { x: map.playerBase.x + 90, y: map.playerBase.y + 36, hell: false, blue: true },
          { x: map.enemyBase.x - 90, y: map.enemyBase.y - 36, hell: true },
        ]
      : [
      { x: map.playerBase.x + 90, y: map.playerBase.y + 36, hell: false },
      { x: map.enemyBase.x - 80, y: map.enemyBase.y - 24, hell: true },
      { x: map.enemyBase.x + 40, y: map.enemyBase.y + 70, hell: true },
        ];
    this.mapKey = key;
  }

  /** One bake chunk: ground tiles, lava river, team glows, border features, props, then saved blood pools. */
  private paintChunk(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
    const map = this.bakeMap;
    if (!map) return;
    const hw = BAKE_HW;
    const ox = this.bakeOx;
    const oy = this.bakeOy;
    crisp(ctx);
    ctx.fillStyle = tilePaint(GROUND_BASE).fill;
    ctx.fillRect(x0, y0, w, h);
    const features = this.stampGround(ctx, map, ox, oy, hw, x0, y0, w, h);
    if (this.lavaLayers) paintLavaRibbon(ctx, this.lavaLayers);
    for (const deck of this.bridges) paintBridge(ctx, deck);
    if (mirroredBases(map)) {
      // Item 7: red and blue primary glow over each yard (doc: "Red is one side's primary glow. Blue is the other.").
      const r = map.fountainRadius * hw * Math.SQRT2 * 1.15;
      for (const [base, color] of [[map.playerBase, TEAM_GLOW.ally], [map.enemyBase, TEAM_GLOW.enemy]] as const) {
        const c = projectIso(base.x, base.y, hw, ox, oy);
        if (c.x + r < x0 || c.x - r > x0 + w || c.y + r < y0 || c.y - r > y0 + h) continue;
        paintTeamGlow(ctx, c.x, c.y, r, r * 0.5, color);
      }
    }
    features.sort((a, b) => a.y - b.y);
    for (const f of features) paintBorderFeature(ctx, f.zone, f.x, f.y, f.n, f.size, this.treeOutline);
    this.bakeProps(ctx, map, x0, y0, w, h);
    for (const pool of this.bloodLog) {
      if (pool.x + 40 < x0 || pool.x - 40 > x0 + w || pool.y + 40 < y0 || pool.y - 40 > y0 + h) continue;
      seededStamp(ctx, pool);
    }
  }

  /** Map 12k item 3: the river polyline as one continuous lava ribbon (paint only; the river never blocked). */
  private buildLava(map: ActDef, hw: number, ox: number, oy: number): { crust: Vec[]; lava: Vec[]; core: Vec[] } | null {
    const river = map.river;
    if (!river || river.length < 2) return null;
    const pts: { x: number; y: number; nx: number; ny: number; s: number }[] = [];
    let run = 0;
    for (let i = 1; i < river.length; i++) {
      const a = river[i - 1];
      const b = river[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 80));
      for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, s: run + len * t });
      }
      run += len;
    }
    const side = (half: number, wob: number) => {
      const left: Vec[] = [];
      const right: Vec[] = [];
      for (const p of pts) {
        const k = 1 + Math.sin(p.s / 310) * wob + Math.sin(p.s / 97 + 1.3) * wob * 0.5;
        const taper = Math.min(1, p.s / 260, (run - p.s) / 260);
        const hh = half * k * Math.max(0.35, taper);
        left.push(projectIso(p.x + p.nx * hh, p.y + p.ny * hh, hw, ox, oy));
        right.push(projectIso(p.x - p.nx * hh, p.y - p.ny * hh, hw, ox, oy));
      }
      return [...left, ...right.reverse()];
    };
    return { crust: side(ZONE_SIZES.river, 0.12), lava: side(ZONE_SIZES.river * 0.66, 0.18), core: side(ZONE_SIZES.river * 0.24, 0.3) };
  }

  /** Stone deck where a lane crosses the lava river (bake space corners). */
  private buildBridges(map: ActDef, hw: number, ox: number, oy: number): Vec[][] {
    const river = map.river;
    if (!river || river.length < 2) return [];
    const out: Vec[][] = [];
    for (const path of map.paths ?? []) {
      for (let i = 1; i < path.lane.length; i++) {
        for (let k = 1; k < river.length; k++) {
          const hit = segHit(path.lane[i - 1], path.lane[i], river[k - 1], river[k]);
          if (!hit) continue;
          const a = path.lane[i - 1];
          const b = path.lane[i];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const dx = (b.x - a.x) / len;
          const dy = (b.y - a.y) / len;
          const rl = Math.hypot(river[k].x - river[k - 1].x, river[k].y - river[k - 1].y);
          const sin = Math.abs(dx * (river[k].y - river[k - 1].y) - dy * (river[k].x - river[k - 1].x)) / rl;
          const along = (ZONE_SIZES.river * 1.15) / Math.max(0.3, sin) + 30;
          const half = map.laneWidth / 2 + 6;
          const corner = (u: number, v: number) => projectIso(hit.x + dx * u - dy * v, hit.y + dy * u + dx * v, hw, ox, oy);
          out.push([corner(-along, -half), corner(along, -half), corner(along, half), corner(-along, half)]);
        }
      }
    }
    return out;
  }

  /** Props and camp clutter live in the bake chunks, so a frame only redraws units. */
  private bakeProps(ctx: CanvasRenderingContext2D, map: ActDef, x0: number, y0: number, w: number, h: number): void {
    const u = 0.72;
    for (const { prop, x, y } of this.sceneryAt) {
      if (x < x0 - 160 || x > x0 + w + 160 || y < y0 - 60 || y > y0 + h + 200) continue;
      const form = propForm(prop.kind);
      const ph =
        (form === 'pillar' ? 78 :
        form === 'posts' ? 54 :
        form === 'tent' ? 48 :
        form === 'cart' ? 36 :
        form === 'figure' ? 44 :
        28) * u;
      const family = themeFamily(zoneAt(map, prop.x, prop.y));
      // Map 12k item 3: props in the fire / hell zones use the existing hell variant of the same art.
      const hell = (!mirroredBases(map) && Math.hypot(prop.x - map.enemyBase.x, prop.y - map.enemyBase.y)
        < Math.hypot(prop.x - map.playerBase.x, prop.y - map.playerBase.y)) || family === 'fire' || family === 'hell';
      drawPropArt(ctx, x, y, ph, form, prop.variant, hell, form === 'pillar' ? this.treeOutline : 0);
      paintDecorMark(ctx, x, y, prop.variant);
    }
  }

  /**
   * Every grid cell gets an opaque grass diamond, then the lane or camp. Map 12k order: only the cells that reach
   * the chunk rect (x0, y0, w, h) are painted, each in its theme zone's colors; returns the border features
   * (not-walkable tiles) to draw after the ground.
   */
  private stampGround(
    ctx: CanvasRenderingContext2D, map: ActDef, ox: number, oy: number, hw: number,
    x0: number, y0: number, w: number, h: number,
  ): { x: number; y: number; zone: ZoneId; n: number; size: number }[] {
    const step = 80 / hw;
    // Visual readability item 7: projected direction of the 4 lattice neighbors (for lane edge sides).
    const o0 = projectIso(0, 0, hw, ox, oy);
    const nbr = ([[step, 0], [-step, 0], [0, step], [0, -step]] as const).map(([ddx, ddy]) => {
      const p = projectIso(ddx, ddy, hw, ox, oy);
      return { ddx, ddy, sx: Math.sign(Math.round(p.x - o0.x)), sy: Math.sign(Math.round(p.y - o0.y)) };
    });
    const i1 = Math.ceil(map.width / step) + 2;
    const j1 = Math.ceil(map.height / step) + 2;
    const mx = 100;
    const my = 120;
    const corners = [
      unprojectIso(x0 - mx, y0 - my, hw, ox, oy),
      unprojectIso(x0 + w + mx, y0 - my, hw, ox, oy),
      unprojectIso(x0 - mx, y0 + h + my, hw, ox, oy),
      unprojectIso(x0 + w + mx, y0 + h + my, hw, ox, oy),
    ];
    const ia = Math.max(-2, Math.floor(Math.min(...corners.map((c) => c.x)) / step) - 1);
    const ib = Math.min(i1, Math.ceil(Math.max(...corners.map((c) => c.x)) / step) + 1);
    const ja = Math.max(-2, Math.floor(Math.min(...corners.map((c) => c.y)) / step) - 1);
    const jb = Math.min(j1, Math.ceil(Math.max(...corners.map((c) => c.y)) / step) + 1);
    const features: { x: number; y: number; zone: ZoneId; n: number; size: number }[] = [];
    for (let j = ja; j <= jb; j++) {
      for (let i = ia; i <= ib; i++) {
        const wx = i * step;
        const wy = j * step;
        // WILD RIFT VIEW: tile centers go through the view rotation (same 80 x 40 diamond lattice).
        const at = projectIso(wx, wy, hw, ox, oy);
        const sx = Math.round(at.x);
        const sy = Math.round(at.y);
        if (sx < x0 - mx || sx > x0 + w + mx || sy < y0 - my || sy > y0 + h + my) continue;
        const kind = groundAt(map, wx, wy);
        // Ragged theme borders: the zone is read at a jittered point (paint only).
        const zone = zoneAt(map, wx + (hash(i, j) - 0.5) * 3 * step, wy + (hash(j + 7, i - 3) - 0.5) * 3 * step);
        const overlay = kind !== GROUND_BASE;
        const wild = kind === 'grass' || kind === 'edge' || kind === 'bank' || kind === 'dark' || kind === 'river';
        const decor = wild && !walkable(map, wx, wy);
        const mud = kind === 'grass' && this.nearPath(map, wx, wy, step);
        // Visual readability items 7 + 9 (paint only): value per visible tile, darker tree-cluster ground,
        // and a dark band on lane sides that touch a non-lane tile.
        const family = themeFamily(zone);
        const woods = decor && (family === 'forest' || family === 'jungle');
        const tone = tileTone({ kind, treeGround: woods, i, j });
        const edges = kind === 'path'
          ? nbr.filter((d) => groundAt(map, wx + d.ddx, wy + d.ddy) !== 'path').map((d) => [d.sx, d.sy] as [number, number])
          : null;
        this.paintTile(ctx, GROUND_BASE, i, j, sx, sy, !overlay && decor, !overlay && mud, zone, overlay ? 1 : tone);
        if (overlay) this.paintTile(ctx, kind, i, j, sx, sy, false, false, zone, tone, edges);
        const n = hash(i * 13 + 5, j * 17 + 11);
        // Item 9: denser jungle edges = woods tiles next to a walkable tile take a lower threshold and varied size.
        const edge = woods && nbr.some((d) => walkable(map, wx + d.ddx, wy + d.ddy));
        const seed = decor ? treeSeed(n, edge) : null;
        if (decor && wx > 0 && wy > 0 && wx < map.width && wy < map.height && seed !== null) {
          features.push({
            x: sx + (hash(i, j + 1) - 0.5) * 40, y: sy + (hash(i + 1, j) - 0.5) * 16, zone, n: seed,
            size: edge ? treeEdgeSize(i, j) : 1,
          });
        }
      }
    }
    return features;
  }

  private nearPath(map: ActDef, x: number, y: number, step: number): boolean {
    return (
      groundAt(map, x + step, y) === 'path' ||
      groundAt(map, x - step, y) === 'path' ||
      groundAt(map, x, y + step) === 'path' ||
      groundAt(map, x, y - step) === 'path'
    );
  }

  private paintTile(
    ctx: CanvasRenderingContext2D,
    kind: GroundKind,
    i: number,
    j: number,
    sx: number,
    sy: number,
    decor: boolean,
    mud: boolean,
    zone: ZoneId = 'blood-moor',
    tone = 1,
    edges: [number, number][] | null = null,
  ): void {
    // Map 12k item 3: the Red yard is procedural Pandemonium stone; the Blue yard keeps the CC0 stone floor.
    if (kind === 'town' && this.floorArt && zone !== 'pandemonium-fortress') {
      ctx.save();
      diamond(ctx, sx, sy);
      ctx.lineWidth = 2;
      ctx.clip();
      const drew = paintBaseFloor(ctx, sx, sy, Math.floor(hash(i, j) * 16));
      ctx.restore();
      if (drew) return;
    }
    const base = zoneGroundPaint(zone, kind) ?? tilePaint(kind);
    // Visual readability item 7: value shift of the visible tile (lane lift, jungle / bank separation, variation).
    const paint = tone === 1 ? base : { fill: shadeHex(base.fill, tone), joint: shadeHex(base.joint, tone), fleck: shadeHex(base.fleck, tone) };
    diamond(ctx, sx, sy);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.strokeStyle = paint.fill;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    diamond(ctx, sx, sy);
    ctx.clip();
    ctx.strokeStyle = paint.joint;
    ctx.globalAlpha = kind === 'path' || kind === 'town' || kind === 'pale' ? 0.55 : 0.35;
    ctx.lineWidth = 1;
    const rows = kind === 'grass' ? 3 : 2;
    for (let row = 0; row < rows; row++) {
      const y = sy - 24 + row * 16;
      ctx.beginPath();
      ctx.moveTo(sx - 70 + (row % 2) * 18, y);
      ctx.lineTo(sx + 70, y + 8);
      ctx.stroke();
    }
    ctx.fillStyle = paint.fleck;
    ctx.globalAlpha = 0.7;
    const n = 2 + Math.floor(hash(i, j) * 3);
    for (let k = 0; k < n; k++) {
      const fx = sx - 40 + hash(i + k, j) * 80;
      const fy = sy - 16 + hash(j + k, i) * 32;
      ctx.fillRect(fx, fy, kind === 'pale' ? 3 : 2, 2);
    }
    ctx.globalAlpha = 1;
    paintTileVariation(ctx, kind, i, j, sx, sy, decor, mud);
    paintZoneDecal(ctx, zone, kind, i, j, sx, sy);
    if (edges && edges.length) {
      // Item 7 [JOSEPH]: lane path edges 15% darker (black at 0.15 over a LANE_EDGE_BAND px band inside the tile).
      ctx.strokeStyle = `rgba(0,0,0,${LANE_EDGE_DARKEN})`;
      ctx.lineWidth = LANE_EDGE_BAND * 2;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (const [ex, ey] of edges) {
        ctx.moveTo(sx + ex * 81, sy);
        ctx.lineTo(sx, sy + ey * 41);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    opts: DrawOpts,
    u: number,
    tier: ArmorTier,
    playerId: number,
  ): void {
    const pose = this.poseOf(unit, playerId);
    const p = this.project(unit.x, unit.y);
    if (p.x < -180 || p.y < -220 || p.x > this.camera.cssW + 180 || p.y > this.camera.cssH + 80) return;
    let footY = p.y;
    if (unit.leap) {
      const t = Math.min(1, unit.leap.t / unit.leap.dur);
      footY -= Math.sin(t * Math.PI) * 48 * u;
    }
    const footX = p.x;
    const ahead = this.project(unit.x + Math.cos(pose.shown) * 24, unit.y + Math.sin(pose.shown) * 24);
    const screen = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    const swing = Math.sin(pose.phase * Math.PI * 2);
    const attack = attackPose(unit);
    // Amazon order: any playable class body (class sheet id) draws as a hero, not just the Barbarian.
    const hero = unit.kind === 'champion' && hasClassSheet(unit.defId);
    const boss = bossLook(unit);
    // Four UI/size changes item 2 [JOSEPH t250u]: champions (player + bot heroes) drawn 15% larger; sprite only.
    // Visual readability item 8 [JOSEPH t253u]: key base buildings drawn 10% larger (visual only; radius unchanged).
    const height = (hero ? heroDrawHeight(pose.state) : this.unitHeight(unit)) * u * championSpriteScale(unit.kind)
      * structureVisualScale(unit.defId);
    const bob = swing * (pose.state === 'idle' ? 1.5 : pose.state === 'run' ? 5 : 3.5) * u;
    const melee = !unit.ranged && unit.defId !== 'tower' && unit.kind !== 'base' && unit.kind !== 'seal';
    this.armSlash(unit, melee && (attack === 'swing' || unit.swing > 0.82), screen, playerId);
    this.noteHit(unit);
    const body = unit.kind === 'minion' || unit.kind === 'champion';
    const mag = body && unit.hitFlash > 0 ? 3 * Math.min(1, unit.hitFlash / 0.12) : 0;
    const flinchX = -Math.cos(screen) * mag;
    const flinchY = -Math.sin(screen) * mag;
    const dx = footX + flinchX;
    const dy = footY + flinchY;
    const lean = hero ? heroLean(pose.state) : 0;
    const paintBody = (target: CanvasRenderingContext2D) => {
      if (this.paintSprite(target, unit, pose, attack, dx, dy, height, opts)) return;
      this.paintFigure(target, unit, opts, tier, dx, dy, height, swing, screen, bob, attack, lean, hero, boss);
    };
    if (unit.alive && unit.hitFlash >= 0.07) this.blitHitFlash(ctx, dx, dy, paintBody);
    else paintBody(ctx);
    if (unit.id === playerId) this.heroScreen = { x: dx, y: dy, h: height };
    const slash = this.slashT.get(unit.id) ?? 0;
    if (slash > 0) {
      this.look.slash = true;
      drawSlash(ctx, footX, footY, height, this.slashFace.get(unit.id) ?? screen, slash / 0.16);
    }
    if (unit.hitFlash > 0.02 && unit.alive) {
      drawSpark(ctx, dx, dy, height, Math.min(1, unit.hitFlash / 0.12));
      this.lights.push({
        screenX: dx,
        screenY: dy - height * 0.45,
        radius: 36,
        intensity: 0.8,
        color: 'rgb(255, 220, 180)',
      });
    }
    this.collectUnitLight(unit, playerId, footX, footY);
    if (unit.buffT > 0 && unit.alive) {
      ctx.strokeStyle = 'rgba(230, 211, 161, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(footX, footY, height * 0.34, height * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.hudPaint.push(() => {
      if (unit.defId === 'tower' && unit.alive && unit.id === opts.targetId) {
        this.rangeRing(ctx, unit, unit.team === 'ally' ? '#6aa7ff' : '#e4553c');
      }
      if (unit.recall > 0 && unit.alive) {
        const max = this.recallTrack.get(unit.id)?.max ?? unit.recall;
        drawRecall(ctx, footX, footY, height, unit.recall, max, opts.time);
        if (unit.id === playerId || !this.look.recall) {
          this.look.recall = true;
          this.look.recallSec = Math.max(0, Math.ceil(unit.recall - 1e-4));
          this.look.recallFill = Math.max(0, Math.min(1, 1 - unit.recall / max));
        }
      }
      if (unit.alive && opts.autoTargetId != null && unit.id === opts.autoTargetId) {
        ctx.save();
        ctx.strokeStyle = 'rgba(230, 211, 161, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(footX, footY + 2, Math.max(14, height * 0.22), Math.max(6, height * 0.08), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (unit.alive && (boss || unit.kind !== 'minion' || unit.hp < unit.maxHp)) {
        this.drawBar(unit, footX, footY, height, opts.targetId, playerId);
      }
      if (unit.stun > 0 && unit.alive) {
        ctx.fillStyle = '#c7b377';
        ctx.font = '700 14px "Cinzel Decorative", serif';
        ctx.textAlign = 'center';
        ctx.fillText('✶', footX, footY - height - 8);
      }
    });
  }

  private paintSprite(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    pose: Pose,
    attack: AttackPose,
    dx: number,
    dy: number,
    height: number,
    opts: DrawOpts,
  ): boolean {
    const anim: FlareAnim = !unit.alive
      ? 'die'
      : attack !== 'none'
        ? 'attack'
        : pose.state === 'run'
          ? 'run'
          : pose.state === 'walk'
            ? 'walk'
            : 'idle';
    const sheet = this.sheetFrame(unit, anim, pose);
    const cols = sheet ? 0 : flareFrameCount(unit.defId, anim);
    if (!sheet && (cols <= 0 || !flareReady(unit.defId, anim))) return false;
    let frame = sheet ? 0 : cycleFrame(pose.phase, cols);
    if (!sheet && anim === 'attack') {
      const phase = unit.attackCycle.phase === AttackPhase.Windup ? 'Windup' : 'Backswing';
      frame = attackSheetFrame(phase, unit.attackCycle.phaseElapsedMs, unit.attackInterval, cols);
    } else if (!sheet && anim === 'die') {
      const elapsed = Math.max(0, this.simTime - unit.diedAt);
      frame = Math.min(cols - 1, Math.floor(Math.min(0.999, elapsed / 0.8) * cols));
    }
    ctx.save();
    if (!unit.alive) {
      const fade = unit.corpse > 0 ? Math.max(0.05, (unit.corpse / 4.5) * 0.55) : 0.55;
      ctx.globalAlpha = fade;
    } else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    groundShadow(ctx, dx, dy, height);
    groundRing(ctx, dx, dy, height, unit.team === 'ally');
    const drew = sheet
      ? sheet.kind === 'class'
        ? drawClassSheet(ctx, sheet.id, sheet.row, sheet.col, dx, dy, height)
        : drawMobSheet(ctx, sheet.id, sheet.row, sheet.col, dx, dy, height)
      : drawFlare(ctx, unit.defId, anim, pose.compass, frame, dx, dy, height);
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(dx, dy - height * 0.45, height * 0.42, height * 0.16, opts.time * 6, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
    return drew;
  }

  /**
   * Pick a Sprite Director full 8-direction sheet cell, or null to keep the Flare/procedural art
   * (only while the sheet image is still loading, or for units with no sheet).
   * Manifest "Full 8-direction sheets": every class and wave mob has idle, walk, attack and death in all
   * 8 directions, so the old TEMP "hold the stand frame while attacking/dying" fallback and the Barbarian's
   * Flare attack/death stand-in are gone. Attack/death frames are derived [TEMP/art direction].
   */
  private sheetFrame(
    unit: Unit,
    anim: FlareAnim,
    pose: Pose,
  ): { kind: 'class' | 'mob'; id: string; row: number; col: number } | null {
    const sheetAnim: SheetAnim = anim === 'die' ? 'death' : anim === 'attack' ? 'attack' : anim === 'idle' ? 'idle' : 'move';
    if (unit.kind === 'champion' && hasClassSheet(unit.defId)) {
      const id = unit.look ?? unit.defId;
      if (!hasClassSheet(id) || !classSheetReady(id)) return null;
      const motion = id === 'barbarian' ? this.barbarianMotionCol(unit, anim, pose) : null;
      if (motion != null) return { kind: 'class', id, row: classSheetRow(pose.compass), col: motion };
      const frames = CLASS_COLS[sheetAnim].frames;
      // Wild Rift pass 2 item 3: class move blocks follow the speed-scaled locomotion clock too.
      const frame = sheetAnim === 'move' ? locoFrame(pose.loco, CLASS_MOVE_FRAME_MS, frames) : this.sheetAnimFrame(unit, sheetAnim, pose, frames);
      return { kind: 'class', id, row: classSheetRow(pose.compass), col: classSheetCol(sheetAnim, frame) };
    }
    const id = mobSheetId(unit.defId);
    if (!id || !mobSheetReady(id)) return null;
    const frame = this.sheetAnimFrame(unit, sheetAnim, pose, MOB_ROWS[sheetAnim].frames);
    return { kind: 'mob', id, row: mobSheetRow(pose.compass, sheetAnim), col: mobSheetCol(sheetAnim, frame) };
  }

  /**
   * WORK ORDER "Code engineer - WIRE BARBARIAN MOTION": walk12/attack12 for the barbarian only.
   * [JOSEPH] LoL-style single MS, one locomotion: Wild Rift pass 2 item 3 switches it to run12 (cols 38-49) on the
   * locomotion clock (locomotion.ts: rate = clamp(currentMS / baseMS, 0.5, 2)); walk12 (cols 26-37) stays unused. Attack follows the
   * existing attack cycle with impact frame 7 at the hit. Returns null (old columns) for idle, death, or
   * when the loaded sheet is the old narrow one.
   */
  private barbarianMotionCol(unit: Unit, anim: FlareAnim, pose: Pose): number | null {
    if (!hasBarbarianMotion(classSheetCols('barbarian'))) return null;
    if (anim === 'attack') {
      const phase = unit.attackCycle.phase === AttackPhase.Windup ? 'Windup' : 'Backswing';
      return barbarianMotionCol('attack', barbarianAttackFrame(phase, unit.attackCycle.phaseElapsedMs, unit.attackInterval));
    }
    if (anim !== 'walk' && anim !== 'run') return null;
    // Wild Rift pass 2 item 3 [JOSEPH] "trigger and hold the run animation": run12 (cols 38-49, 60 ms/frame at
    // rate 1) on the time-based locomotion clock, so it keeps playing while the stick is held in any of 8 directions.
    const run = BARBARIAN_MOTION.run;
    return barbarianMotionCol('run', locoFrame(pose.loco, run.msPerFrame, run.frames));
  }

  /** Frame within a sheet animation: attack follows the attack cycle, death plays once over 0.8 s and holds. */
  private sheetAnimFrame(unit: Unit, anim: SheetAnim, pose: Pose, frames: number): number {
    if (anim === 'attack') {
      const phase = unit.attackCycle.phase === AttackPhase.Windup ? 'Windup' : 'Backswing';
      return attackSheetFrame(phase, unit.attackCycle.phaseElapsedMs, unit.attackInterval, frames);
    }
    if (anim === 'death') {
      const elapsed = Math.max(0, this.simTime - unit.diedAt);
      return Math.min(frames - 1, Math.floor(Math.min(0.999, elapsed / 0.8) * frames));
    }
    return cycleFrame(pose.phase, frames);
  }

  /**
   * Visual readability items 6 + 8 [JOSEPH t253u]: tower / base = stronger ground shadow, a stone base platform,
   * then the cached outlined + contrast-boosted structure stamp. Same art, same foot point, draw only.
   */
  private paintStructure(
    ctx: CanvasRenderingContext2D, kind: 'tower' | 'base', x: number, y: number, height: number, ally: boolean, alive: boolean,
  ): void {
    const tower = kind === 'tower';
    // Hook in tower bitmaps [JOSEPH t263u/t266u]: bitmap when loaded, else the code-drawn fallback below.
    const bmp = structureBitmap(kind, ally, alive);
    const u = this.spriteScale();
    const s = structureBitmapScale(kind, u);
    // Bitmap ruins keep the alive footprint (manifest), so shadow + platform keep the alive size too.
    const h = bmp ? (tower ? TOWER_DRAW_H : BASE_DRAW_H * BASE_VISUAL_SCALE) * u : alive ? height : height * 0.55;
    const sw = h * (tower ? 0.28 : 0.4) * STRUCTURE_SHADOW_GROW;
    const sh = h * (tower ? 0.1 : 0.12) * STRUCTURE_SHADOW_GROW;
    const alpha = ctx.globalAlpha;
    ctx.fillStyle = `rgba(0,0,0,${STRUCTURE_SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(x, y + sh * 0.15, sw, sh, 0, 0, Math.PI * 2);
    ctx.fill();
    const pw = h * (tower ? TOWER_PLATFORM_W : BASE_PLATFORM_W);
    const ph = pw * 0.5;
    const lip = Math.max(2, h * 0.025);
    const slab = (dy: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x, y - ph + dy);
      ctx.lineTo(x + pw, y + dy);
      ctx.lineTo(x, y + ph + dy);
      ctx.lineTo(x - pw, y + dy);
      ctx.closePath();
      ctx.fill();
    };
    slab(lip, '#15120f');
    slab(0, ally ? '#3b3631' : '#352b2b');
    ctx.strokeStyle = 'rgba(214, 190, 150, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - pw, y);
    ctx.lineTo(x, y - ph);
    ctx.lineTo(x + pw, y);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    const outline = tower ? TOWER_OUTLINE_PX : BASE_OUTLINE_PX;
    if (bmp) {
      const { image, def } = bmp;
      const r = bitmapRect(def, 0, 0, s);
      const halfW = Math.max(-r.dx, r.dx + r.dw);
      // Outline kept (#87 2 px / 2.5 px, reads against the ground); contrast + glow skipped: painted into the art.
      drawStructureStamp(ctx, `bmp:${structureBitmapKey(kind, ally, alive)}`, x, y, halfW, -r.dy, outline, BITMAP_CONTRAST, (g) => {
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(image, r.dx, r.dy, r.dw, r.dh);
      });
      return;
    }
    const key = `${kind}:${ally ? 'a' : 'e'}:${alive ? 1 : 0}`;
    drawStructureStamp(ctx, key, x, y, h * 0.56, h * 1.02, outline, STRUCTURE_CONTRAST, (g) => {
      collectGroundMarks(() => (tower ? drawSpire : drawStronghold)(g, 0, 0, height, ally, alive));
    });
  }

  private paintFigure(
    ctx: CanvasRenderingContext2D,
    unit: Unit,
    opts: DrawOpts,
    tier: ArmorTier,
    dx: number,
    dy: number,
    height: number,
    swing: number,
    screen: number,
    bob: number,
    attack: AttackPose,
    lean: number,
    hero: boolean,
    boss: BossLook | null,
  ): void {
    const body = unit.kind === 'minion' || unit.kind === 'champion';
    ctx.save();
    if (!unit.alive) {
      const fade = unit.corpse > 0 ? Math.max(0.05, (unit.corpse / 4.5) * 0.55) : 0.55;
      ctx.globalAlpha = fade;
    } else if (unit.invuln > 0 && Math.sin(opts.time * 28) > 0) ctx.globalAlpha = 0.45;
    if (!unit.alive && body) {
      ctx.translate(dx, dy);
      ctx.scale(1, 0.45);
      ctx.translate(-dx, -dy);
    }
    // Visual readability item 5: procedural characters get the same 2 px dark outline (ground marks stay unoutlined).
    const outlined = (paint: (g: CanvasRenderingContext2D) => void, h: number) => {
      let marks: ((g: CanvasRenderingContext2D) => void)[] = [];
      const run = (g: CanvasRenderingContext2D) => { marks = collectGroundMarks(() => paint(g)); };
      if (ctx.globalAlpha < 0.99) {
        paint(ctx);
        return;
      }
      // Ground marks are collected during the scratch paint, then replayed under the outlined body.
      drawOutlinedLive(ctx, dx, dy, h * 0.8, h * 1.4, h * 0.3, CHARACTER_OUTLINE_PX, run, () => {
        for (const mark of marks) mark(ctx);
      });
    };
    if (hero) {
      outlined((g) => drawBarbarian(g, dx, dy, height, swing, lean, screen, tier, bob, attack, unit.team === 'ally'), height);
    } else if (unit.defId === 'tower') {
      this.paintStructure(ctx, 'tower', dx, dy, height, unit.team === 'ally', unit.alive);
    } else if (unit.defId === 'base-ally' || unit.defId === 'base-enemy') {
      this.paintStructure(ctx, 'base', dx, dy, height, unit.defId === 'base-ally', unit.alive);
    } else if (unit.kind === 'seal') {
      drawProp(ctx, dx, dy, height * 0.45, 'rock', 1);
    } else if (boss) {
      outlined((g) => drawBoss(g, dx, dy - bob, height, boss, swing, unit.team === 'ally', attack, opts.time), height);
    } else {
      const look = tokenLook(unit);
      outlined((g) => drawToken(g, dx, dy - bob, height * look.scale, look, swing, unit.team === 'ally', attack), height * look.scale);
    }
    if (unit.whirlT > 0) {
      ctx.strokeStyle = 'rgba(240, 220, 170, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(dx, dy - height * 0.45, height * 0.42, height * 0.16, opts.time * 6, 0, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private tickFx(): void {
    const dt = Math.min(0.05, this.frameDt);
    for (const [id, t] of this.slashT) {
      const next = t - dt;
      if (next <= 0) this.slashT.delete(id);
      else this.slashT.set(id, next);
    }
    for (const flash of this.portals) flash.t += dt;
    if (this.portals.length) this.portals = this.portals.filter((flash) => flash.t < 0.45);
  }

  private syncRecall(sim: Sim): void {
    const present = new Set<number>();
    for (const unit of sim.units) {
      present.add(unit.id);
      const prev = this.recallTrack.get(unit.id);
      if (unit.recall > 0) {
        if (!prev) this.recallTrack.set(unit.id, { max: Math.max(unit.recall, 0.01), x: unit.x, y: unit.y });
      } else if (prev) {
        if (Math.hypot(unit.x - prev.x, unit.y - prev.y) > 40) {
          this.portals.push({ x: prev.x, y: prev.y, t: 0 }, { x: unit.x, y: unit.y, t: 0 });
          this.seen.portal += 1;
        }
        this.recallTrack.delete(unit.id);
      }
    }
    for (const id of this.recallTrack.keys()) {
      if (!present.has(id)) this.recallTrack.delete(id);
    }
  }

  private armSlash(unit: Unit, punching: boolean, screen: number, playerId: number): void {
    const armed = this.slashArmed.get(unit.id) ?? false;
    if (punching && !armed) {
      this.slashArmed.set(unit.id, true);
      this.slashT.set(unit.id, 0.16);
      this.slashFace.set(unit.id, screen);
      this.seen.slash += 1;
      if (unit.id === playerId) this.seen.heroSlash += 1;
    } else if (!punching && (this.slashT.get(unit.id) ?? 0) <= 0) {
      this.slashArmed.set(unit.id, false);
    }
  }

  private noteHit(unit: Unit): void {
    if (unit.hitFlash > 0.02) {
      this.look.spark = true;
      if (unit.kind === 'minion' || unit.kind === 'champion') this.look.flinch = true;
      if (!this.sparkArmed.has(unit.id)) {
        this.sparkArmed.add(unit.id);
        this.seen.spark += 1;
        if (unit.kind === 'minion' || unit.kind === 'champion') this.seen.flinch += 1;
      }
    } else this.sparkArmed.delete(unit.id);
  }

  /** One cached fullscreen tint. Rebuilt only when the CSS size changes. */
  private shadeOverlay(cssW: number, cssH: number): HTMLCanvasElement {
    const key = `${Math.round(cssW)}x${Math.round(cssH)}`;
    if (this.shadeCanvas && this.shadeKey === key) return this.shadeCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cssW));
    canvas.height = Math.max(1, Math.round(cssH));
    const g = canvas.getContext('2d');
    if (!g) return canvas;
    const tint = g.createLinearGradient(0, 0, 0, cssH);
    tint.addColorStop(0, 'rgba(16, 24, 38, 0.18)');
    tint.addColorStop(0.55, 'rgba(0,0,0,0)');
    tint.addColorStop(1, 'rgba(48, 24, 10, 0.16)');
    g.fillStyle = tint;
    g.fillRect(0, 0, cssW, cssH);
    // Wild Rift pass 2 item 4 [TEMP]: lighter, wider vignette (lighting.ts LIGHTING).
    const vignette = g.createRadialGradient(cssW / 2, cssH / 2, cssH * LIGHTING.vignetteInner, cssW / 2, cssH / 2, cssH * LIGHTING.vignetteOuter);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${LIGHTING.vignetteAlpha})`);
    g.fillStyle = vignette;
    g.fillRect(0, 0, cssW, cssH);
    this.shadeCanvas = canvas;
    this.shadeKey = key;
    return canvas;
  }

  private blitHitFlash(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    paint: (target: CanvasRenderingContext2D) => void,
  ): void {
    const width = 420;
    const height = 560;
    const ox = 210;
    const oy = 340;
    if (!this.flashCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.flashCanvas = canvas;
    }
    const g = this.flashCanvas.getContext('2d');
    if (!g) {
      paint(ctx);
      return;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, width, height);
    g.save();
    g.translate(ox - dx, oy - dy);
    paint(g);
    g.restore();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255, 228, 214, 0.88)';
    g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.flashCanvas, dx - ox, dy - oy);
  }

  /** Hero is the main pool. Allies, fires, and the recall portal add the rest. */
  private collectUnitLight(unit: Unit, playerId: number, x: number, y: number): void {
    if (!unit.alive) return;
    if (unit.id === playerId) {
      this.lights.push({ screenX: x, screenY: y - 36, radius: LIGHTING.heroLightRadius, intensity: LIGHTING.heroLightIntensity });
      if (unit.recall > 0) {
        this.lights.push({ screenX: x, screenY: y, radius: 80, intensity: 0.85, color: 'rgb(90, 160, 255)' });
      }
      return;
    }
    if (unit.team !== 'ally') return;
    if (unit.kind === 'champion') {
      this.lights.push({ screenX: x, screenY: y - 24, radius: 120, intensity: 0.7 });
    } else if (unit.defId === 'tower' || unit.defId === 'base-ally') {
      this.lights.push({ screenX: x, screenY: y - 40, radius: 160, intensity: 0.85 });
    }
    if (unit.recall > 0) {
      this.lights.push({ screenX: x, screenY: y, radius: 70, intensity: 0.75, color: 'rgb(90, 160, 255)' });
    }
  }

  private observeBlood(sim: Sim): void {
    if (!this.bake) return;
    if (!this.bloodReady) {
      for (const unit of sim.units) {
        if (unit.alive) this.aliveWas.add(unit.id);
      }
      this.bloodReady = true;
      return;
    }
    for (const unit of sim.units) {
      const wasAlive = this.aliveWas.has(unit.id);
      const bleeds = unit.kind === 'minion' || unit.kind === 'champion';
      if (wasAlive && !unit.alive && bleeds) {
        this.stampAt(unit, unit.kind === 'champion' ? 26 : 18);
        this.bloodStamps += 1;
      }
      if (unit.alive) this.aliveWas.add(unit.id);
      else this.aliveWas.delete(unit.id);
    }
  }

  /** Map 12k: the pool goes into every cached chunk it touches and into the log for chunks baked later. */
  private stampAt(unit: Unit, radius: number): void {
    const p = projectIso(unit.x, unit.y, BAKE_HW, this.ox, this.oy);
    const pool = { x: p.x, y: p.y, r: radius, ichor: bleedsIchor(unit), seed: this.bloodStamps + 1 };
    this.bloodLog.push(pool);
    if (this.bloodLog.length > BLOOD_LOG_CAP) this.bloodLog.shift();
    if (!this.bake) return;
    const size = this.bake.size;
    for (const chunk of this.bake.live()) {
      const bx = chunk.cx * size;
      const by = chunk.cy * size;
      if (pool.x + 40 < bx || pool.x - 40 > bx + size || pool.y + 40 < by || pool.y - 40 > by + size) continue;
      chunk.ctx.save();
      chunk.ctx.translate(-bx, -by);
      seededStamp(chunk.ctx, pool);
      chunk.ctx.restore();
    }
  }

  /** Item 16: ready health orbs (red) and pools (red-blue); consumed ones are hidden until refill. */
  private drawOrbs(sim: Sim): void {
    const ctx = this.ctx;
    for (const orb of sim.orbs ?? []) {
      if (orb.refill > 0) continue;
      const p = this.project(orb.x, orb.y);
      const edge = this.project(orb.x + (orb.kind === 'pool' ? 70 : 16), orb.y);
      const r = Math.max(3, Math.hypot(edge.x - p.x, edge.y - p.y));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = orb.kind === 'pool' ? 'rgba(90, 60, 150, 0.45)' : 'rgba(200, 30, 30, 0.85)';
      ctx.fill();
      ctx.strokeStyle = orb.kind === 'pool' ? 'rgba(200, 60, 60, 0.8)' : 'rgba(255, 170, 150, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.lights.push({ screenX: p.x, screenY: p.y, radius: orb.kind === 'pool' ? 60 : 30, intensity: 0.6, color: '#c03030' });
    }
  }

  /** Item 17: hiding grass patches, drawn as dark tufted ground. */
  private drawGrass(sim: Sim): void {
    const ctx = this.ctx;
    for (const patch of sim.grass ?? []) {
      const p = this.project(patch.x, patch.y);
      const edge = this.project(patch.x + patch.r, patch.y);
      const r = Math.max(4, Math.hypot(edge.x - p.x, edge.y - p.y));
      if (p.x < -r || p.y < -r || p.x > this.camera.cssW + r || p.y > this.camera.cssH + r) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(28, 52, 18, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(70, 104, 38, 0.8)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const a = (i * 2.399) % (Math.PI * 2);
        const d = ((i * 37) % 17) / 17;
        const tx = p.x + Math.cos(a) * r * 0.85 * d;
        const ty = p.y + Math.sin(a) * r * 0.42 * d;
        ctx.beginPath();
        ctx.moveTo(tx - 2, ty);
        ctx.lineTo(tx, ty - 6);
        ctx.lineTo(tx + 2, ty);
        ctx.stroke();
      }
    }
  }

  private drawMist(sim: Sim, cssW: number, cssH: number): void {
    const pattern = this.ensureMistPattern();
    if (!pattern) return;
    const drift = (this.mistOffset + Math.min(0.05, this.frameDt) * 13.5) % 256;
    this.mistOffset = drift;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.mistAlpha(sim);
    ctx.translate(drift, (drift * 0.35) % 256);
    ctx.fillStyle = pattern;
    ctx.fillRect(-256, -256, cssW + 512, cssH + 512);
    ctx.restore();
  }

  private mistAlpha(sim: Sim): number {
    const kind = groundAt(sim.map, this.focusX, this.focusY);
    const camp =
      Math.hypot(this.focusX - sim.map.playerBase.x, this.focusY - sim.map.playerBase.y) < 260 ||
      Math.hypot(this.focusX - sim.map.enemyBase.x, this.focusY - sim.map.enemyBase.y) < 260;
    if (kind === 'town' || camp) return 0.07;
    if (kind === 'grass' || kind === 'edge' || kind === 'bank' || kind === 'dark' || kind === 'river') return 0.15;
    return 0.12;
  }

  private ensureMistPattern(): CanvasPattern | null {
    if (this.mistPattern) return this.mistPattern;
    const tile = this.ensureMist();
    if (!tile) return null;
    this.mistPattern = this.ctx.createPattern(tile, 'repeat');
    return this.mistPattern;
  }

  private ensureMist(): HTMLCanvasElement | null {
    if (this.mistCanvas) return this.mistCanvas;
    {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const g = canvas.getContext('2d');
      if (!g) return null;
      for (let i = 0; i < 16; i++) {
        const x = (i * 67) % 256;
        const y = (i * 43) % 256;
        const radius = 26 + (i % 5) * 12;
        for (const ox of [-256, 0, 256]) {
          for (const oy of [-256, 0, 256]) {
            const cx = x + ox;
            const cy = y + oy;
            const blob = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
            blob.addColorStop(0, 'rgba(214, 220, 206, 0.62)');
            blob.addColorStop(1, 'rgba(214, 220, 206, 0)');
            g.fillStyle = blob;
            g.beginPath();
            g.arc(cx, cy, radius, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      this.mistCanvas = canvas;
    }
    return this.mistCanvas;
  }

  private syncItemTags(): void {
    const host = document.getElementById('item-tags');
    if (!host) return;
    if (this.groundDrops.length === 0) {
      if (host.childElementCount) host.replaceChildren();
      return;
    }
    host.replaceChildren();
    for (const drop of this.groundDrops) {
      const p = this.project(drop.x, drop.y);
      const tag = document.createElement('div');
      tag.className = ITEM_LABEL_CLASS;
      tag.textContent = drop.name;
      tag.style.color = drop.tier === 'magic' ? 'rgb(112, 112, 255)' : drop.tier === 'rare' ? 'rgb(255, 236, 96)' : drop.tier === 'unique' ? 'rgb(207, 176, 96)' : drop.tier === 'set' ? 'rgb(88, 196, 96)' : 'rgb(244, 244, 244)';
      tag.style.left = `${p.x}px`;
      tag.style.top = `${p.y - 18}px`;
      host.appendChild(tag);
    }
  }

  private publishAtmos(): void {
    if (!ATMOS_LOG) return;
    const g = globalThis as { __atmos?: AtmosphereProbe };
    g.__atmos = this.debugAtmosphere();
  }

  debugAtmosphere(): AtmosphereProbe {
    return {
      lightAlloc: this.lighting.allocations,
      ambientAlpha: AMBIENT_ALPHA,
      blood: this.bloodStamps,
      drops: this.groundDrops.length,
      hero: this.heroScreen ? { ...this.heroScreen } : null,
    };
  }

  /** Map 12k: ground bake chunk stats (debug hook). */
  bakeStats(): { live: number; baked: number; width: number; height: number; chunk: number; draws: number; view: number[] } | null {
    if (!this.bake) return null;
    return { live: this.bake.count, baked: this.bake.baked, width: this.bake.width, height: this.bake.height, chunk: this.bake.size, draws: this.bake.draws, view: this.bake.lastView };
  }

  sampleMap(worldX: number, worldY: number): [number, number, number, number] | null {
    if (!this.bake) return null;
    const p = projectIso(worldX, worldY, BAKE_HW, this.ox, this.oy);
    return this.bake.sample(Math.round(p.x), Math.round(p.y));
  }

  sampleView(cssX: number, cssY: number): [number, number, number, number] | null {
    const x = Math.round(cssX * this.camera.dpr);
    const y = Math.round(cssY * this.camera.dpr);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;
    const px = this.ctx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
  }

  private publishLook(): void {
    if (!LOOK_LOG) return;
    const g = globalThis as { __look?: unknown };
    g.__look = {
      recall: this.look.recall,
      recallSec: this.look.recallSec,
      recallFill: this.look.recallFill,
      slash: this.look.slash,
      spark: this.look.spark,
      flinch: this.look.flinch,
      portal: this.portals.length > 0,
      seen: { ...this.seen },
    };
  }

  /** One dt drives the sine. Facing eases toward the compass and never resets the phase. */
  private poseOf(unit: Unit, playerId: number): Pose {
    const prev = this.poses.get(unit.id);
    const step = prev ? Math.hypot(unit.x - prev.x, unit.y - prev.y) : 0;
    const motion = unit.id === playerId ? readStickMotion() : null;
    const directed = motion?.directing === true;
    let state: HeroPose;
    let elapsed: number;
    if (directed && motion) {
      state = motion.gait === 'walk' ? 'walk' : 'idle';
      const moving = state !== 'idle';
      elapsed = (prev?.elapsed ?? 0) + (moving && this.frameDt > 0 ? this.frameDt * 1000 : 0);
    } else {
      const stepped = heroGaitStep(prev?.elapsed ?? 0, step, this.frameDt);
      elapsed = stepped.elapsed;
      // [JOSEPH] one movement speed: moving is always the walk cycle.
      state = !stepped.moving ? 'idle' : 'walk';
    }
    const phase = advanceHeroPhase(prev?.phase ?? 0, state, this.frameDt);
    // WILD RIFT VIEW: the sheet row follows the on-screen facing; `shown` stays a world angle.
    const compass = heroHoldCompass(prev?.compass ?? null, facingToView(unit.facing, activeView.turns));
    const target = compass * (Math.PI / 4) - facingToView(0, activeView.turns);
    const shown = prev ? smoothFacing(prev.shown, target, this.frameDt) : target;
    const stepped = state !== 'idle' && step < MAX_STRIDE_STEP ? step : 0;
    const travel = (prev?.travel ?? 0) + stepped;
    // Wild Rift pass 2 item 3: playbackRate = clamp(championMS / totalMS(msBase), 0.5, 2) [TEMP clamp].
    const rate = unit.kind === 'champion' ? locomotionRate(championMS(unit), totalMS(unit.msBase)) : 1;
    const loco = advanceLocoClock(prev?.loco ?? 0, this.frameDt * 1000, rate, state !== 'idle');
    const pose: Pose = { phase, shown, compass, x: unit.x, y: unit.y, elapsed, state, travel, loco };
    this.poses.set(unit.id, pose);
    if (STICK_LOG && unit.id === playerId) {
      const speed = this.frameDt > 0 ? step / this.frameDt : 0;
      const trace = globalThis as { __locoLog?: { state: string; frame: number; speed: number; x: number; y: number; dt: number; heroHeight: number; hz: number; loco: number; rate: number; compass: number }[] };
      if (!trace.__locoLog) trace.__locoLog = [];
      trace.__locoLog.push({
        state: state === 'idle' ? 'IDLE' : state === 'walk' ? 'WALK' : 'RUN',
        frame: state === 'idle' ? 0 : Math.floor(phase * 8) % 8,
        speed,
        x: unit.x,
        y: unit.y,
        dt: this.frameDt,
        heroHeight: heroDrawHeight(state),
        hz: heroCycleHz(state),
        loco,
        rate,
        compass,
      });
      if (trace.__locoLog.length > 400) trace.__locoLog.shift();
    }
    return pose;
  }

  private unitHeight(unit: Unit): number {
    if (bossLook(unit)) return bossLook(unit)?.height ?? 150;
    if (unit.defId === 'fallen' && unit.name === 'Bishibosh') return 92;
    switch (unit.defId) {
      case 'fallen':
        return 80;
      case 'zombie':
        return 104;
      case 'quillrat':
        return 72;
      case 'skeleton':
        return 96;
      case 'hungry-dead':
        return 108;
      case 'goatman':
        return 104;
      case 'willowisp':
        return 76;
      case 'mummy':
        return 112;
      case 'demon':
        return 116;
      case 'seal':
        return 120;
      case 'rogue':
      case 'rogue-archer':
      case 'valkyrie':
      case 'act2-mercenary':
      case 'act3-mercenary':
        return 100;
      case 'tower':
        return unit.alive ? 128 : 70;
      case 'base-ally':
      case 'base-enemy':
        return unit.alive ? 220 : 120;
      default:
        return 70;
    }
  }

  private armorTier(sim: Sim): ArmorTier {
    const id = sim.loadout.armor;
    if (id === 'stu' || id === 'rng') return 'heavy';
    if (id === 'lea') return 'medium';
    return 'light';
  }

  private rangeRing(ctx: CanvasRenderingContext2D, unit: Unit, color: string): void {
    const p = this.project(unit.x, unit.y);
    const edge = this.project(unit.x + unit.attackRange, unit.y);
    const rx = Math.max(8, Math.abs(edge.x - p.x));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, rx * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBar(unit: Unit, x: number, footY: number, height: number, targetId: number | null, playerId: number): void {
    const ctx = this.ctx;
    const w = unit.kind === 'base' ? 74 : unit.kind === 'champion' ? 54 : 34;
    const barH = 5;
    const y = footY - height - (unit.kind === 'minion' ? 10 : 18);
    if (unit.kind === 'champion') {
      this.drawUnitFrame(unitFrameData(unit, playerId, unit.id === playerId ? this.heroLevel : undefined, this.heroXp), x, y);
      return;
    }
    const pct = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
    const mine = unit.id === playerId;
    if (mine) {
      const badge = 13;
      const bx = x - w / 2 - badge - 1;
      const by = y + barH / 2;
      const border = unit.team === 'enemy' ? '#e4553c' : '#c7b377';
      ctx.beginPath();
      ctx.arc(bx, by, badge / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 6, 4, 0.88)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = border;
      ctx.stroke();
      const level = mine ? this.heroLevel : unit.level || 1;
      ctx.save();
      ctx.fillStyle = '#c7b377';
      ctx.font = '700 8px "Cinzel Decorative", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(level), bx, by + 0.5);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, barH + 2);
    ctx.fillStyle = unit.team === 'ally' ? '#2a2218' : '#2a1210';
    ctx.fillRect(x - w / 2, y, w, barH);
    ctx.fillStyle = unit.team === 'ally' ? '#c6d28a' : unit.team === 'wild' ? '#c49a3a' : '#e4553c';
    ctx.fillRect(x - w / 2, y, w * pct, barH);
    const step = pipStep(unit.maxHp, w);
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    for (let mark = step; mark < unit.maxHp - 0.5; mark += step) {
      const tx = Math.round(x - w / 2 + (mark / unit.maxHp) * w);
      ctx.fillRect(tx, y, 1, barH);
    }
    if (mine && unit.maxMana > 0) {
      const my = y + barH + 2;
      const mana = Math.max(0, Math.min(1, unit.mana / unit.maxMana));
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(x - w / 2 - 1, my - 1, w + 2, 4);
      ctx.fillStyle = '#071422';
      ctx.fillRect(x - w / 2, my, w, 2);
      ctx.fillStyle = '#3ec0ff';
      ctx.fillRect(x - w / 2, my, w * mana, 2);
    }
    if (unit.id === targetId && unit.kind !== 'base') {
      ctx.fillStyle = '#f0e2bc';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(unit.name, x, y - 4);
    }
  }

  /** Economy order: cached frame chrome (back + front layers) keyed by unitFrameData.key. */
  private frameCache = new Map<string, { back: HTMLCanvasElement; front: HTMLCanvasElement }>();

  /**
   * Unit-frame restyle order [JOSEPH t228u] (Wild Rift layout, Diablo 2 dress kept): class name
   * centered above the bars, dark round level badge (gold rim, red on enemies) at the left with the
   * level centered and a thin XP ring just inside the rim filling clockwise, green HP bar (enemies
   * red [JOSEPH earlier]) with ticks right of it, thinner blue mana bar directly under it. Chrome
   * (incl. the ring, in 1/48 steps) is drawn once into offscreen canvases and reused until the key
   * changes; each frame only blits it and fills two rects.
   */
  private drawUnitFrame(data: UnitFrameData, x: number, y: number): void {
    const ctx = this.ctx;
    const { w, hp: hpH, mana: manaH, gap } = FRAME;
    const scale = Math.min(2, Math.max(1, this.camera.dpr || 1));
    const chrome = this.frameChrome(data, scale);
    const bx = UF_BX;
    const ox = Math.round(x - (1 + bx + w) / 2);
    const oy = Math.round(y) - UF_BY;
    const cw = chrome.back.width / scale;
    const ch = chrome.back.height / scale;
    ctx.drawImage(chrome.back, ox, oy, cw, ch);
    ctx.fillStyle = data.hpColor;
    ctx.fillRect(ox + bx, oy + UF_BY, w * data.hpPct, hpH);
    if (data.showMana) {
      ctx.fillStyle = FRAME_COLORS.mana;
      ctx.fillRect(ox + bx, oy + UF_BY + hpH + gap, w * data.manaPct, manaH);
    }
    ctx.drawImage(chrome.front, ox, oy, cw, ch);
  }

  private frameChrome(data: UnitFrameData, scale: number): { back: HTMLCanvasElement; front: HTMLCanvasElement } {
    const key = `${data.key}|${scale}`;
    const hit = this.frameCache.get(key);
    if (hit) return hit;
    if (this.frameCache.size > 48) this.frameCache.clear();
    const { w, hp: hpH, mana: manaH, gap, circle: r, ring, name } = FRAME;
    const bx = UF_BX; // bar left inside the chrome canvas
    const by = UF_BY; // bar top
    const barsH = hpH + (data.showMana ? gap + manaH : 0);
    const cx = r + 1;
    const cy = by + barsH / 2;
    const cssW = bx + w + 12; // room for 'Necromancer' wider than the bar
    const cssH = Math.max(by + barsH, cy + r) + 2;
    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(cssW * scale);
      canvas.height = Math.ceil(cssH * scale);
      const c = canvas.getContext('2d')!;
      c.scale(scale, scale);
      return { canvas, c };
    };
    // Back: bar well, trough colors and the class name centered over the bars.
    const back = make();
    back.c.fillStyle = 'rgba(0,0,0,0.82)';
    back.c.fillRect(bx - 1, by - 1, w + 2, barsH + 2);
    back.c.fillStyle = data.team === 'enemy' ? '#2a1210' : '#16200f';
    back.c.fillRect(bx, by, w, hpH);
    if (data.showMana) {
      back.c.fillStyle = '#071422';
      back.c.fillRect(bx, by + hpH + gap, w, manaH);
    }
    back.c.font = `600 ${name}px "Cinzel", "Cinzel Decorative", Georgia, serif`;
    back.c.textAlign = 'center';
    back.c.textBaseline = 'alphabetic';
    back.c.lineJoin = 'round';
    back.c.lineWidth = 3;
    back.c.strokeStyle = 'rgba(0,0,0,0.9)';
    back.c.strokeText(data.className, bx + w / 2, by - 3);
    back.c.fillStyle = data.mine ? '#f6e7bd' : '#e2d5b0';
    back.c.fillText(data.className, bx + w / 2, by - 3);
    // Front: ticks, a gold hairline over the bars, then the level badge with its XP ring.
    const front = make();
    front.c.fillStyle = 'rgba(0,0,0,0.85)';
    for (const t of data.ticks) front.c.fillRect(Math.round(bx + t * w), by, 1, hpH);
    front.c.strokeStyle = 'rgba(199,179,119,0.55)';
    front.c.lineWidth = 1;
    front.c.strokeRect(bx - 0.5, by - 0.5, w + 1, barsH + 1);
    front.c.beginPath();
    front.c.arc(cx, cy, r, 0, Math.PI * 2);
    const grad = front.c.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, r);
    grad.addColorStop(0, '#3a2c1c');
    grad.addColorStop(1, '#0c0805');
    front.c.fillStyle = grad;
    front.c.fill();
    front.c.lineWidth = BADGE_RIM;
    front.c.strokeStyle = data.rimColor;
    front.c.stroke();
    const ringR = xpRingRadius(r, ring);
    front.c.lineWidth = ring;
    front.c.strokeStyle = 'rgba(0,0,0,0.75)';
    front.c.beginPath();
    front.c.arc(cx, cy, ringR, 0, Math.PI * 2);
    front.c.stroke();
    if (data.xpRing > 0) {
      front.c.strokeStyle = FRAME_COLORS.ring;
      front.c.beginPath();
      front.c.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + data.xpRing * Math.PI * 2);
      front.c.stroke();
    }
    front.c.fillStyle = '#f6e7bd';
    // [TEMP] plain sans digits: Cinzel's '1' reads as a roman 'I' at this size.
    front.c.font = `700 ${data.levelText.length > 1 ? 11 : 12}px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    front.c.textAlign = 'center';
    front.c.textBaseline = 'middle';
    front.c.fillText(data.levelText, cx, cy + 0.5);
    const entry = { back: back.canvas, front: front.canvas };
    this.frameCache.set(key, entry);
    return entry;
  }

  private drawFx(ctx: CanvasRenderingContext2D, fx: Sim['fx'][number], sim?: Sim): void {
    const alpha = Math.max(0, 1 - fx.t / fx.life);
    const p = this.project(fx.x, fx.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fx.kind === 'text' && fx.text) {
      const numeric = /^-?\d+$/.test(fx.text);
      const damage = fx.color === '#f4efe4' && numeric;
      const gothic = fx.text.startsWith('Level') || numeric;
      ctx.font = gothic ? '700 16px "Cinzel Decorative", serif' : 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = damage && sim ? damageInk(fx, sim) : gothic ? '#c7b377' : fx.color;
      ctx.fillText(fx.text, p.x, p.y);
    } else if (fx.kind === 'ring') {
      const edge = this.project(fx.x + fx.r * (0.35 + fx.t / fx.life), fx.y);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.abs(edge.x - p.x), Math.abs(edge.x - p.x) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.kind === 'slash') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 18, 8, fx.facing ?? 0, 0, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * WILD RIFT VIEW minimap. Order: "Show: alive champion positions as small portrait icons; standing defense towers
   * (hide the icon when destroyed); the main base/Nexus as the clearest, largest icon; base guard towers; minions as
   * small dots; major objectives (cave bosses) and jungle camps as small icons; current camera viewport as an outline
   * rectangle; base walls as thin light lines." Sizes: view.ts ICONS.
   */
  private drawMinimap(sim: Sim, targetId: number | null): void {
    const mini = document.querySelector<HTMLCanvasElement>('#minimap');
    if (!mini) return;
    const toggle = mini.closest('#minimap-toggle');
    if (toggle?.classList.contains('off')) return;
    const cssW = mini.clientWidth;
    if (cssW !== this.miniCss) {
      // WILD RIFT VIEW: the map card was resized (grip drag); re-measure the backing store.
      this.miniCss = cssW;
      this.miniW = 0;
      this.miniH = 0;
    }
    let w = this.miniW;
    let h = this.miniH;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w < 2 || h < 2) {
      const rect = mini.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      if (w < 2 || h < 2) return;
      this.miniW = w;
      this.miniH = h;
    }
    if (mini.width !== w || mini.height !== h) {
      mini.width = w;
      mini.height = h;
      this.miniStatic = null;
    }
    const ctx = mini.getContext('2d');
    if (!ctx) return;
    crisp(ctx);
    const map = sim.map;
    const myTeam = sim.units.find((unit) => unit.id === sim.playerId)?.team;
    const plate = this.ensureMiniStatic(map, w, h, myTeam, dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (plate) ctx.drawImage(plate, 0, 0);
    else {
      ctx.fillStyle = '#120e0b';
      ctx.fillRect(0, 0, w, h);
    }
    // Four UI/size changes item 3 [JOSEPH t250u]: 20% black layer over the map plate, under every live icon.
    ctx.fillStyle = `rgba(0, 0, 0, ${MINIMAP_ICON_SHADE})`;
    ctx.fillRect(0, 0, w, h);
    const at = (x: number, y: number) => worldToMinimap(x, y, map.width, map.height, w, h, myTeam);
    const ink = (team: Unit['team']) => (team === 'ally' ? '#6aa7ff' : team === 'wild' ? '#c49a3a' : '#e15a4a');
    const diamondAt = (x: number, y: number, size: number, fill: string) => {
      const r = (size * dpr) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = '#1a120c';
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.stroke();
    };
    // Camera viewport: the four screen corners unprojected onto the ground.
    const corners = viewportFootprint((sx, sy) => this.screenToWorld(sx, sy), this.camera.cssW, this.camera.cssH)
      .map((p) => at(p.x, p.y));
    ctx.strokeStyle = 'rgba(240, 226, 188, 0.9)';
    ctx.lineWidth = ICONS.viewportLine * dpr;
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    const order = (unit: Unit) => (unit.kind === 'minion' ? 0 : unit.kind === 'seal' ? 1 : unit.kind === 'tower' ? 2 : unit.kind === 'base' ? 3 : 4);
    const shown = sim.units
      .filter((unit) => {
        if (unit.kind === 'minion' || unit.kind === 'champion' || unit.kind === 'tower') {
          if (!unit.alive) return false; // dead minions, dead champions and destroyed towers are hidden
        }
        if (unit.alive && unit.hidden && unit.team !== myTeam) return false; // Item 17
        return true;
      })
      .sort((a, b) => order(a) - order(b));
    for (const unit of shown) {
      const p = at(unit.x, unit.y);
      if (unit.kind === 'base') {
        diamondAt(p.x, p.y, ICONS.nexus, ink(unit.team));
        ctx.strokeStyle = 'rgba(240, 226, 188, 0.9)';
        ctx.lineWidth = dpr;
        ctx.stroke();
      } else if (unit.kind === 'tower') {
        const size = towerIconSize(this.towerRole(map, unit)) * dpr;
        ctx.fillStyle = ink(unit.team);
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        ctx.strokeStyle = '#1a120c';
        ctx.lineWidth = Math.max(1, dpr * 0.75);
        ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
      } else if (unit.kind === 'champion') {
        const r = (ICONS.champion * dpr) / 2;
        ctx.fillStyle = '#120e0b';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (!drawClassPortrait(ctx, unit.defId, p.x, p.y, r - dpr)) {
          ctx.fillStyle = ink(unit.team);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r - dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = unit.id === sim.playerId ? '#f4e7c3' : ink(unit.team);
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const size = (unit.kind === 'minion' ? ICONS.minion : ICONS.seal) * dpr;
        ctx.fillStyle = ink(unit.team);
        ctx.globalAlpha = unit.alive ? 1 : 0.4;
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
      if (unit.id === targetId) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = dpr;
        ctx.strokeRect(p.x - 3 * dpr, p.y - 3 * dpr, 6 * dpr, 6 * dpr);
      }
    }
  }

  /** Role of a standing tower from the map's tower seats (inner = base guard, outer = lane). */
  private towerRole(map: ActDef, unit: Unit): 'inner' | 'outer' | undefined {
    const seat = map.towers.find((spec) => spec.x === unit.x && spec.y === unit.y && spec.team === unit.team);
    return seat?.role as 'inner' | 'outer' | undefined;
  }

  /** Lanes, river, base walls, cave bosses and camps. Rebuilt only when the map card changes size or side. */
  private ensureMiniStatic(map: Sim['map'], w: number, h: number, team: Unit['team'] | undefined, dpr: number): HTMLCanvasElement | null {
    const key = `${map.id}:${w}x${h}:${team}`;
    if (this.miniStatic && this.miniStaticKey === key) return this.miniStatic;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const at = (x: number, y: number) => worldToMinimap(x, y, map.width, map.height, w, h, team);
    ctx.fillStyle = '#120e0b';
    ctx.fillRect(0, 0, w, h);
    // Map 12k item 4: theme zones from the same map data (mapZones.ts), as a low-res grid under the lanes.
    {
      const cols = MINI_ZONE_GRID;
      const rows = Math.max(1, Math.round((MINI_ZONE_GRID * map.height) / map.width));
      const grid = zoneGrid(map, cols, rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = at((c * map.width) / cols, (r * map.height) / rows);
          const b = at(((c + 1) * map.width) / cols, ((r + 1) * map.height) / rows);
          ctx.fillStyle = ZONE_MINI[grid[r * cols + c]];
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 0.5, Math.abs(b.y - a.y) + 0.5);
        }
      }
      ctx.fillStyle = 'rgba(10, 8, 6, 0.28)';
      ctx.fillRect(0, 0, w, h);
    }
    const strokeLane = (points: Vec[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = at(point.x, point.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    };
    const lw = w / 160;
    // Map 12k item 3: the river is a lava river (dark crust + molten core).
    if (map.river && map.river.length > 1) {
      strokeLane(map.river, '#3a1208', 5 * lw);
      strokeLane(map.river, '#ff7a22', 2.5 * lw);
    }
    const paths = map.paths?.length ? map.paths : null;
    const roads = paths ? paths.map((path) => roadPoints(map, path.lane)) : [map.lane];
    for (const road of roads) strokeLane(road, '#3a2c22', 5 * lw);
    for (const road of roads) strokeLane(road, '#e6d3a1', 2 * lw);
    // Base walls: the palisade fence posts at each camp gate, joined as thin light lines.
    const posts = sceneryFor(map).filter((prop) => prop.kind === 'fence');
    ctx.strokeStyle = 'rgba(240, 226, 188, 0.6)';
    ctx.lineWidth = ICONS.wallLine * dpr;
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1];
      const b = posts[i];
      if (Math.hypot(a.x - b.x, a.y - b.y) > mapLen(90)) continue;
      const pa = at(a.x, a.y);
      const pb = at(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    // Cave bosses (major objectives) and jungle camps.
    for (const den of map.dens ?? []) {
      const p = at(den.x, den.y);
      const r = ((den.cave ? ICONS.caveBoss : ICONS.jungleCamp) * dpr) / 2;
      ctx.beginPath();
      if (den.cave) {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      } else {
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
      }
      ctx.fillStyle = den.cave ? '#c47a2a' : '#c49a3a';
      ctx.fill();
      ctx.strokeStyle = '#1a120c';
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.stroke();
    }
    this.miniStatic = canvas;
    this.miniStaticKey = key;
    return canvas;
  }
}

/** Map 12k: minimap zone grid resolution (cells across). */
const MINI_ZONE_GRID = 96;
/** Map 12k: blood pools remembered for chunks that bake after the pool landed. */
const BLOOD_LOG_CAP = 400;

/** Blood pool with a fixed random sequence, so the same pool repaints identically in every chunk it crosses. */
function seededStamp(ctx: CanvasRenderingContext2D, pool: { x: number; y: number; r: number; ichor: boolean; seed: number }): void {
  const random = Math.random;
  let state = (pool.seed * 2654435761) >>> 0 || 1;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    stampBloodPool(ctx, pool.x, pool.y, pool.r, pool.ichor);
  } finally {
    Math.random = random;
  }
}

/** Intersection point of segments ab and cd, or null. */
function segHit(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const den = rX * sY - rY * sX;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sY - (c.y - a.y) * sX) / den;
  const u = ((c.x - a.x) * rY - (c.y - a.y) * rX) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rX * t, y: a.y + rY * t };
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, height * 0.26, height * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function groundRing(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean): void {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = ally ? '#6aa7ff' : '#e4553c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, height * 0.2, height * 0.075, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function roadPoints(map: ActDef, lane: Vec[]): Vec[] {
  return [map.playerBase, ...lane, map.enemyBase];
}

/** 100 HP per tick, or 250 when 100 would pack the marks closer than 4px. */
function pipStep(maxHp: number, width: number): number {
  const gap = width / Math.max(1, maxHp / 100);
  return gap >= 4 ? 100 : 250;
}

/** Tagged hits use their school. Untagged numbers keep the old proximity colors. */
function damageInk(fx: Sim['fx'][number], sim: Sim): string {
  if (fx.school === 'physical' || fx.school === 'magic') return damageColor(fx.school, fx.taken === true);
  let best = 72;
  let onPlayer = false;
  for (const unit of sim.units) {
    const d = Math.hypot(unit.x - fx.x, unit.y - fx.y);
    if (d < best) {
      best = d;
      onPlayer = unit.id === sim.playerId;
    }
  }
  return onPlayer ? '#e23b3b' : '#e07a32';
}


/** Weapon pose for the committed swing. Canceled attacks leave this at none. */
function attackPose(unit: Unit): AttackPose {
  if (unit.attackCycle.phase === AttackPhase.Windup) return 'raise';
  if (unit.attackCycle.phase !== AttackPhase.Backswing) return 'none';
  return unit.swing > 0.82 ? 'swing' : 'follow';
}

/** Layered barbarian. Feet sit on (x, y). Body height is the constant scale. */
function drawBarbarian(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  swing: number,
  lean: number,
  screen: number,
  tier: ArmorTier,
  bob: number,
  attack: AttackPose = 'none',
  ally = true,
): void {
  paintBarbarian(ctx, x, y, height, swing, lean, screen, tier, bob, attack, ally);
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  look: TokenLook,
  swing: number,
  ally: boolean,
  attack: AttackPose = 'none',
): void {
  paintCreature(ctx, look.mark, x, y, height, swing, ally, attack);
}

interface BossLook {
  mark: BossMark;
  height: number;
}

function bossLook(unit: Unit): BossLook | null {
  if (unit.objective === 'baron') return { mark: 'diablo', height: 188 };
  if (unit.objective === 'herald') return { mark: 'mephisto', height: 180 };
  if (unit.objective === 'dragon') return { mark: 'duriel', height: 176 };
  if (unit.defId === 'blood-raven') return { mark: 'raven', height: 172 };
  return null;
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  look: BossLook,
  swing: number,
  ally: boolean,
  attack: AttackPose = 'none',
  time = 0,
): void {
  paintBoss(ctx, x, y, height, look.mark, swing, ally, attack, time);
}

function bleedsIchor(unit: Unit): boolean {
  if (bossLook(unit)?.mark === 'mephisto') return true;
  if (unit.defId === 'demon') return true;
  return unit.defId === 'skeleton' && unit.team !== 'ally';
}

function tokenLook(unit: Unit): TokenLook {
  const ally = unit.team === 'ally';
  if (unit.defId === 'rogue' || unit.defId === 'rogue-archer') return { mark: 'rogue', scale: 1 };
  // Item 6 wave mobs use the existing procedural marks until the sprite sheets are wired in.
  if (unit.defId === 'valkyrie') return { mark: 'valkyrie', scale: 1.08 };
  if (unit.defId === 'act2-mercenary' || unit.defId === 'act3-mercenary') return { mark: 'guard', scale: 1.05 };
  if (ally && (unit.defId === 'skeleton' || unit.defId === 'hungry-dead')) return { mark: 'valkyrie', scale: 1.08 };
  if (ally && (unit.defId === 'goatman' || unit.defId === 'demon' || unit.defId === 'mummy')) return { mark: 'guard', scale: 1.05 };
  switch (unit.defId) {
    case 'fallen':
      return { mark: 'fallen', scale: 0.92 };
    case 'zombie':
      return { mark: 'raider', scale: 1 };
    case 'quillrat':
      return { mark: 'quill', scale: 0.9 };
    case 'goatman':
      return { mark: 'goatman', scale: 1.08 };
    case 'demon':
      return { mark: 'bovine', scale: 1.22 };
    case 'willowisp':
      return { mark: 'wisp', scale: 0.85 };
    case 'mummy':
      return { mark: 'mummy', scale: 1.05 };
    case 'skeleton':
      return { mark: 'destruction', scale: 1.28 };
    case 'hungry-dead':
      return { mark: 'blunder', scale: 1.2 };
    default:
      return { mark: 'raider', scale: 1 };
  }
}

/** Isometric spire. The foot is the bottom center of the masonry. */
function drawSpire(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  paintSpire(ctx, x, y, height, ally, alive);
}

function drawStronghold(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, ally: boolean, alive: boolean): void {
  paintStronghold(ctx, x, y, height, ally, alive);
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  form: ReturnType<typeof propForm>,
  variant: number,
  hell = false,
): void {
  drawPropArt(ctx, x, y, height, form, variant, hell);
}
