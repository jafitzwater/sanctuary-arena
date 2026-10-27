/**
 * Batch 3 item 7: D2-look stone floor for both base yards, and the red/blue team glow.
 * Art: rubberduck "Isometric ground tiles", stone_path_128x64.png, CC0 1.0
 * (https://opengameart.org/content/isometric-ground-tiles; license recorded in manifest.md).
 * Sheet: 128x64 diamonds, 8 per row; rows 0-1 are 16 full plain variants (transitions after are not used).
 * Excluded: any other environment art (towers, Worldstone, caves, grass, orbs) - other items.
 */
const TILE_W = 128;
const TILE_H = 64;
const FULL_VARIANTS = 16;
const PER_ROW = 8;

let image: HTMLImageElement | null = null;

export function baseFloorReady(): boolean {
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}env/stone_path_128x64.png`;
  }
  return image.complete && image.naturalWidth > 0;
}

/** Calls back once when the floor art arrives, so the baked map can be redrawn. */
export function onBaseFloor(done: () => void): void {
  if (baseFloorReady() || !image) return;
  image.addEventListener('load', done, { once: true });
}

/** One full diamond, fitted to the bake's 160x80 cell and darkened for the night palette. */
export function paintBaseFloor(ctx: CanvasRenderingContext2D, sx: number, sy: number, variant: number): boolean {
  if (!baseFloorReady() || !image) return false;
  const v = ((Math.floor(variant) % FULL_VARIANTS) + FULL_VARIANTS) % FULL_VARIANTS;
  const col = v % PER_ROW;
  const row = Math.floor(v / PER_ROW);
  ctx.drawImage(image, col * TILE_W, row * TILE_H, TILE_W, TILE_H, sx - 81, sy - 41, 162, 82);
  ctx.fillStyle = 'rgba(12, 10, 8, 0.38)';
  ctx.fillRect(sx - 81, sy - 41, 162, 82);
  return true;
}

/**
 * Doc: "Red is one side's primary glow. Blue is the other."
 * [TEMP] Which side is which is not set in the doc: the player's side is blue here (NEEDS JOSEPH).
 */
export const TEAM_GLOW = { ally: 'rgb(70, 120, 255)', enemy: 'rgb(230, 40, 32)' } as const;

export function paintTeamGlow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / Math.max(1, rx));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ', 0.30)'));
  g.addColorStop(0.7, color.replace('rgb(', 'rgba(').replace(')', ', 0.12)'));
  g.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ', 0)'));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
