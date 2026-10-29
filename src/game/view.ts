/**
 * WORK ORDER "Code engineer - WILD RIFT VIEW + MINIMAP" (Oct 28, Joseph approved) [JOSEPH].
 * Order: "Camera: fixed angled top-down, locked/semi-locked to the player's champion ... Player's base appears
 * toward the BOTTOM-LEFT of the view, enemy base toward the TOP-RIGHT (apply a 180-degree view rotation for the
 * opposing side if needed so both teams see the same angle)." "Character size: small relative to the view."
 * "Minimap: touch-friendly bottom corner/side placement, size adjustable." "Icon sizes (minimap): Nexus largest;
 * base guard towers slightly larger than lane towers; lane towers small standard icons; walls thin lines only."
 *
 * Implements (pure, Phaser/DOM-free so test/wild-rift-view.ts can run it): the view quarter-turn per team,
 * world <-> view-space rotation, facing rotation, camera / character-scale / minimap / icon constants,
 * world -> minimap transform, viewport footprint on the minimap, minimap size clamp.
 * Tech design: the match stays in cartesian world coordinates; only drawing and the stick read the view.
 * Excluded: any change to the physical map, speeds, damage, timers, abilities, progression or controls.
 * Exact values are mirrored in /workspace/sanctuary-canon/wild-rift-view-spec.md.
 */

export type ViewTurns = 0 | 1 | 2 | 3;

/**
 * Quarter turns (clockwise on screen) applied to the world before the 2:1 iso projection.
 * Repo map: Blue Worldstone (ally) at (520, 2100), Red Worldstone (enemy) at (3880, 700).
 * Unrotated iso puts the enemy base below-right of the ally base; 1 quarter turn puts the ally base
 * bottom-left and the enemy base top-right. The enemy side gets 1 + 2 (the order's 180-degree rotation).
 */
export function viewTurnsFor(team: 'ally' | 'enemy' | 'wild' | undefined): ViewTurns {
  return team === 'enemy' ? 3 : 1;
}

/** Live view turn, written by the renderer and read by the stick so "up" on screen stays "up". */
export const activeView: { turns: ViewTurns } = { turns: 1 };

/** World point into view space. Output stays inside [0, W or H] so the baked map canvas keeps its size. */
export function toView(x: number, y: number, turns: ViewTurns, w: number, h: number): { x: number; y: number } {
  switch (turns) {
    case 1:
      return { x: y, y: w - x };
    case 2:
      return { x: w - x, y: h - y };
    case 3:
      return { x: h - y, y: x };
    default:
      return { x, y };
  }
}

export function fromView(x: number, y: number, turns: ViewTurns, w: number, h: number): { x: number; y: number } {
  switch (turns) {
    case 1:
      return { x: w - y, y: x };
    case 2:
      return { x: w - x, y: h - y };
    case 3:
      return { x: y, y: h - x };
    default:
      return { x, y };
  }
}

/** World facing (radians) into view-space facing, used only to pick the sheet row. */
export function facingToView(angle: number, turns: ViewTurns): number {
  return angle - (turns * Math.PI) / 2;
}

/** View-space direction back to a world direction (stick input). */
export function directionFromView(x: number, y: number, turns: ViewTurns): { x: number; y: number } {
  const a = (turns * Math.PI) / 2;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Bake-canvas x origin: the iso x range of view space is [-(view height), view width] * hw. */
export function viewOriginX(turns: ViewTurns, w: number, h: number, hw: number, pad: number): number {
  return (turns % 2 === 1 ? w : h) * hw + pad;
}

// ---- Camera ----------------------------------------------------------------------------------------------
export const CAMERA = {
  /** [TEMP] World units visible across the screen width (was 1040). Zoom = cssW / worldAcross px per unit. */
  worldAcross: 1400,
  /** Champion sits at this fraction of the screen height (unchanged, 0.56 = slightly below center). */
  focusY: 0.56,
  /** Semi-lock follow rate (1/s, exponential), unchanged from the existing camera. */
  followRate: 6,
} as const;

export function cameraZoom(cssW: number): number {
  return cssW / CAMERA.worldAcross;
}

// ---- Character scale -------------------------------------------------------------------------------------
export const CHARACTER = {
  /** Unscaled hero body height in the art (figures.ts HERO_DRAW_HEIGHT). */
  baseHeight: 108,
  /** [TEMP] Hero drawn height = 11% of the screen height (was ~20% at 844x390). */
  viewFraction: 0.11,
  /** [TEMP] Readability floor and ceiling for the hero height, css px. */
  minPx: 38,
  maxPx: 96,
} as const;

/** Multiplier applied to every unit's body height (minions, towers, bosses use the same factor). */
export function characterScale(cssH: number): number {
  const px = Math.max(CHARACTER.minPx, Math.min(CHARACTER.maxPx, cssH * CHARACTER.viewFraction));
  return px / CHARACTER.baseHeight;
}

// ---- Minimap ---------------------------------------------------------------------------------------------
/**
 * Wild Rift pass 2 item 5 [JOSEPH]: "Minimap: raise it so it is fully visible above the stick area; adjustable
 * size with a phone-readable default." Pass 3 order item 1 [JOSEPH]: "minimap top-left; game stats/timer
 * centered in the top bar; gold counter directly under the minimap." Values [TEMP]; style.css
 * body.touch #minimap-toggle / #gold-badge mirror touchTop, touchLeft, goldGap and belowCard
 * (test/wild-rift-pass2.ts checks the css matches).
 */
export const MINIMAP = {
  /** [TEMP] Width in css px; height follows the map aspect (square since the map 12k order, was 11:7). Was 150. */
  defaultW: 180,
  minW: 120,
  maxW: 240,
  /** New key so the old 150 px saved width does not hide the new default. */
  storageKey: 'sa.minimapW2',
  /** Touch: card top edge below the screen top (pass 3: top-left corner, over the top bar's left end). */
  touchTop: 4,
  touchLeft: 8,
  /** Touch: gap from the card's bottom edge to the gold counter under it. */
  goldGap: 6,
  /** Touch: gold counter height (style.css body.touch #gold-badge, about 23 px). */
  goldH: 24,
  /** The resting stick's top edge above the screen bottom (style.css body.touch #stick: bottom 16px, height 90px). */
  stickTop: 106,
  /** Clear gap kept between the gold counter and the resting stick. */
  stickGap: 16,
  /** Css px the card keeps free under itself: gold gap + gold + stick gap + stick (6 + 24 + 16 + 106). */
  belowCard: 152,
} as const;

/**
 * Touch box for a wanted width on a viewport of height viewH: top-left card, gold counter right under it, and the
 * whole stack above the resting stick. A short screen shrinks the width so nothing overlaps.
 */
export function minimapTouchBox(viewH: number, wantW: number, mapW: number, mapH: number, safeTop = 0, safeBottom = 0) {
  const top = MINIMAP.touchTop + safeTop;
  const room = viewH - top - safeBottom - MINIMAP.belowCard;
  const fitW = Math.floor((room * mapW) / mapH);
  const w = Math.min(clampMinimapW(wantW), fitW);
  const h = minimapH(w, mapW, mapH);
  const goldTop = top + h + MINIMAP.goldGap;
  return { left: MINIMAP.touchLeft, top, w, h, bottom: top + h, goldTop, goldBottom: goldTop + MINIMAP.goldH };
}

export function clampMinimapW(w: number): number {
  if (!Number.isFinite(w)) return MINIMAP.defaultW;
  return Math.round(Math.max(MINIMAP.minW, Math.min(MINIMAP.maxW, w)));
}

export function minimapH(w: number, mapW: number, mapH: number): number {
  return Math.round((w * mapH) / mapW);
}

/** Icon sizes in css px (multiplied by the minimap backing dpr). Order: nexus > guard > lane. */
export const ICONS = {
  /** Worldstone = Nexus/main base. Diamond, full width. */
  nexus: 13,
  /** Base guard tower = the inner (tier 1) tower on each roadway, nearest its Worldstone. */
  guardTower: 8,
  /** Lane tower = the outer (tier 2) tower on each roadway. */
  laneTower: 6,
  /** Alive champion portrait, circle diameter. */
  champion: 13,
  /** Cave boss (major objective). */
  caveBoss: 7,
  /** Jungle camp (den without cave). None exist on the current map. */
  jungleCamp: 5,
  /** Minion dot. */
  minion: 2.5,
  /** Seal (unchanged small square). */
  seal: 3,
  /** Base wall line width. */
  wallLine: 1,
  /** Camera viewport outline width. */
  viewportLine: 1,
} as const;

/** World point onto the minimap. The enemy side sees the map turned 180 degrees, like the main view. */
export function worldToMinimap(
  x: number, y: number, mapW: number, mapH: number, w: number, h: number, team: 'ally' | 'enemy' | 'wild' | undefined,
): { x: number; y: number } {
  const fx = team === 'enemy' ? mapW - x : x;
  const fy = team === 'enemy' ? mapH - y : y;
  return { x: (fx / mapW) * w, y: (fy / mapH) * h };
}

/** The four screen corners, unprojected to the world, give the camera footprint (TL, TR, BR, BL). */
export function viewportFootprint(screenToWorld: (sx: number, sy: number) => { x: number; y: number }, cssW: number, cssH: number) {
  return [screenToWorld(0, 0), screenToWorld(cssW, 0), screenToWorld(cssW, cssH), screenToWorld(0, cssH)];
}

/** Repo mapping: inner (tier 1, nearest the Worldstone) = base guard tower; outer (tier 2) = lane tower. */
export function towerIconSize(role: 'inner' | 'outer' | undefined): number {
  return role === 'inner' ? ICONS.guardTower : ICONS.laneTower;
}
