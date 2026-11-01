#!/usr/bin/env python3
"""
t345u "Put Rakanishu in the game": trims the Sprite Director's 66-column Rakanishu sheet (8448x1024, 33.0 MiB
decoded) into a packed WebP atlas of only the frames the game draws, each cropped to its opaque pixels.
Pixels are copied 1:1 (no scaling, no recolour), so the look is unchanged.

Input : /workspace/audit/rakanishu-3d-v1-sheet.png (128x128 cells, rows n ne e se s sw w nw, feet on row 127)
        /workspace/audit/rakanishu-3d-v1-spark-sheet.png (768x96, 8 frames)
Output: public/sprites/bosses/rakanishu-atlas.webp, src/game/art/rakanishu-atlas.json,
        public/sprites/bosses/rakanishu-spark.png (copied as is)
Columns kept (62-col hero layout + hit 62-65): 0 idle, 13-17 death5, 26-37 walk12, 50-61 attack12, 62-65 hit4.
Dropped: 1-12 and 18-25 (walk8/attack4/run8 are copies of walk12/attack12 frames), 38-49 (run12 = walk12 copies).
"""
import json, shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/audit/rakanishu-3d-v1-sheet.png')
SPARK = Path('/workspace/audit/rakanishu-3d-v1-spark-sheet.png')
ROOT = Path(__file__).resolve().parent.parent
CELL, ROWS = 128, 8
COLS = [0] + list(range(13, 18)) + list(range(26, 38)) + list(range(50, 62)) + list(range(62, 66))
GUTTER = 4          # transparent px between frames, so the runtime outline never bleeds into a neighbour
ATLAS_W = 1024

sheet = np.array(Image.open(SRC).convert('RGBA'))
assert sheet.shape == (ROWS * CELL, 66 * CELL, 4), sheet.shape

# Mean luma of the opaque pixels of the full sheet: the runtime contrast pivot, so the look matches a full-sheet blit.
a = sheet[..., 3] > 16
rgb = sheet[..., :3].astype(np.float64)
pivot = float((rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114)[a].mean())

frames = []
for r in range(ROWS):
    for c in COLS:
        cell = sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
        ys, xs = np.nonzero(cell[..., 3])
        assert len(xs), (r, c)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        frames.append({'row': r, 'col': c, 'ox': x0, 'oy': y0, 'w': x1 - x0, 'h': y1 - y0, 'px': cell[y0:y1, x0:x1]})

# Shelf pack, tallest first.
order = sorted(range(len(frames)), key=lambda i: (-frames[i]['h'], -frames[i]['w']))
x = y = GUTTER
shelf = 0
for i in order:
    f = frames[i]
    if x + f['w'] + GUTTER > ATLAS_W:
        x = GUTTER
        y += shelf + GUTTER
        shelf = 0
    f['x'], f['y'] = x, y
    x += f['w'] + GUTTER
    shelf = max(shelf, f['h'])
H = y + shelf + GUTTER
H = (H + 3) // 4 * 4
atlas = np.zeros((H, ATLAS_W, 4), np.uint8)
for f in frames:
    atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']] = f['px']

out_dir = ROOT / 'public/sprites/bosses'
out_dir.mkdir(parents=True, exist_ok=True)
Image.fromarray(atlas, 'RGBA').save(out_dir / 'rakanishu-atlas.webp', 'WEBP', lossless=True, quality=100, method=6, exact=True)
shutil.copyfile(SPARK, out_dir / 'rakanishu-spark.png')

# Round trip: every kept cell is byte-identical after the WebP decode.
back = np.array(Image.open(out_dir / 'rakanishu-atlas.webp').convert('RGBA'))
for f in frames:
    got = back[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']]
    assert (got == f['px']).all(), (f['row'], f['col'])

meta = {
    'source': 'rakanishu-3d-v1-sheet.png (Sprite Director, 2026-10-31)',
    'cell': CELL, 'footX': 64, 'footY': 128, 'w': ATLAS_W, 'h': H, 'pivot': round(pivot, 3),
    'cols': COLS,
    # Per frame: [row, srcCol, atlasX, atlasY, w, h, offsetX in cell, offsetY in cell]
    'frames': [[f['row'], f['col'], f['x'], f['y'], f['w'], f['h'], f['ox'], f['oy']] for f in frames],
}
(ROOT / 'src/game/art/rakanishu-atlas.json').write_text(json.dumps(meta, separators=(',', ':')) + '\n')
mib = ATLAS_W * H * 4 / 2 ** 20
print(f'atlas {ATLAS_W}x{H} = {mib:.2f} MiB decoded (sheet {66 * CELL}x{ROWS * CELL} = {66 * CELL * ROWS * CELL * 4 / 2 ** 20:.2f} MiB), '
      f'{len(frames)} frames, webp {(out_dir / "rakanishu-atlas.webp").stat().st_size} B, pivot {pivot:.2f}')
