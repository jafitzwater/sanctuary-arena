export interface Vec {
  x: number;
  y: number;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Rng {
  constructor(public state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/** Closest point on segment AB to P. */
export function projectPoint(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.0001) return { x: a.x, y: a.y };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function nearestOnPolyline(
  p: Vec,
  pts: Vec[],
): { point: Vec; seg: number; dist: number } {
  let best = { point: { x: pts[0].x, y: pts[0].y }, seg: 0, dist: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const q = projectPoint(p, pts[i], pts[i + 1]);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.dist) best = { point: q, seg: i, dist: d };
  }
  return best;
}

export function distToPolyline(p: Vec, pts: Vec[]): number {
  return nearestOnPolyline(p, pts).dist;
}
