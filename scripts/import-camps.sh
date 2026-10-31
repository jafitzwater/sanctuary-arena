#!/usr/bin/env bash
# t337u 3D camps: copy the newest camp renders (SRC/camp-3d-v<N>-<camp>.png, transparent, bake scale) into the game
# as public/camps/camp-3d-<camp>.webp (lossy WebP, alpha kept). A later version (v2, v3...) with the same size and
# anchor drops in by re-running this script; nothing in code changes.
#   scripts/import-camps.sh [SRC=/workspace/audit] [--footmaps [RIG_DIR]]
# --footmaps also rebuilds public/camps/camp-3d-<camp>-foot.png (y-sort map, see scripts/camp-footmap.py) with
# Blender ($BLENDER or blender on PATH) from the camp scene scripts in RIG_DIR (default SRC/b3d/scripts). Only
# needed when the camp geometry moved; a polish pass that keeps the layout keeps the old foot maps.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=/workspace/audit; FOOT=0; RIG=''
while [ $# -gt 0 ]; do
  case "$1" in
    --footmaps) FOOT=1; if [ $# -gt 1 ] && [ "${2#--}" = "$2" ]; then RIG="$2"; shift; fi ;;
    *) SRC="$1" ;;
  esac
  shift
done
RIG="${RIG:-$SRC/b3d/scripts}"
mkdir -p public/camps
python3 - "$SRC" "$FOOT" "$RIG" "${BLENDER:-blender}" <<'PY'
import glob, os, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image
src, foot, rig, blender = sys.argv[1], sys.argv[2] == '1', sys.argv[3], sys.argv[4]
# Expected size and anchor (den centre, image px) per camp: must match CAMP_ART in src/game/art/campArt.ts.
CAMPS = {'jungle': (977, 510, 484, 317, 1000), 'plains': (593, 316, 328, 165, 800),
         'desert': (577, 328, 269, 214, 800), 'forge': (725, 407, 359, 229, 800)}
total = 0
for camp, (w, h, ax, ay, raw_w) in CAMPS.items():
    found = sorted(glob.glob(f'{src}/camp-3d-v*-{camp}.png'), key=lambda p: int(re.search(r'-v(\d+)-', p).group(1)))
    if not found:
        sys.exit(f'no {src}/camp-3d-v*-{camp}.png')
    im = Image.open(found[-1]).convert('RGBA')
    if im.size != (w, h):
        sys.exit(f'{found[-1]} is {im.size[0]}x{im.size[1]}, expected {w}x{h} (same size and anchor as v1)')
    out = f'public/camps/camp-3d-{camp}.webp'
    im.save(out, 'WEBP', quality=88, alpha_quality=100, method=6)
    total += os.path.getsize(out)
    print(f'{os.path.basename(found[-1])} -> {out} {w}x{h} {os.path.getsize(out)} B')
    if foot:
        with tempfile.TemporaryDirectory() as tmp:
            npy = f'{tmp}/{camp}.npy'
            subprocess.run([blender, '-b', '-P', 'scripts/camp-footmap.py', '--', camp, npy, rig], check=True,
                           env={**os.environ, 'CAMP_W': str(raw_w)}, stdout=subprocess.DEVNULL)
            off = np.load(npy)
        x0, y0 = raw_w // 2 - ax, 370 - ay          # raw render: den centre at (raw_w / 2, 370)
        off = off[y0:y0 + h, x0:x0 + w]
        # 0 = ground; v >= 1: the object surface's foot lies (v - 1) * 2 px below this pixel.
        enc = np.where(off > 0, np.minimum(255, 1 + np.round(off / 2)), 0).astype(np.uint8)
        Image.fromarray(enc, 'L').save(f'public/camps/camp-3d-{camp}-foot.png', optimize=True)
        print(f'  foot map public/camps/camp-3d-{camp}-foot.png')
print(f'total {total} B')
PY
