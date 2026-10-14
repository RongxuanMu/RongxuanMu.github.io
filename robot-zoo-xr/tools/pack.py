"""Pack one robot for Robot Zoo XR:
  <out>/<id>/physics.xml   the MJCF without its visual geoms, collision meshes swapped for their convex hulls
                           (what MuJoCo collides with anyway), the scene's own floor kept
  <out>/<id>/m/*.stl       those hulls (binary STL, original mesh coordinates)
  <out>/<id>/raw/, visual.raw.json   the visual meshes (MuJoCo mesh frames) and visual geoms (body, local pose, colour),
                           for vis.mjs to turn into visual.bin / visual.json
  python pack.py <id> <mjcf> <out>     (then: node vis.mjs <out>/<id> to decimate and quantise the visual meshes)"""
import json
import os
import sys

import mujoco
import numpy as np
import trimesh

rid, src, out = sys.argv[1:4]
dst = os.path.join(out, rid)
os.makedirs(os.path.join(dst, 'm'), exist_ok=True)
m = mujoco.MjModel.from_xml_path(src)
name = lambda t, i: mujoco.mj_id2name(m, t, i)

# - visual meshes from the compiled model (already in MuJoCo's mesh frames, matching geom_pos / geom_quat) -
is_visual = lambda g: m.geom_contype[g] == 0 and m.geom_conaffinity[g] == 0
geoms, meshes, mesh_ix = [], [], {}
for g in range(m.ngeom):
    if not is_visual(g) or m.geom_bodyid[g] == 0:
        continue
    rgba = m.mat_rgba[m.geom_matid[g]] if m.geom_matid[g] >= 0 else m.geom_rgba[g]
    entry = dict(body=name(mujoco.mjtObj.mjOBJ_BODY, m.geom_bodyid[g]), pos=np.round(m.geom_pos[g], 6).tolist(),
                 quat=np.round(m.geom_quat[g], 6).tolist(), rgba=np.round(rgba, 3).tolist())
    if m.geom_type[g] == mujoco.mjtGeom.mjGEOM_MESH:
        mid = m.geom_dataid[g]
        if mid not in mesh_ix:
            va, vn, fa, fn = m.mesh_vertadr[mid], m.mesh_vertnum[mid], m.mesh_faceadr[mid], m.mesh_facenum[mid]
            V = m.mesh_vert[va:va + vn].astype(np.float64)
            F = m.mesh_face[fa:fa + fn].astype(np.int64)
            tm = trimesh.Trimesh(V, F, process=True)
            tm.merge_vertices()
            V, F = tm.vertices, tm.faces
            # raw mesh for vis.mjs (meshoptimizer simplify + quantise)
            raw = os.path.join(dst, 'raw')
            os.makedirs(raw, exist_ok=True)
            k = len(meshes)
            V.astype(np.float32).tofile(os.path.join(raw, f'{k}.v'))
            F.astype(np.uint32).tofile(os.path.join(raw, f'{k}.f'))
            mesh_ix[mid] = k
            meshes.append(dict(name=name(mujoco.mjtObj.mjOBJ_MESH, mid)))
        entry['mesh'] = mesh_ix[mid]
    else:
        entry['type'] = {2: 'sphere', 3: 'capsule', 4: 'ellipsoid', 5: 'cylinder', 6: 'box'}.get(int(m.geom_type[g]), 'box')
        entry['size'] = np.round(m.geom_size[g], 6).tolist()
    geoms.append(entry)
json.dump(dict(meshes=meshes, geoms=geoms), open(os.path.join(dst, 'visual.raw.json'), 'w'), separators=(',', ':'))

# - physics: the same spec minus visual geoms, hull meshes -
spec = mujoco.MjSpec.from_file(src)
for b in spec.bodies:
    for g in list(b.geoms):
        if g.contype == 0 and g.conaffinity == 0 and b.name != 'world':
            spec.delete(g)
used = {g.meshname for b in spec.bodies for g in b.geoms if g.type == mujoco.mjtGeom.mjGEOM_MESH}
meshdir = os.path.join(os.path.dirname(src), spec.meshdir or '')
for me in list(spec.meshes):
    if me.name not in used:
        spec.delete(me)
        continue
    f = me.file if os.path.isabs(me.file) else os.path.join(meshdir, me.file)
    hull = trimesh.load(f, force='mesh').convex_hull
    fname = f'{me.name}.stl'
    hull.export(os.path.join(dst, 'm', fname), file_type='stl')
    me.file = fname
spec.meshdir = os.path.abspath(os.path.join(dst, 'm'))
spec.texturedir = ''
# no skybox / textures / materials from the source scene; a plain floor
for t in list(spec.textures):
    spec.delete(t)
for mt in list(spec.materials):
    spec.delete(mt)
# keep the scene's own floor (its contact bits matter: X1's default class has contype 0), drop its material
planes = [g for g in spec.worldbody.geoms if g.type == mujoco.mjtGeom.mjGEOM_PLANE]
for g in list(spec.worldbody.geoms):
    if g not in planes[:1]:
        spec.delete(g)
if planes:
    floor = planes[0]
    floor.material = ''
else:
    floor = spec.worldbody.add_geom()
    floor.type = mujoco.mjtGeom.mjGEOM_PLANE
    floor.contype = 1
    floor.conaffinity = 15
floor.name = 'floor'
floor.size = [0, 0, 0.05]
xml = spec.to_xml().replace(spec.meshdir, 'm')
open(os.path.join(dst, 'physics.xml'), 'w').write(xml)
pm = mujoco.MjModel.from_xml_path(os.path.join(dst, 'physics.xml'))
sz = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(dst) for f in fs)
print(f'{rid}: {len(geoms)} visual geoms, {len(meshes)} meshes, {len(used)} hulls; '
      f'physics nq {pm.nq} nu {pm.nu} ngeom {pm.ngeom} (src {m.ngeom}); total {sz / 1024:.0f} KB')
