# t337u 3D camps: per-pixel "foot map" of a camp render, so the game can y-sort the flat camp image against units.
# For every pixel covered by a camp object (stone, pillar, tree, statue...) it stores how far below that pixel, in
# bake px, the ground point under the object surface lies; ground pixels (clearing, shadows, mist) store 0.
# It rebuilds the camp scene from the Sprite Director's rig (camp_render.py + camp_<camp>.py, seeded, so the
# layout matches the colour render) with the clearing, shadow catcher and volumes hidden, renders the Cycles
# Position pass at 1 spp and projects (X, Y, 0) through the same ortho camera.
# Usage: blender -b -P scripts/camp-footmap.py -- CAMP OUT.npy [RIG_DIR]
import sys, os
args = sys.argv[sys.argv.index('--') + 1:]
CAMP, FOOT_OUT = args[0], args[1]
RIG = args[2] if len(args) > 2 else '/workspace/audit/b3d/scripts'
src = open(os.path.join(RIG, 'camp_render.py')).read()
tail = src.index('catcher()\nsc.render.filepath')
sys.argv = [sys.argv[0], '--', CAMP, '/tmp/unused.png', '1']
exec(src[:tail].replace('/workspace/audit/b3d/scripts', RIG))
import numpy as np
for o in sc.objects:
    vol = any(s.material and s.material.node_tree and any(n.type == 'OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked
              for n in s.material.node_tree.nodes) for s in o.material_slots)
    if o.name.startswith('clearing') or o.name.startswith('catcher') or vol:
        o.hide_render = True
sc.cycles.samples = 1
sc.render.filter_size = 0.01
vl = sc.view_layers[0]
vl.use_pass_position = True
vl.pass_alpha_threshold = 0.5
sc.use_nodes = True
nt = sc.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
rl = nt.nodes.new('CompositorNodeRLayers'); fo = nt.nodes.new('CompositorNodeOutputFile')
tmp = FOOT_OUT + '.d'
fo.base_path = tmp; fo.format.file_format = 'OPEN_EXR'; fo.format.color_depth = '32'; fo.format.color_mode = 'RGBA'
fo.file_slots[0].path = 'pos'
nt.links.new(rl.outputs['Position'], fo.inputs[0])
sc.render.use_compositing = True
bpy.ops.render.render(write_still=False)
import glob
f = sorted(glob.glob(os.path.join(tmp, 'pos*.exr')))[-1]
img = bpy.data.images.load(f)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]      # top row first
P = px[..., :3]
hit = np.abs(P).sum(-1) > 1e-6
# screen-down direction of the ortho camera, in bake px per metre: foot offset = (P - foot) . up * PXM
up = co.matrix_world.to_3x3() @ Vector((0, 1, 0))
off = P[..., 2] * up.z * PXM                       # P - (X, Y, 0) = (0, 0, Z): its screen-up length
off = np.where(hit, np.maximum(off, 0.0) + 0.5, 0.0).astype(np.float32)   # +0.5 so a hit at Z=0 is still a hit
np.save(FOOT_OUT, off)
print('FOOTMAP', CAMP, w, h, int(hit.sum()), float(off.max()))
