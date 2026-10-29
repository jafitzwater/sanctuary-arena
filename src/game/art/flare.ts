import manifest from './flare-manifest.json';
import { blitOutlinedCell } from './outline';
import { CHARACTER_CONTRAST, CHARACTER_OUTLINE_PX } from '../readability';

export type FlareAnim = 'idle' | 'walk' | 'run' | 'attack' | 'die';

interface AnimSheet {
  file: string;
  cols: number;
  rows: number;
  fw: number;
  fh: number;
  footX: number;
  footY: number;
}

interface CreatureSheet {
  body: number;
  anims: Partial<Record<FlareAnim, AnimSheet>>;
}

const creatures = manifest.creatures as Record<string, CreatureSheet>;
const aliases = manifest.aliases as Record<string, string>;
const images = new Map<string, HTMLImageElement>();

function creatureFor(defId: string): CreatureSheet | null {
  const key = creatures[defId] ? defId : aliases[defId];
  return key ? (creatures[key] ?? null) : null;
}

/** One decoded image per atlas. The frame loop only blits it. */
function imageOf(file: string): HTMLImageElement | null {
  let image = images.get(file);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}flare/${file}`;
    images.set(file, image);
  }
  return image;
}

export function flareFrameCount(defId: string, anim: FlareAnim): number {
  return creatureFor(defId)?.anims[anim]?.cols ?? 0;
}

export function flareReady(defId: string, anim: FlareAnim): boolean {
  const meta = creatureFor(defId)?.anims[anim];
  if (!meta) return false;
  const image = imageOf(meta.file);
  return !!image && image.complete && image.naturalWidth > 0;
}

/** Feet at (x, y). Height is the same body size the procedural figure uses. */
export function drawFlare(
  ctx: CanvasRenderingContext2D,
  defId: string,
  anim: FlareAnim,
  compass: number,
  frame: number,
  x: number,
  y: number,
  height: number,
): boolean {
  const spec = creatureFor(defId);
  const meta = spec?.anims[anim];
  if (!spec || !meta) return false;
  const image = imageOf(meta.file);
  if (!image || !image.complete || image.naturalWidth === 0) return false;
  const col = ((frame % meta.cols) + meta.cols) % meta.cols;
  const row = ((compass % meta.rows) + meta.rows) % meta.rows;
  const scale = height / Math.max(1, spec.body);
  // Visual readability item 5 [JOSEPH t253u]: 2 px dark outline + local contrast (draw only).
  blitOutlinedCell(
    ctx,
    image,
    meta.fh,
    CHARACTER_CONTRAST,
    CHARACTER_OUTLINE_PX,
    col * meta.fw,
    row * meta.fh,
    meta.fw,
    meta.fh,
    x - meta.footX * scale,
    y - meta.footY * scale,
    meta.fw * scale,
    meta.fh * scale,
  );
  return true;
}
