/**
 * 2:1 isometric projection. The match stays in cartesian coordinates;
 * only the camera and the stick use this.
 */

export function projectIso(
  x: number,
  y: number,
  hw: number,
  ox: number,
  oy: number,
): { x: number; y: number } {
  return { x: (x - y) * hw + ox, y: (x + y) * hw * 0.5 + oy };
}

export function unprojectIso(
  sx: number,
  sy: number,
  hw: number,
  ox: number,
  oy: number,
): { x: number; y: number } {
  const px = (sx - ox) / hw;
  const py = (sy - oy) / (hw * 0.5);
  return { x: (px + py) / 2, y: (py - px) / 2 };
}

/** Screen delta (x right, y down) into world movement on a 2:1 ground plane. */
export function screenVectorToWorld(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx + sy * 2) / 2, y: (sy * 2 - sx) / 2 };
}
