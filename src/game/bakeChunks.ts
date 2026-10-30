/**
 * ORDER "Map size and Diablo 2 theme from reference" performance note [JOSEPH]: "No single giant texture - chunk
 * or low-res procedural terrain; respect ~4096 WebGL texture limit per canvas." The 12,000 x 12,000 map would bake
 * to one ~20,500 x 10,300 px canvas, so the bake is split into CHUNK x CHUNK canvases, painted lazily when the
 * camera first needs them and kept in a small LRU cache. Paint-only: nothing here touches the simulation.
 */
export const BAKE_CHUNK = 512;
/** [TEMP] Chunks kept alive (512 x 512 x 4 B = 1 MB each). The 844 x 390 view needs about 12. */
export const BAKE_CHUNK_CAP = 40;

export interface BakeChunk {
  cx: number;
  cy: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  used: number;
  /** Paint generation the chunk was baked with (see ChunkedBake.invalidate). */
  gen: number;
}

/**
 * Paints one chunk. `full` is false once this draw() has spent its bake budget: the painter may then paint a
 * cheap provisional version and return false, and the chunk is upgraded on a later draw (no single-frame stall).
 */
export type ChunkPainter = (ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, full: boolean) => boolean | void;

/** Chunk cells overlapped by a bake-space rect. */
export function chunkRange(x: number, y: number, w: number, h: number, total: { w: number; h: number }, size = BAKE_CHUNK) {
  const cols = Math.ceil(total.w / size);
  const rows = Math.ceil(total.h / size);
  return {
    c0: Math.max(0, Math.floor(x / size)),
    r0: Math.max(0, Math.floor(y / size)),
    c1: Math.min(cols - 1, Math.floor((x + w - 1) / size)),
    r1: Math.min(rows - 1, Math.floor((y + h - 1) / size)),
  };
}

export class ChunkedBake {
  private readonly chunks = new Map<string, BakeChunk>();
  private tick = 0;
  baked = 0;
  draws = 0;
  lastView: number[] = [];
  /** t330u: bumped when new floor art arrives; stale chunks keep drawing and repaint a few per draw. */
  private gen = 0;
  private refreshLeft = 0;
  /** [TEMP] Stale chunks repainted per draw() call, so a re-bake never stalls one frame. */
  refreshPerDraw = 1;
  /** [TEMP] Bake time per draw() (ms) after which new chunks get the painter's cheap provisional paint. */
  budgetMs = 8;
  refreshed = 0;
  provisional = 0;
  private drawStart = -Infinity;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly paint: ChunkPainter,
    readonly size = BAKE_CHUNK,
    private readonly cap = BAKE_CHUNK_CAP,
  ) {}

  get count(): number {
    return this.chunks.size;
  }

  /** Every live chunk (blood decals stamp into the cached ones). */
  live(): Iterable<BakeChunk> {
    return this.chunks.values();
  }

  get(cx: number, cy: number): BakeChunk | null {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (chunk && chunk.gen !== this.gen && this.refreshLeft > 0 && this.underBudget()) {
      // Progressive re-bake: repaint this stale chunk in place (the old paint stays until then).
      this.refreshLeft -= 1;
      const x0 = cx * this.size;
      const y0 = cy * this.size;
      chunk.ctx.clearRect(0, 0, this.size, this.size);
      chunk.ctx.save();
      chunk.ctx.translate(-x0, -y0);
      const done = this.paint(chunk.ctx, x0, y0, this.size, this.size, true);
      chunk.ctx.restore();
      chunk.gen = done === false ? -1 : this.gen;
      this.refreshed += 1;
    }
    if (!chunk) {
      const canvas = document.createElement('canvas');
      canvas.width = this.size;
      canvas.height = this.size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      const x0 = cx * this.size;
      const y0 = cy * this.size;
      ctx.save();
      ctx.translate(-x0, -y0);
      const done = this.paint(ctx, x0, y0, this.size, this.size, this.underBudget());
      ctx.restore();
      if (done === false) this.provisional += 1;
      chunk = { cx, cy, canvas, ctx, used: ++this.tick, gen: done === false ? -1 : this.gen };
      this.chunks.set(key, chunk);
      this.baked += 1;
      this.evict();
    }
    chunk.used = ++this.tick;
    return chunk;
  }

  private underBudget(): boolean {
    return performance.now() - this.drawStart < this.budgetMs;
  }

  /** Marks every chunk stale: each keeps drawing its old paint until draw() repaints it (refreshPerDraw per call). */
  invalidate(): void {
    this.gen += 1;
  }

  /** Chunks in the last drawn view still showing an older or provisional paint (off-view ones upgrade when seen). */
  get stale(): number {
    const [x, y, w, h] = this.lastView;
    if (w === undefined) return 0;
    const r = chunkRange(x, y, w, h, { w: this.width, h: this.height }, this.size);
    let n = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.gen === this.gen) continue;
      if (chunk.cx >= r.c0 && chunk.cx <= r.c1 && chunk.cy >= r.r0 && chunk.cy <= r.r1) n += 1;
    }
    return n;
  }

  has(cx: number, cy: number): boolean {
    return this.chunks.has(`${cx},${cy}`);
  }

  private evict(): void {
    while (this.chunks.size > this.cap) {
      let oldKey = '';
      let oldUsed = Infinity;
      for (const [key, chunk] of this.chunks) {
        if (chunk.used < oldUsed) {
          oldUsed = chunk.used;
          oldKey = key;
        }
      }
      this.chunks.delete(oldKey);
    }
  }

  /**
   * Blit the bake-space rect (srcX, srcY, srcW, srcH) to (0, 0, dstW, dstH). Missing chunks in view bake now;
   * at most `prebake` neighbours just outside the view bake per call so panning does not hitch.
   */
  draw(target: CanvasRenderingContext2D, srcX: number, srcY: number, srcW: number, srcH: number, dstW: number, dstH: number, prebake = 1): void {
    this.lastView = [srcX, srcY, srcW, srcH];
    this.draws += 1;
    this.refreshLeft = this.refreshPerDraw;
    this.drawStart = performance.now();
    const k = dstW / srcW;
    const ky = dstH / srcH;
    const r = chunkRange(srcX, srcY, srcW, srcH, { w: this.width, h: this.height }, this.size);
    for (let cy = r.r0; cy <= r.r1; cy++) {
      for (let cx = r.c0; cx <= r.c1; cx++) {
        const chunk = this.get(cx, cy);
        if (!chunk) continue;
        const bx = cx * this.size;
        const by = cy * this.size;
        const dx0 = Math.floor((bx - srcX) * k);
        const dy0 = Math.floor((by - srcY) * ky);
        const dx1 = Math.floor((bx + this.size - srcX) * k);
        const dy1 = Math.floor((by + this.size - srcY) * ky);
        target.drawImage(chunk.canvas, 0, 0, this.size, this.size, dx0, dy0, dx1 - dx0, dy1 - dy0);
      }
    }
    let left = prebake;
    if (left <= 0 || !this.underBudget()) return;
    const ring = chunkRange(srcX - this.size, srcY - this.size, srcW + this.size * 2, srcH + this.size * 2, { w: this.width, h: this.height }, this.size);
    for (let cy = ring.r0; cy <= ring.r1 && left > 0; cy++) {
      for (let cx = ring.c0; cx <= ring.c1 && left > 0; cx++) {
        if (this.has(cx, cy)) continue;
        if (!this.underBudget()) return;
        this.get(cx, cy);
        left -= 1;
      }
    }
  }

  /** One baked pixel (debug sampling), or null off the bake. */
  sample(x: number, y: number): [number, number, number, number] | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const chunk = this.get(Math.floor(x / this.size), Math.floor(y / this.size));
    if (!chunk) return null;
    const px = chunk.ctx.getImageData(x - chunk.cx * this.size, y - chunk.cy * this.size, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
  }
}
