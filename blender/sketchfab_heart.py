"""Sketchfab "Realistic Human Heart" (neshallads, CC BY 4.0) -> contract parts for build_heart.py.

Import -> island grouping -> PCA long-axis alignment -> 12 cm scaling -> split into Heart_Myocardium / Aorta
(welded, so vessel-end caps join their tubes) -> descending-aorta extension with matching texture ->
"vesselness" unwrap of the painted coronary lines for path extraction.
"""
from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]
SRC_GLTF = ROOT / "assets_src" / "sketchfab_heart" / "scene.gltf"
ATTRIBUTION = ('This work is based on "Realistic Human Heart" (https://sketchfab.com/3d-models/realistic-human-heart-'
               '3f8072336ce94d18b3d0d055a1ece089) by neshallads (https://sketchfab.com/neshallads) licensed under '
               'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)')
MODIFICATIONS = ("re-aligned, re-scaled, split into parts, coronary tubes and territories added, clinical texture "
                 "variant added.")
BASE_TO_APEX = 0.12                                   # metres
WELD_DIST = 1e-5                                      # metres, after scaling


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def rotation_between(a, b):
    a, b = unit(a), unit(b)
    v = np.cross(a, b)
    c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else -np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))


def axis_angle(axis, ang):
    return np.array(Matrix.Rotation(ang, 3, Vector(unit(axis))))


def islands(me):
    parent = list(range(len(me.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    return np.array([find(i) for i in range(len(me.vertices))])


def verts(ob):
    a = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_verts(ob, V):
    ob.data.vertices.foreach_set("co", np.asarray(V, float).ravel())
    ob.data.update()


class SketchfabHeart:
    """Holds the imported, aligned and split source parts (in the body frame, Blender Z-up)."""

    def __init__(self, long_axis, centroid_target, coll, log=print):
        self.log = log
        self.coll = coll
        self.long_axis = unit(long_axis)
        self.centroid_target = np.asarray(centroid_target, float)
        self.report = {}

    # ------------------------------------------------------------------ import + groups
    def load(self):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(SRC_GLTF))
        new = [o for o in bpy.data.objects if o not in before]
        src = next(o for o in new if o.type == "MESH")
        me = src.data
        me.transform(src.matrix_world)               # bake the Sketchfab node transforms
        src.parent = None
        src.matrix_world = Matrix.Identity(4)
        for o in new:
            if o is not src:
                bpy.data.objects.remove(o)
        if src.name not in self.coll.objects:
            for c in list(src.users_collection):
                c.objects.unlink(src)
            self.coll.objects.link(src)
        for uv in list(me.uv_layers)[1:]:            # material uses TEXCOORD_0 only
            me.uv_layers.remove(uv)
        self.src = src
        V = verts(src)
        roots = islands(me)
        ids, counts = np.unique(roots, return_counts=True)
        big = [i for i, c in zip(ids, counts) if c > 300]
        cent = {i: V[roots == i].mean(0) for i in ids}
        # aorta = the large island with the highest centroid (ascending aorta + arch + 3 branch stubs)
        aorta_id = max((i for i in big if (roots == i).sum() > 1000), key=lambda i: cent[i][2])
        group = {i: ("aorta" if i == aorta_id else "heart") for i in big}
        kd = {g: KDTree(int(sum((roots == i).sum() for i in big if group[i] == g))) for g in ("aorta", "heart")}
        for g in kd:
            n = 0
            for i in big:
                if group[i] == g:
                    for p in V[roots == i]:
                        kd[g].insert(Vector(p), n)
                        n += 1
            kd[g].balance()
        for i in ids:                                 # small islands (vessel-end caps) join their nearest tube
            if i not in group:
                P = V[roots == i]
                d = {g: min(kd[g].find(Vector(p))[2] for p in P) for g in kd}
                group[i] = min(d, key=d.get)
        self.vgroup = np.array([group[r] for r in roots])
        # chambers = the large heart islands (ventricles + atria); the pulmonary trunk / pulmonary artery are
        # excluded from the surface used for vessel tracing, snapping and territories (they cover the base)
        self.chamber = np.isin(roots, [i for i in big if group[i] == "heart" and (roots == i).sum() > 1500])
        self.roots, self.cent, self.aorta_id = roots, cent, aorta_id
        caps = [i for i in ids if i not in big]
        self.report["source_islands"] = int(len(ids))
        self.report["source_triangles"] = int(sum(len(p.vertices) - 2 for p in me.polygons))
        # the arch-end cap: the aorta-group cap furthest toward the patient's left (+X)
        aorta_caps = [i for i in caps if group[i] == "aorta"]
        self.arch_end_cap = max(aorta_caps, key=lambda i: cent[i][0])
        return self

    # ------------------------------------------------------------------ align + scale + place
    def align(self):
        V = verts(self.src)
        heart = V[self.vgroup == "heart"]
        zcut = np.percentile(heart[:, 2], 50)
        vent = heart[heart[:, 2] < zcut]              # lower half of the heart ~ ventricles
        c0 = vent.mean(0)
        _, _, vt = np.linalg.svd(vent - c0, full_matrices=False)
        a = vt[0]
        apex = heart[np.argmin(heart[:, 2])]          # apex landmark: LV tip = lowest point of the upright source
        if (apex - c0) @ a < 0:
            a = -a
        self.report["pca_vs_apex_deg"] = round(float(np.degrees(np.arccos(np.clip(a @ unit(apex - heart.mean(0)), -1, 1)))), 1)
        a = unit(apex - heart.mean(0))                # apex landmark seen from the heart centroid -> target axis
        R1 = rotation_between(a, self.long_axis)
        # roll about the target axis so the source's anterior (-Y) stays anterior (RV faces -Y)
        T = self.long_axis
        src_ant = R1 @ np.array([0, -1.0, 0])
        src_ant = unit(src_ant - (src_ant @ T) * T)
        tgt_ant = np.array([0, -1.0, 0])
        tgt_ant = unit(tgt_ant - (tgt_ant @ T) * T)
        ang = math.atan2(np.cross(src_ant, tgt_ant) @ T, src_ant @ tgt_ant)
        R = axis_angle(T, ang) @ R1
        W = (V - c0) @ R.T
        proj = W[self.vgroup == "heart"] @ T
        length = np.percentile(proj, 99.9) - np.percentile(proj, 2)
        s = BASE_TO_APEX / length
        W = W * s
        shift = self.centroid_target - W[self.vgroup == "heart"].mean(0)
        W = W + shift
        set_verts(self.src, W)
        self.apex_world = (apex - c0) @ R.T * s + shift
        self.report.update(alignment_rotation_deg=round(math.degrees(math.acos(np.clip((np.trace(R) - 1) / 2, -1, 1))), 1),
                           roll_deg=round(math.degrees(ang), 1), scale=round(float(s), 5),
                           base_to_apex_m=BASE_TO_APEX)
        self.R, self.s = R, s
        hc = (heart.mean(0) - c0) @ R.T * s + shift           # heart centroid (on the aligned apex axis)
        vc = (vent.mean(0) - c0) @ R.T * s + shift
        T = self.long_axis
        self.vent_centroid = hc + ((vc - hc) @ T) * T             # ventricular level, ON the long axis
        return self

    # ------------------------------------------------------------------ split into contract parts
    def split(self):
        parts = {}
        for g, name in (("heart", "Heart_Myocardium"), ("aorta", "Aorta")):
            ob = self.src.copy()
            ob.data = self.src.data.copy()
            ob.name = ob.data.name = name
            self.coll.objects.link(ob)
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.verts.ensure_lookup_table()
            kill = [v for v in bm.verts if self.vgroup[v.index] != g]
            bmesh.ops.delete(bm, geom=kill, context="VERTS")
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD_DIST)
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()
            parts[name] = ob
        ob = self.src.copy()                          # chambers-only helper surface (not exported)
        ob.data = self.src.data.copy()
        ob.name = ob.data.name = "Extra_tmp_chambers"
        self.coll.objects.link(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not self.chamber[v.index]], context="VERTS")
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD_DIST)
        bm.to_mesh(ob.data)
        bm.free()
        self.chambers = ob
        bpy.data.objects.remove(self.src)
        self.parts = parts
        for name, ob in parts.items():
            roots = islands(ob.data)
            _, cnt = np.unique(roots, return_counts=True)
            self.report[f"{name}_islands_after_weld"] = int(len(cnt))
        return parts

    # ------------------------------------------------------------------ aorta: root axis, arch end
    def aorta_geometry(self):
        A = verts(self.parts["Aorta"])
        # aortic root = the aorta end nearest the ventricles (the arch end can hang lower than the root)
        seed = A[np.argmin(np.linalg.norm(A - self.vent_centroid, axis=1))]
        near = A[np.linalg.norm(A - seed, axis=1) < 0.035]
        c0 = near.mean(0)
        _, _, vt = np.linalg.svd(near - c0, full_matrices=False)
        axis = unit(vt[0] if vt[0][2] >= 0 else -vt[0])            # root axis, pointing up / away from the heart
        t0 = (seed - c0) @ axis
        P, R = [], []
        for t in np.arange(t0 + 0.002, t0 + 0.040, 0.003):           # slices up the ascending aorta
            rel = A - c0
            along = rel @ axis
            radial = rel - np.outer(along, axis)
            sl = A[(np.abs(along - t) < 0.0025) & (np.linalg.norm(radial, axis=1) < 0.022)]
            if len(sl) > 8:
                c = sl.mean(0)
                P.append(c)
                rr = (sl - c) - np.outer((sl - c) @ axis, axis)
                R.append(np.median(np.linalg.norm(rr, axis=1)))
        self.root_path, self.root_r = np.array(P), np.array(R)
        self.report["aortic_root_xyz"] = [round(float(x), 4) for x in P[0]] if len(P) else None
        # arch-end cap: centre, outward normal, radius (from the source cap island, now welded into the aorta)
        cap_pts = self._cap_points
        c = cap_pts.mean(0)
        _, _, vt = np.linalg.svd(cap_pts - c)
        n = vt[2]
        if n @ (c - A.mean(0)) < 0:
            n = -n
        r = np.median(np.linalg.norm(cap_pts - c, axis=1))
        self.arch_end = (c, unit(n), r)
        return self

    def seams(self, frame):
        """Grooves from the source modelling: the RV, LV(+LA) and RA are separate islands, so their shared
        borders ARE the interventricular and AV grooves. Returns {pair: (theta[], z[])} sorted by z."""
        V = verts(self.src)
        roots = self.roots
        ids, cnt = np.unique(roots, return_counts=True)
        ch = [i for i, c in zip(ids, cnt) if c > 1500 and self.vgroup[roots == i][0] == "heart"]
        cent = {i: V[roots == i].mean(0) for i in ch}
        rv = min(ch, key=lambda i: cent[i][1])                       # most anterior chamber shell
        rest = [i for i in ch if i != rv]
        lv = max(rest, key=lambda i: cent[i][0])                     # most leftward of the rest
        names = {rv: "RV", lv: "LV"}
        for i in rest:
            names.setdefault(i, "RA")
        out = {}
        for a in ch:
            for b in ch:
                if a >= b:
                    continue
                kd = KDTree(int((roots == b).sum()))
                for k, p in enumerate(V[roots == b]):
                    kd.insert(Vector(p), k)
                kd.balance()
                P = np.array([p for p in V[roots == a] if kd.find(Vector(p))[2] < 0.0006])
                if len(P) < 5:
                    continue
                out["|".join(sorted((names[a], names[b])))] = P
        self.seam_pts = out
        return out

    def seam_tz(self, frame):
        """{pair: (theta[], z[])} sorted by z, in the given frame."""
        out = {}
        for k, P in self.seam_pts.items():
            th, z = frame.local(P)
            o = np.argsort(z)
            out[k] = (th[o], z[o])
        self.seam = out
        return out

    def refine(self):
        """After the weld: rotate every part about the welded heart centroid so that the apex landmark, seen from
        that centroid (= the final origin), points exactly along the target long axis."""
        H = verts(self.parts["Heart_Myocardium"])
        c = H.mean(0)
        R2 = rotation_between(unit(self.apex_world - c), self.long_axis)
        rot = lambda P: (np.asarray(P) - c) @ R2.T + c                       # noqa: E731
        for ob in list(self.parts.values()) + [self.chambers]:
            set_verts(ob, rot(verts(ob)))
        self.apex_world = rot(self.apex_world)
        self.vent_centroid = rot(self.vent_centroid)
        self._cap_points = rot(self._cap_points)
        self.seam_pts = {k: rot(P) for k, P in self.seam_pts.items()}
        self.R = R2 @ self.R
        # keep the ventricular frame origin on the (new) axis through the heart centroid
        T = self.long_axis
        self.vent_centroid = c + ((self.vent_centroid - c) @ T) * T
        self.report["refine_rotation_deg"] = round(float(np.degrees(np.arccos(np.clip((np.trace(R2) - 1) / 2, -1, 1)))), 2)
        return self

    def remember_cap(self):
        """Call after align(): store the transformed arch-end cap points (before the split welds them)."""
        V = verts(self.src)
        self._cap_points = V[self.roots == self.arch_end_cap]
        return self

    # ------------------------------------------------------------------ descending aorta extension
    def extend_aorta(self, heart_ob, tube_fn, catmull_rom, resample, z_end=0.90, segs=32, step=0.004):
        c, n, r = self.arch_end
        H = verts(heart_ob)
        band = (H[:, 2] > c[2] - 0.12) & (H[:, 2] < c[2] + 0.01) & (H[:, 0] > c[0] - 0.05) & (H[:, 0] < c[0] + 0.03)
        y_back = (H[band, 1].max() if band.any() else c[1]) + r + 0.004
        start = c - n * 0.006                         # starts inside the arch end -> overlapping, seamless joint
        ctrl = np.array([start, c + n * 0.012,
                         [c[0] + n[0] * 0.02, max(y_back, c[1] + 0.01), c[2] - 0.025],
                         [c[0] + n[0] * 0.015, y_back, c[2] - 0.08],
                         [0.022, y_back, 1.18], [0.014, 0.055, 1.02], [0.010, 0.048, z_end]])
        P = resample(catmull_rom(ctrl), step)
        s = np.linspace(0, 1, len(P))
        radii = r * (1 - 0.22 * s)
        V, F = tube_fn(P, radii, segs, caps=True, cap_rings=3)
        self.desc_path, self.desc_r = P, radii
        # UVs: map each extension vertex back onto the last ~15 mm of the arch (ping-pong along the axis) and take
        # the UV of the nearest aorta vertex -> the extension carries the same texture colour and pattern.
        aorta = self.parts["Aorta"]
        A = verts(aorta)
        uv_of_vertex = np.zeros((len(A), 2))
        uvl = aorta.data.uv_layers.active.data
        for poly in aorta.data.polygons:
            for li in poly.loop_indices:
                uv_of_vertex[aorta.data.loops[li].vertex_index] = uvl[li].uv
        along = (A - c) @ n
        radial = np.linalg.norm((A - c) - np.outer(along, n), axis=1)
        wall = (along > -0.022) & (along < -0.003) & (radial > 0.8 * r) & (radial < 1.25 * r)
        idx_pool = np.where(wall)[0]
        kd = KDTree(len(idx_pool))
        for k, i in enumerate(idx_pool):
            kd.insert(Vector(A[i]), k)
        kd.balance()
        cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        e1 = unit(np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0]))
        e2 = np.cross(n, e1)
        T = unit(np.gradient(P, axis=0))
        uvs = []
        for v in V:
            i = int(np.argmin(np.linalg.norm(P - v, axis=1)))
            d = v - P[i]
            d = d - (d @ T[i]) * T[i]
            ang = math.atan2(d @ np.cross(T[i], e1 if abs(T[i] @ e1) < 0.9 else e2), d @ (e1 if abs(T[i] @ e1) < 0.9 else e2))
            back = 0.004 + abs(((cum[i] / 0.015) % 2) - 1) * 0.015   # ping-pong 4..19 mm back on the arch wall
            q = c - n * back + r * (math.cos(ang) * e1 + math.sin(ang) * e2)
            uvs.append(uv_of_vertex[idx_pool[kd.find(Vector(q))[1]]])
        me = bpy.data.meshes.new("Extra_tmp_desc")
        me.from_pydata([tuple(map(float, v)) for v in V], [], [tuple(f) for f in F])
        me.update()
        uvlayer = me.uv_layers.new(name=aorta.data.uv_layers.active.name)
        for poly in me.polygons:
            for li in poly.loop_indices:
                uvlayer.data[li].uv = uvs[me.loops[li].vertex_index]
        ext = bpy.data.objects.new("Extra_tmp_desc", me)
        self.coll.objects.link(ext)
        ext.data.materials.append(aorta.data.materials[0])
        bpy.ops.object.select_all(action="DESELECT")
        ext.select_set(True)
        aorta.select_set(True)
        bpy.context.view_layer.objects.active = aorta
        bpy.ops.object.join()
        aorta.data.shade_smooth()
        return self

    # ------------------------------------------------------------------ vesselness unwrap
    def unwrap(self, heart_ob, frame, z_lo, z_hi, dtheta=0.5, dz=0.0005):
        """Ray-cast a (theta, z') grid onto the heart and sample the base-colour texture through the UVs.
        Returns (thetas, zs, rgb[nz, nt, 3], hit[nz, nt, 3], ok[nz, nt])."""
        me = heart_ob.data
        me.calc_loop_triangles()
        Vw = verts(heart_ob)
        tris = [tuple(t.vertices) for t in me.loop_triangles]
        bvh = BVHTree.FromPolygons([tuple(v) for v in Vw], tris)
        uvl = me.uv_layers.active.data
        tri_uv = [[uvl[li].uv for li in t.loops] for t in me.loop_triangles]
        img = self._base_image(heart_ob)
        Wd, Ht = img.size
        px = np.empty(Wd * Ht * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(Ht, Wd, 4)[:, :, :3]
        thetas = np.arange(-180, 180, dtheta)
        zs = np.arange(z_lo, z_hi, dz)
        rgb = np.zeros((len(zs), len(thetas), 3), np.float32)
        hit = np.zeros((len(zs), len(thetas), 3))
        ok = np.zeros((len(zs), len(thetas)), bool)
        dirs = frame.dirs(thetas)
        for i, z in enumerate(zs):
            axis_pt = frame.c + z * frame.ez
            for j, d in enumerate(dirs):
                loc, _, ti, _ = bvh.ray_cast(Vector(axis_pt + d * 0.25), Vector(-d), 0.26)
                if loc is None:
                    continue
                t = me.loop_triangles[ti]
                a, b, cc = (me.vertices[k].co for k in t.vertices)
                ua, ub, uc = (Vector((u[0], u[1], 0)) for u in tri_uv[ti])
                uv = barycentric_transform(loc, a, b, cc, ua, ub, uc)
                x = int((uv[0] % 1.0) * (Wd - 1))
                y = int((uv[1] % 1.0) * (Ht - 1))
                rgb[i, j] = px[y, x]
                hit[i, j] = loc
                ok[i, j] = True
        return thetas, zs, rgb, hit, ok

    def _base_image(self, ob):
        for node in ob.active_material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "baseColor" in node.image.name:
                return node.image
        raise RuntimeError("baseColor image not found on the source material")
