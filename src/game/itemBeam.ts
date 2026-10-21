/**
 * Ground-drop presentation. The match does not spawn ground drops; this only
 * draws them when a caller supplies some.
 */

export type DropTier = 'base' | 'magic' | 'rare' | 'unique' | 'set';

export interface GroundDrop {
  x: number;
  y: number;
  name: string;
  tier: DropTier;
}

/** Explicit channels. Beam alphas are written as rgba literals, not string replaces. */
export const TIER_COLOR: Record<DropTier, { fill: string; beam: string }> = {
  base: { fill: 'rgb(244, 244, 244)', beam: '244, 244, 244' },
  magic: { fill: 'rgb(112, 112, 255)', beam: '112, 112, 255' },
  rare: { fill: 'rgb(255, 236, 96)', beam: '255, 236, 96' },
  unique: { fill: 'rgb(207, 176, 96)', beam: '207, 176, 96' },
  set: { fill: 'rgb(88, 196, 96)', beam: '88, 196, 96' },
};

export const ITEM_LABEL_CLASS = 'd2-item-label';

const BEAM_TIERS = new Set<DropTier>(['rare', 'unique', 'set']);

export function drawItemNameplate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  tier: DropTier,
): void {
  ctx.save();
  ctx.font = '700 12px "Cinzel Decorative", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(name).width + 10;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(x - width / 2, y - 8, width, 16);
  ctx.fillStyle = TIER_COLOR[tier].fill;
  ctx.fillText(name, x, y);
  ctx.restore();
}

export function drawItemBeam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tier: DropTier,
  time: number,
): void {
  if (!BEAM_TIERS.has(tier)) return;
  const pulse = 0.6 + 0.4 * Math.sin(time * 3.4);
  const rgb = TIER_COLOR[tier].beam;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createLinearGradient(x, y - 92, x, y);
  beam.addColorStop(0, `rgba(${rgb}, 0)`);
  beam.addColorStop(0.5, `rgba(${rgb}, ${0.26 * pulse})`);
  beam.addColorStop(1, `rgba(${rgb}, ${0.06 * pulse})`);
  ctx.fillStyle = beam;
  ctx.fillRect(x - 8, y - 92, 16, 92);
  ctx.restore();
}
