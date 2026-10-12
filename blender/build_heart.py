"""Procedural 3D heart + body asset for Track A (Step 6).

One-command rebuild (headless, reproducible):
    blender -b --factory-startup -P blender/build_heart.py -- \
        --out artifacts/heart.glb --lite artifacts/heart_lite.glb \
        [--blend blender/heart_source.blend] [--renders artifacts/figures --demo-colors '{"lad":"#..",...}']

Modelling frame (Blender, Z-up): patient anterior = -Y, patient left = +X, superior = +Z, metres.
The glTF export converts to Y-up (anterior -> +Z, facing a default three.js camera).

Heart source (--heart-source):
  sketchfab (default) "Realistic Human Heart" by neshallads, CC BY 4.0 (assets_src/sketchfab_heart): aligned,
             scaled, split into Heart_Myocardium + Aorta, coronary tubes traced onto the painted vessel lines
             (blender/sketchfab_heart.py, blender/vessel_trace.py); Realistic + Clinical looks.
  procedural the Step 6 CC0 parametric heart (kept for reproducibility / fallback).
Body, organs, territories, anchors, views and all contract names come from artifacts/anatomy_map.json.
Nothing is shaped or placed from patient data; Region RWMA is never used as a coordinate.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# =============================================================================== PARAMETERS
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
MAP_PATH = ROOT / "artifacts" / "anatomy_map.json"
LOOK_PATH = ROOT / "artifacts" / "viewer_look.json"
CACHE = ROOT / "artifacts" / "cache"

HEART_CENTROID_BODY = np.array([0.015, 0.0, 1.30])   # heart centroid in the body frame (floor z = 0)
LONG_AXIS = np.array([0.55, -0.45, -0.70])            # base -> apex (left, anterior, inferior)
Z_APEX, Z_BASE, Z_DOME = -0.065, 0.050, 0.082         # along the long axis (z')
RX, RY = 0.045, 0.036                                 # elliptical cross-section (left-right, ant-post)
GROOVE_DEPTH, GROOVE_WIDTH = 0.0030, 0.0060           # interventricular / AV grooves
AV_GROOVE_Z = 0.030
VESSEL_OFFSET = 0.0019                                # centreline above epicardium
VESSEL_R = {"main": (0.0022, 0.0014), "lm": (0.0027, 0.0025), "branch": (0.0012, 0.0008)}
# Sketchfab heart: radii follow the painted vessels (~10-20 % thicker than the measured 2.76 mm painted LAD);
# the procedural spec radii above read as cables on the realistic texture (see STEP6_ASSET.md).
VESSEL_R_SKETCHFAB = {"main": (0.0018, 0.0013), "lm": (0.0020, 0.0019), "branch": (0.0011, 0.0008)}
HIT_R = 0.006
TERRITORY_OFFSET = 0.0010
TERRITORY_Z = (-0.050, 0.025)                         # apical-cap boundary, top (below AV groove)
AORTA_R = (0.0140, 0.0105)
ARCH_APEX_ABOVE_BASE = 0.050                          # aortic-arch apex (centreline) above the heart base
MAX_BEND_DEG = 35.0                                   # contract limit between consecutive centreline segments
BEND_TARGET_DEG = 28.0                                # what the smoother aims for (margin under the limit)
BEND_CHORD = 0.004                                    # bends are also measured on ~4 mm chords
TERRITORY_FEATHER = 0.003                             # vertex-alpha feather width at territory boundaries
AO_STRENGTH = 0.20                                    # vertex-colour AO (heart, aorta, torso only)

QUALITY = {
    "full": dict(tex_size=2048, src_heart_tris=None, heart_voxel=0.0011, heart_tris=25000, param_n=(144, 110), vessel_segs=12, vessel_step=0.0016,
                 aorta_segs=32, aorta_step=0.004, terr_dtheta=2.0, terr_dz=0.0015, body_voxel=0.0055,
                 body_tris=20000, organ_voxel=0.0028, organ_tris=5000, ao_rays=14),
    "lite": dict(tex_size=1024, src_heart_tris=11000, heart_voxel=0.0015, heart_tris=10000, param_n=(96, 72), vessel_segs=8, vessel_step=0.0032,
                 aorta_segs=16, aorta_step=0.008, terr_dtheta=4.0, terr_dz=0.003, body_voxel=0.008,
                 body_tris=8000, organ_voxel=0.004, organ_tris=2000, ao_rays=8),
}

# Art direction (neutral structures come from the map; these are the remaining base colours).
PALETTE = {
    "Heart_Myocardium": dict(color="#D9A79A", rough=0.55, sheen=0.25),
    "Territory": dict(color="#FFFFFF", rough=0.6, alpha=0.35),
    "Coronary": dict(color="#C9C2B8", rough=0.30),
    "Organ_Lungs": dict(color="#E8C4C0", rough=0.6), "Organ_Kidneys": dict(color="#C98B7E", rough=0.6),
    "Organ_Pancreas": dict(color="#E3C79B", rough=0.6), "Organ_Thyroid": dict(color="#D4A08F", rough=0.6),
    "Organ_Brain": dict(color="#E6CFC8", rough=0.6), "Organ_Legs": dict(color="#DCC7BC", rough=0.6),
    "Torso_Shell": dict(rough=0.30, alpha=0.18), "Aorta": dict(rough=0.50),
}
RENDER = dict(samples=64, res=(1600, 1000), vfov_deg=35.0, margin=1.15)
VIEWER_LOOK = {
    "description": "Presentation settings shared by the Cycles renders (build_heart.py) and blender/preview.html; "
                   "matches the Sketchfab viewer reference (assets_src/sketchfab_heart/reference).",
    "background": {"type": "radial-gradient", "center": "#3A3A3A", "edge": "#1E1E1E", "radius": 0.75},
    "environment": {"hdri": "assets_src/hdri/studio_small_09_1k.hdr", "name": "Studio Small 09",
                    "source": "https://polyhaven.com/a/studio_small_09", "author": "Poly Haven",
                    "license": "CC0", "intensity": 1.0, "visible_as_background": False},
    "lights": [
        {"name": "key", "space": "camera", "direction": [-0.55, 0.62, 0.56], "color": "#FFF4EA",
         "three_intensity": 2.2, "cycles_irradiance": 4.5, "size_rel": 0.6,
         "note": "soft key from upper-front-left -> wet specular highlights"},
        {"name": "rim", "space": "camera", "direction": [0.35, 0.50, -0.79], "color": "#FFFFFF",
         "three_intensity": 1.6, "cycles_irradiance": 3.5, "size_rel": 0.5, "note": "rim from behind"}],
    "renderer": {"tone_mapping": "ACESFilmic", "exposure": 1.0, "output_color_space": "sRGB",
                 "shadows": False, "ambient_occlusion": "off by default (SAO only if fps allows)"},
    "camera": {"vfov_deg": 35, "near": 0.005, "far": 50},
}
OUTLINE_EXTRA = 0.0006                                 # Extra_Outline_* = vessel tube + 0.6 mm, inverted normals
CLINICAL = dict(desaturate=0.55, tone="#D9A79A", tone_mix=0.45, roughness=0.65, normal_scale=0.4)

# =============================================================================== small helpers
def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def hex_rgb(h):
    return [int(h.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def srgb_to_lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def wrap180(d):
    return (np.asarray(d) + 180.0) % 360.0 - 180.0


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def log(*a):
    print("[build]", *a, flush=True)


# =============================================================================== heart surface
class HeartFrame:
    """Local frame: z' along the long axis (apex -> base), theta: 0 left, -90 anterior,
    +90 posterior, 180 right."""

    def __init__(self, c):
        self.c = np.asarray(c, float)
        self.ez = unit(-LONG_AXIS)
        left = np.array([1.0, 0, 0])
        self.u = unit(left - left.dot(self.ez) * self.ez)
        v = np.cross(self.ez, self.u)
        self.v = v if v[1] > 0 else -v                 # +90 deg = posterior

    def dirs(self, th_deg):
        t = np.radians(th_deg)[..., None]
        return np.cos(t) * self.u + np.sin(t) * self.v

    def point(self, th_deg, zp, r):
        th_deg, zp, r = np.broadcast_arrays(np.asarray(th_deg, float), np.asarray(zp, float), np.asarray(r, float))
        return self.c + zp[..., None] * self.ez + r[..., None] * self.dirs(th_deg)

    def local(self, P):
        d = np.asarray(P) - self.c
        return np.degrees(np.arctan2(d @ self.v, d @ self.u)), d @ self.ez


def profile(zp):
    """Egg-shaped radius profile: rounded apex, widest near the base, dome closing the base."""
    zp = np.asarray(zp, float)
    s = np.clip((zp - Z_APEX) / (Z_BASE - Z_APEX), 0, 1)
    f = (1 - (1 - s) ** 2) ** 0.55 * (1 - 0.18 * s ** 3)
    t = np.clip((zp - Z_BASE) / (Z_DOME - Z_BASE), 0, 1)
    return np.where(zp > Z_BASE, 0.82 * np.sqrt(np.clip(1 - t ** 2, 0, 1)), f)


def lad_theta(zp):
    return np.interp(zp, [Z_APEX, 0.045], [-82.0, -60.0])


def pivg_theta(zp):
    return np.interp(zp, [Z_APEX, AV_GROOVE_Z], [94.0, 102.0])


def heart_radius(th, zp):
    th, zp = np.broadcast_arrays(np.asarray(th, float), np.asarray(zp, float))
    t = np.radians(th)
    rho = RX * RY / np.sqrt((RY * np.cos(t)) ** 2 + (RX * np.sin(t)) ** 2)
    bulge = 1 + 0.10 * np.clip(np.cos(t - np.radians(25)), 0, None) ** 2 \
        - 0.05 * np.clip(np.cos(t - np.radians(-150)), 0, None) ** 2
    r = rho * profile(zp) * bulge
    # atria as smooth lobes of the base dome (left atrium posterior, right atrium to the right)
    atria = 0.30 * np.exp(-(wrap180(th - 80) / 55) ** 2) + 0.18 * np.exp(-(wrap180(th - 185) / 45) ** 2)
    r = r * (1 + atria * smoothstep((zp - 0.036) / 0.022))
    arc = lambda d: np.radians(wrap180(d)) * np.maximum(r, 1e-4)      # noqa: E731
    g = np.exp(-(arc(th - lad_theta(zp)) / GROOVE_WIDTH) ** 2)
    g += np.exp(-(arc(th - pivg_theta(zp)) / GROOVE_WIDTH) ** 2) * (1 - smoothstep((zp - AV_GROOVE_Z) / 0.01))
    g += 0.8 * np.exp(-((zp - AV_GROOVE_Z) / 0.0045) ** 2)
    fade = smoothstep((zp - Z_APEX) / 0.022) * (1 - smoothstep((zp - Z_BASE) / 0.012))
    return r - GROOVE_DEPTH * g * fade * np.clip(r / 0.012, 0, 1)


def surface(frame, th, zp):
    return frame.point(th, zp, heart_radius(th, zp))


def ventricle_mesh(frame, n_theta, n_z):
    th = np.linspace(0, 360, n_theta, endpoint=False)
    u = np.linspace(0, 1, n_z + 2)[1:-1]
    zs = Z_APEX + (Z_DOME - Z_APEX) * (1 - np.cos(np.pi * u)) / 2      # denser at the poles
    TH, ZZ = np.meshgrid(th, zs)
    V = surface(frame, TH, ZZ).reshape(-1, 3)
    apex = frame.c + Z_APEX * frame.ez
    dome = frame.c + Z_DOME * frame.ez
    verts = np.vstack([V, apex, dome])
    ia, idm = len(V), len(V) + 1
    F = []
    for i in range(n_z - 1):
        for j in range(n_theta):
            a, b = i * n_theta + j, i * n_theta + (j + 1) % n_theta
            F.append((a, b, b + n_theta, a + n_theta))
    for j in range(n_theta):
        F.append((ia, (j + 1) % n_theta, j))
        top = (n_z - 1) * n_theta
        F.append((idm, top + j, top + (j + 1) % n_theta))
    return verts, F


# =============================================================================== primitive generators
def ellipsoid(center, radii, axes=np.eye(3), nu=48, nv=32):
    th = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    ph = np.linspace(0, np.pi, nv + 1)[1:-1]
    TH, PH = np.meshgrid(th, ph)
    local = np.stack([np.sin(PH) * np.cos(TH) * radii[0], np.sin(PH) * np.sin(TH) * radii[1],
                      np.cos(PH) * radii[2]], -1).reshape(-1, 3)
    axes = np.asarray(axes, float)
    V = np.asarray(center) + local @ axes
    top = np.asarray(center) + radii[2] * axes[2]
    bot = np.asarray(center) - radii[2] * axes[2]
    verts = np.vstack([V, top, bot])
    it, ib, n = len(V), len(V) + 1, len(ph)
    F = [(i * nu + j, i * nu + (j + 1) % nu, (i + 1) * nu + (j + 1) % nu, (i + 1) * nu + j)
         for i in range(n - 1) for j in range(nu)]
    F += [(it, (j + 1) % nu, j) for j in range(nu)]
    F += [(ib, (n - 1) * nu + j, (n - 1) * nu + (j + 1) % nu) for j in range(nu)]
    return verts, F


def catmull_rom(P, per_seg=24):
    P = np.asarray(P, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per_seg, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


def resample(P, step):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(3, int(round(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, P[:, k]) for k in range(3)], -1)


def tube(P, radii, segs, caps=True, cap_rings=3):
    """Swept circular tube along a polyline (parallel-transport frames) with round caps."""
    P = np.asarray(P, float)
    radii = np.broadcast_to(np.asarray(radii, float), (len(P),))
    T = unit(np.gradient(P, axis=0))
    ref = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
    N = [unit(np.cross(T[0], ref))]
    for i in range(1, len(P)):
        n = N[-1] - N[-1].dot(T[i]) * T[i]
        N.append(unit(n))
    N = np.array(N)
    B = np.cross(T, N)
    ang = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    rings = [P[i] + radii[i] * (np.cos(ang)[:, None] * N[i] + np.sin(ang)[:, None] * B[i]) for i in range(len(P))]
    verts = list(np.vstack(rings))
    F = [(i * segs + k, i * segs + (k + 1) % segs, (i + 1) * segs + (k + 1) % segs, (i + 1) * segs + k)
         for i in range(len(P) - 1) for k in range(segs)]
    if caps:
        for end, sign in ((0, -1), (len(P) - 1, 1)):
            prev = list(range(end * segs, end * segs + segs))
            for j in range(1, cap_rings + 1):
                phi = j / (cap_rings + 1) * np.pi / 2
                c = P[end] + sign * T[end] * radii[end] * np.sin(phi)
                ring = c + radii[end] * np.cos(phi) * (np.cos(ang)[:, None] * N[end] + np.sin(ang)[:, None] * B[end])
                base = len(verts)
                verts.extend(ring)
                cur = list(range(base, base + segs))
                for k in range(segs):
                    q = (prev[k], prev[(k + 1) % segs], cur[(k + 1) % segs], cur[k])
                    F.append(q if sign > 0 else q[::-1])
                prev = cur
            pole = len(verts)
            verts.append(P[end] + sign * T[end] * radii[end])
            for k in range(segs):
                t = (prev[k], prev[(k + 1) % segs], pole)
                F.append(t if sign > 0 else t[::-1])
    return np.array(verts), F


def loft(sections, caps=True):
    """Closed loft through a list of equal-length rings (each (n,3)); poles at both ends."""
    n = len(sections[0])
    V = np.vstack(sections)
    F = [(i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k)
         for i in range(len(sections) - 1) for k in range(n)]
    verts = list(V)
    if caps:
        for idx, sign in ((0, -1), (len(sections) - 1, 1)):
            pole = len(verts)
            verts.append(sections[idx].mean(0))
            for k in range(n):
                t = (idx * n + k, idx * n + (k + 1) % n, pole)
                F.append(t[::-1] if sign < 0 else t)
    return np.array(verts), F


def merge(*parts):
    V, F, off = [], [], 0
    for v, f in parts:
        V.append(np.asarray(v))
        F.extend(tuple(i + off for i in face) for face in f)
        off += len(v)
    return np.vstack(V), F


# =============================================================================== blender mesh utils
def new_obj(name, verts, faces, coll, smooth=True, outward=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if outward:                                     # consistent outward normals (three.js culls back faces)
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    me.update()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old, name = ob.data, ob.data.name
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = name                                  # keep the clean contract name (no .001 suffix)


def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def finish(ob, voxel=None, smooth_iter=0, smooth_factor=0.5, target_tris=None, recalc=True):
    """Voxel remesh (union + manifold) -> smooth -> decimate to a triangle budget."""
    if voxel:
        m = ob.modifiers.new("remesh", "REMESH")
        m.mode, m.voxel_size, m.adaptivity, m.use_smooth_shade = "VOXEL", voxel, 0.0, True
        apply_modifiers(ob)
    if smooth_iter:
        m = ob.modifiers.new("smooth", "SMOOTH")
        m.factor, m.iterations = smooth_factor, smooth_iter
        apply_modifiers(ob)
    if target_tris:
        n = tri_count(ob)
        if n > target_tris:
            m = ob.modifiers.new("decimate", "DECIMATE")
            m.ratio = target_tris / n * 0.985
            m.use_collapse_triangulate = True
            apply_modifiers(ob)
            m = ob.modifiers.new("relax", "SMOOTH")           # relax decimation creases
            m.factor, m.iterations = 0.35, 2
            apply_modifiers(ob)
    ob.data.shade_smooth()
    return ob


def drop_small_islands(ob, min_tris=50):
    """Delete connected pieces smaller than `min_tris` triangles (stray Boolean / remesh fragments)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen, kill = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        if sum(len(g.verts) - 2 for g in comp) < min_tris:
            kill += comp
    if kill:
        bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def verts_of(ob):
    a = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_verts(ob, V):
    ob.data.vertices.foreach_set("co", np.asarray(V, float).ravel())
    ob.data.update()


def bvh_of(ob):
    return BVHTree.FromPolygons([tuple(v) for v in verts_of(ob)], [tuple(p.vertices) for p in ob.data.polygons])


def inside(bvh, p, direction=(0.0123, 0.0071, 1.0)):
    """Ray-parity inside test (closed meshes)."""
    d = Vector(unit(direction))
    o, hits = Vector(p), 0
    for _ in range(64):
        loc, _, _, _ = bvh.ray_cast(o + d * 1e-5, d)
        if loc is None:
            break
        hits += 1
        o = loc
    return hits % 2 == 1


def smooth_normal(bvh, p, radius=0.003):
    hits = bvh.find_nearest_range(Vector(p), radius)
    if not hits:
        loc, n, _, _ = bvh.find_nearest(Vector(p))
        return np.array(loc), np.array(n)
    loc, _, _, _ = bvh.find_nearest(Vector(p))
    n = sum((h[1] * (1.0 / (h[3] + 1e-4)) for h in hits), Vector((0, 0, 0)))
    return np.array(loc), unit(np.array(n))


def snap_path(P, bvh, offset, fixed=(), rounds=5):
    """Project points onto the surface + offset along the smoothed normal; Laplacian-smooth
    between rounds so the centreline follows the surface without jitter."""
    P = np.array(P, float)
    fixed = set(i % len(P) for i in fixed)
    for r in range(rounds):
        for i in range(len(P)):
            if i in fixed:
                continue
            loc, n = smooth_normal(bvh, P[i], 0.004)
            P[i] = loc + n * offset
        if r < rounds - 1:
            for _ in range(3):
                Q = P.copy()
                for i in range(1, len(P) - 1):
                    if i not in fixed:
                        Q[i] = 0.5 * P[i] + 0.25 * (P[i - 1] + P[i + 1])
                P = Q
    return P


def bend_angles(P, chord=None):
    """Angles (deg) between consecutive centreline segments; with `chord`, segments of ~chord length."""
    P = np.asarray(P, float)
    w = 1
    if chord:
        step = np.median(np.linalg.norm(np.diff(P, axis=0), axis=1))
        w = max(1, int(round(chord / step)))
    if len(P) < 2 * w + 1:
        return np.zeros(1)
    d1 = unit(P[w:len(P) - w] - P[:len(P) - 2 * w])
    d2 = unit(P[2 * w:] - P[w:len(P) - w])
    return np.degrees(np.arccos(np.clip(np.einsum("ij,ij->i", d1, d2), -1, 1)))


def hermite(p0, p1, m0, m1, n):
    t = np.linspace(0, 1, n)[:, None]
    return ((2 * t ** 3 - 3 * t ** 2 + 1) * p0 + (t ** 3 - 2 * t ** 2 + t) * m0
            + (-2 * t ** 3 + 3 * t ** 2) * p1 + (t ** 3 - t ** 2) * m1)


LM_LENGTH = 0.010                                      # left main: ostium -> bifurcation (8-12 mm)
FULL_HEART_BVH = None                                  # set per build: whole myocardium (incl. pulmonary trunk)


def limit_bends(P, bvh, offset, fixed=(), target=BEND_TARGET_DEG, chord=BEND_CHORD, iters=400, band=(0.0013, 0.0032),
                band_from=1):
    """Relax the centreline wherever a bend exceeds `target` degrees (native segments and ~4 mm chords).
    Relaxation does NOT re-snap every step (on a real mesh the AV groove is a sharp crease and snapping both
    sides re-creates the kink); afterwards points are only pushed back into the surface-offset band."""
    P = np.array(P, float)
    fixed = set(i % len(P) for i in fixed) | {0}
    step = np.median(np.linalg.norm(np.diff(P, axis=0), axis=1))
    w = max(1, int(round(chord / step)))

    def bad_set(P):
        a1 = bend_angles(P)
        a2 = bend_angles(P, chord)
        bad = set((np.where(a1 > target)[0] + 1).tolist())
        bad |= {j for i in np.where(a2 > target)[0] for j in range(i, i + 2 * w + 1)}
        return {i for b in bad for i in range(b - 2, b + 3) if 0 < i < len(P) - 1 and i not in fixed}

    for _outer in range(6):
        for _ in range(iters):
            bad = bad_set(P)
            if not bad:
                break
            Q = P.copy()
            for i in bad:
                Q[i] = 0.4 * P[i] + 0.3 * (P[i - 1] + P[i + 1])
            P = Q
        moved = False
        for i in range(max(1, band_from), len(P)):      # keep the 1.3-3.2 mm offset band (on the heart only)
            if i in fixed:
                continue
            loc, n = smooth_normal(bvh, P[i], 0.004)
            d = float(np.dot(P[i] - loc, n))
            target_pt = None
            if d < band[0] or inside(bvh, P[i]):
                target_pt = loc + n * offset
            elif d > band[1]:
                target_pt = loc + n * band[1]
            if target_pt is not None and np.linalg.norm(target_pt - P[i]) < 0.004:   # never teleport
                P[i] = target_pt
                moved = True
        if not moved and not bad_set(P):
            break
    # uniform re-spacing (relaxation/pushes can bunch points), then a final bends-only relaxation
    head = P[0].copy()
    P = resample(P, step)
    P[0] = head
    # alternate bends-only relaxation with a bounded projection into the 1.3-3.2 mm band; clearance is also
    # checked against the whole myocardium (pulmonary trunk included) so no vessel sinks into a great vessel
    for _round in range(24):
        for _ in range(iters):
            bad = bad_set(P)
            if not bad:
                break
            Q = P.copy()
            for i in bad:
                Q[i] = 0.4 * P[i] + 0.3 * (P[i - 1] + P[i + 1])
            P = Q
        moved = 0
        for i in range(max(1, band_from), len(P)):
            loc, n = smooth_normal(bvh, P[i], 0.004)
            d = float(np.dot(P[i] - loc, n))
            if d > band[1]:
                P[i] = P[i] - n * min(d - (band[1] - 0.0003), 0.003)
                moved += 1
            elif d < band[0] or inside(bvh, P[i]):
                P[i] = loc + n * offset
                moved += 1
            if FULL_HEART_BVH is not None:
                loc2, _, _, d2 = FULL_HEART_BVH.find_nearest(Vector(P[i]))
                if d2 < 0.0014 or inside(FULL_HEART_BVH, P[i]):
                    _, n2 = smooth_normal(FULL_HEART_BVH, P[i], 0.003)
                    P[i] = np.array(loc2) + n2 * 0.0017
                    moved += 1
        if not moved and not bad_set(P):
            break
    return P


# =============================================================================== materials
def material(name, hex_color, rough=0.5, alpha=1.0, sheen=0.0, vcol=False, cull=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    rgb = list(srgb_to_lin(hex_rgb(hex_color))) + [1.0]
    bsdf.inputs["Base Color"].default_value = rgb
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Alpha"].default_value = alpha
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if vcol:                                          # AO in vertex colours multiplies base colour (renders)
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = rgb
        nt.links.new(attr.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    if alpha < 1.0:
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
        if hasattr(m, "blend_method"):
            m.blend_method = "BLEND"
    m.use_backface_culling = cull
    m.diffuse_color = rgb[:3] + [alpha]
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# =============================================================================== vertex-colour AO
def bake_ao(ob, bvh, max_dist, rays, strength, min_dist=0.0015):
    """Cheap hemisphere ray-cast AO -> 'Col' vertex colours (1 - strength * occlusion)."""
    me = ob.data
    V = verts_of(ob)
    nrm = np.empty(len(V) * 3)
    me.vertices.foreach_get("normal", nrm)
    nrm = nrm.reshape(-1, 3)
    rng = np.random.default_rng(0)
    dirs = unit(rng.normal(size=(rays, 3)))
    occ = np.zeros(len(V))
    for i, (p, n) in enumerate(zip(V, nrm)):
        o = Vector(p + n * 1e-4)
        hit = 0
        for d in dirs:
            d = d if d.dot(n) > 0 else -d
            loc, _, _, dist = bvh.ray_cast(o, Vector(0.6 * d + 0.4 * n), max_dist)
            if loc is not None and dist > min_dist:          # ignore self-hits in tiny creases
                hit += 1 - dist / max_dist
        occ[i] = hit / rays
    shade = 1 - strength * np.clip(occ * 1.6, 0, 1)
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col = np.repeat(shade[:, None], 4, 1)
    col[:, 3] = 1
    attr.data.foreach_set("color", col.ravel())
    me.color_attributes.active_color = attr


# =============================================================================== builders
class Builder:
    def __init__(self, amap, q, variant, source="sketchfab"):
        self.amap, self.q, self.variant, self.source = amap, q, variant, source
        self.coll = bpy.context.scene.collection
        self.objs = {}
        self.report = {"variant": variant, "heart_source": source}
        self.frame = HeartFrame(HEART_CENTROID_BODY)
        self.z_apex, self.terr_z = Z_APEX, TERRITORY_Z
        self.chambers = None

    def surf(self, th, zp):
        """Epicardial surface point at (theta deg, z'): parametric (procedural) or ray-cast onto the chambers
        of the Sketchfab heart (pulmonary trunk / great vessels excluded)."""
        if self.source == "procedural":
            return surface(self.frame, th, zp)
        th, zp = np.broadcast_arrays(np.asarray(th, float), np.asarray(zp, float))
        out = np.empty(th.shape + (3,))
        D = self.frame.dirs(th)
        for idx in np.ndindex(th.shape):
            d, o = D[idx], self.frame.c + zp[idx] * self.frame.ez
            loc, _, _, _ = self.surf_bvh.ray_cast(Vector(o + d * 0.25), Vector(-d), 0.26)
            if loc is None:
                loc = self.surf_bvh.find_nearest(Vector(o + d * 0.03))[0]
            out[idx] = loc
        return out

    @property
    def apex_point(self):
        return self.frame.c + Z_APEX * self.frame.ez if self.source == "procedural" else self._apex_pt

    # ---------------------------------------------------------------- heart
    def build_heart(self):
        if self.source == "sketchfab":
            return self.build_heart_sketchfab()
        q, fr = self.q, self.frame
        parts = [ventricle_mesh(fr, *q["param_n"])]
        # auricles (small ear-shaped blobs) + pulmonary trunk, blended by voxel remesh + smoothing;
        # the atria themselves are lobes of the parametric dome (see heart_radius)
        la_ax = np.stack([unit(fr.dirs(-8)), np.cross(fr.ez, unit(fr.dirs(-8))), fr.ez])
        parts.append(ellipsoid(fr.point(-8, 0.064, 0.036), (0.013, 0.006, 0.007), la_ax))    # left auricle
        ra_ax = np.stack([unit(fr.dirs(-140)), np.cross(fr.ez, unit(fr.dirs(-140))), fr.ez])
        parts.append(ellipsoid(fr.point(-145, 0.062, 0.031), (0.013, 0.007, 0.008), ra_ax))  # right auricle
        # pulmonary trunk stub: RV outflow, anterior-left of the aorta, heading up-left-posterior
        p0 = fr.point(-100, 0.040, 0.026)
        p1 = p0 + unit(fr.ez * 0.5 + np.array([0.45, 0.35, 0.55])) * 0.030
        self.pt_axis = (p0, p1)
        parts.append(tube(resample(np.array([p0, (p0 + p1) / 2, p1]), 0.004), 0.0125, 24, caps=True, cap_rings=4))
        V, F = merge(*parts)
        ob = new_obj("Heart_Myocardium", V, F, self.coll)
        finish(ob, voxel=q["heart_voxel"], smooth_iter=8, smooth_factor=0.5)
        finish(ob, target_tris=q["heart_tris"])
        # put the true myocardium centroid exactly at HEART_CENTROID_BODY (shift the frame with it)
        shift = HEART_CENTROID_BODY - verts_of(ob).mean(0)
        set_verts(ob, verts_of(ob) + shift)
        self.frame = HeartFrame(fr.c + shift)
        self.pt_axis = tuple(p + shift for p in self.pt_axis)
        self.objs["Heart_Myocardium"] = ob
        self.heart_bvh = bvh_of(ob)
        log("heart tris", tri_count(ob))

    def build_heart_sketchfab(self):
        import sketchfab_heart as SH
        sh = SH.SketchfabHeart(LONG_AXIS, HEART_CENTROID_BODY, self.coll, log).load().align().remember_cap()
        sh.seams(HeartFrame(sh.vent_centroid))
        parts = sh.split()
        sh.refine()
        sh.seam_tz(HeartFrame(sh.vent_centroid))
        sh.aorta_geometry()
        heart = parts["Heart_Myocardium"]
        if self.q["src_heart_tris"] and tri_count(heart) > self.q["src_heart_tris"]:
            m = heart.modifiers.new("decimate", "DECIMATE")         # UV-preserving collapse (lite only)
            m.ratio = self.q["src_heart_tris"] / tri_count(heart)
            m.use_collapse_triangulate = True
            apply_modifiers(heart)
        heart.data.shade_smooth()
        self.objs["Heart_Myocardium"] = heart
        self.sf, self.chambers = sh, sh.chambers
        self.frame = HeartFrame(sh.vent_centroid)
        self.surf_bvh = bvh_of(self.chambers)
        self.heart_bvh = self.surf_bvh                # vessels / territories / anchors use the chamber surface
        global FULL_HEART_BVH
        FULL_HEART_BVH = bvh_of(heart)
        C = verts_of(self.chambers)
        proj = (C - self.frame.c) @ self.frame.ez
        self.z_apex = float(proj.min())
        self._apex_pt = C[int(np.argmin(proj))]
        self.apex_landmark = sh.apex_world
        self.report.update(sh.report)
        log("sketchfab heart tris", tri_count(heart))

    # ---------------------------------------------------------------- aorta
    def build_aorta(self):
        if self.source == "sketchfab":
            return self.build_aorta_sketchfab()
        fr, q = self.frame, self.q
        V = verts_of(self.objs["Heart_Myocardium"])
        root = fr.point(-160, 0.060, 0.008)          # aortic root: right of the pulmonary trunk
        band = (V[:, 2] > root[2] - 0.12) & (V[:, 2] < root[2] + 0.02) & (V[:, 0] > -0.02) & (V[:, 0] < 0.06)
        y_desc = V[band, 1].max() + AORTA_R[0] + 0.004
        z0 = root[2]
        base_z = (fr.c + Z_BASE * fr.ez)[2]
        h = ARCH_APEX_ABOVE_BASE - (root[2] - base_z)        # arch apex height above the root
        sz = h / 0.064                                       # scale the previous arch profile vertically
        ctrl = np.array([
            root - np.array([0, 0, 0.012]),
            root + np.array([-0.006, -0.008, 0.026 * sz]),
            root + np.array([-0.002, -0.004, 0.048 * sz]),
            root + np.array([0.014, 0.016, 0.064 * sz]),
            root + np.array([0.032, 0.040, 0.058 * sz]),
            [root[0] + 0.042, y_desc, z0 + 0.030 * sz],
            [0.030, y_desc, z0 - 0.020],
            [0.022, y_desc, HEART_CENTROID_BODY[2] - 0.12],
            [0.014, 0.055, 1.02],
            [0.010, 0.048, 0.90],
        ])
        P = resample(catmull_rom(ctrl), q["aorta_step"])
        s = np.linspace(0, 1, len(P))
        R = AORTA_R[0] + (AORTA_R[1] - AORTA_R[0]) * s
        R *= 1 + 0.12 * np.exp(-((s - 0.02) / 0.03) ** 2)                 # sinus bulge at the root
        self.aorta_path, self.aorta_r = P, R
        self.report["arch_apex_above_heart_base_cm"] = round(float((P[:, 2].max() - base_z) * 100), 2)
        # once the aorta has emerged from the heart base it must never touch the heart again
        clear = np.array([(-1.0 if inside(self.heart_bvh, p) else 1.0) * self.heart_bvh.find_nearest(Vector(p))[3] - r
                          for p, r in zip(P, R)])
        emerged = int(np.argmax(clear > 0))
        self.report["aorta_emerges_at_arc_cm"] = round(float(np.sum(np.linalg.norm(np.diff(P[:emerged + 1], axis=0),
                                                                                     axis=1)) * 100), 2)
        self.report["aorta_min_clearance_from_heart_mm"] = round(float(clear[emerged:].min()) * 1000, 2)
        v, f = tube(P, R, q["aorta_segs"], caps=True, cap_rings=4)
        ob = new_obj("Aorta", v, f, self.coll)
        self.objs["Aorta"] = ob
        self.aorta_bvh = bvh_of(ob)
        self.root_path, self.root_r = P, R
        self.arch_top = P[np.argmax(P[:, 2])] + np.array([0, 0, R[np.argmax(P[:, 2])]])
        log("aorta tris", tri_count(ob))

    def build_aorta_sketchfab(self):
        sh, q = self.sf, self.q
        sh.extend_aorta(self.objs["Heart_Myocardium"], tube, catmull_rom, resample, segs=q["aorta_segs"],
                        step=q["aorta_step"])
        ob = sh.parts["Aorta"]
        ob.name = ob.data.name = "Aorta"
        self.objs["Aorta"] = ob
        self.aorta_bvh = bvh_of(ob)
        self.root_path, self.root_r = sh.root_path, sh.root_r
        self.aorta_path = np.vstack([sh.root_path, sh.desc_path])
        self.aorta_r = np.concatenate([sh.root_r, sh.desc_r])
        A = verts_of(ob)
        self.arch_top = A[np.argmax(A[:, 2])]
        # arch apex: highest horizontal slice that is still the arch tube (wider than the 3 branch stubs)
        apex_z = None
        for z in np.arange(A[:, 2].max(), A[:, 2].min(), -0.001):
            sl = A[np.abs(A[:, 2] - z) < 0.0008]
            if len(sl) > 10 and np.linalg.norm(sl[:, :2].max(0) - sl[:, :2].min(0)) > 0.035:
                apex_z = z
                break
        self.report["arch_outer_apex_z"] = round(float(apex_z), 4) if apex_z else None
        log("aorta tris", tri_count(ob))

    # ---------------------------------------------------------------- coronaries
    def _surface_path(self, ctrl_tz, start=None, lead=()):
        """Centreline through surface control points (theta, z'). `start` is a fixed first point (parent
        vessel or aortic sinus); `lead` are extra fixed points after it (radial exit from the aorta)."""
        fr, step, bvh = self.frame, self.q["vessel_step"], self.heart_bvh
        pts = [self.surf(t, z) for t, z in ctrl_tz]
        if not lead:
            P = resample(catmull_rom(np.array(([start] if start is not None else []) + pts)), step)
            fixed = [0] if start is not None else []
            P = snap_path(P, bvh, VESSEL_OFFSET, fixed=fixed)
            return limit_bends(P, bvh, VESSEL_OFFSET, fixed=fixed)
        # aortic origin: straight radial segment sinus -> exit, then a tangent-continuous Hermite lead-in
        # onto the snapped surface path; the join moves further along until every bend is under target.
        Ps = limit_bends(snap_path(resample(catmull_rom(np.array(pts)), step), bvh, VESSEL_OFFSET),
                         bvh, VESSEL_OFFSET)
        S0, E = np.asarray(start, float), np.asarray(lead[-1], float)
        radial = unit(E - S0)                                 # the curve leaves the sinus radially (no
                                                              # straight stub -> no kink at the wall)
        best, best_score = None, np.inf
        for j in range(1, len(Ps)):
            L = np.linalg.norm(Ps[j] - S0)
            if L > 0.045:
                break
            tj = unit(Ps[min(j + 1, len(Ps) - 1)] - Ps[j - 1])
            for m in (0.6, 0.9, 1.2):                          # tangent magnitudes to try
                H = hermite(S0, Ps[j], radial * L * m, tj * L * m, max(4, int(L / step) + 1))
                if any(inside(bvh, q) for q in H[1:-1]):      # never dip into the heart
                    continue
                P = np.vstack([H[:-1], Ps[j:]])
                score = max(bend_angles(P).max(), bend_angles(P, BEND_CHORD).max())
                if score < best_score:
                    best, best_score, n_lead = P, score, len(H) - 1
            if best_score <= BEND_TARGET_DEG:
                break
        if best is None:                                      # fall back to the plain snapped path
            best, n_lead = np.vstack([S0, Ps]), 1
        # final relaxation over the whole vessel; the surface band applies only from where it lies on the heart
        return limit_bends(best, bvh, VESSEL_OFFSET, fixed=[0], band_from=n_lead)

    def ostium(self, target, r_vessel):
        """Sinus (inside the aortic wall) + radial exit on the first root ring whose wall point on this
        vessel's side is clear of the heart, so the vessel never grazes or tunnels through tissue."""
        aP, aR = self.root_path, self.root_r
        for i in range(1, len(aP) - 1):
            axis = unit(aP[min(i + 1, len(aP) - 1)] - aP[max(i - 1, 0)])
            d = target - aP[i]
            d = unit(d - d.dot(axis) * axis)
            exit_ = aP[i] + d * (aR[i] + r_vessel + 0.0015)
            if not inside(self.heart_bvh, exit_) and self.heart_bvh.find_nearest(Vector(exit_))[3] > 0.0015:
                return aP[i] + d * aR[i] * 0.85, exit_
        raise RuntimeError("no clear ostium on the aortic root")

    def _coronary_paths_sketchfab(self):
        """Trace the painted coronary lines on the chamber surface, then build centrelines through them."""
        from vessel_trace import Unwrap, path_strength, support_smooth, vesselness
        fr, mm = self.frame, 1e-3
        th, zs, rgb, hit, ok = self.sf.unwrap(self.chambers, fr, self.z_apex + 0.001, self.z_apex + 0.135)
        U = Unwrap(th, zs, vesselness(rgb, ok), ok)
        tr = {}

        def smooth(name, t, z, along):
            st = path_strength(U, t, z)
            t2, z2 = support_smooth(t, z, st, along=along)
            tr[name] = (t2, z2, float(np.mean(st)))
            return t2, z2
        # anatomical windows from the source grooves (chamber-island seams)
        sm = self.sf.seam
        rvlv_t, rvlv_z = sm["LV|RV"]
        ant = rvlv_t < 60                                      # anterior IV groove part of the RV|LV seam
        pos = ~ant
        aivg = lambda z: float(np.interp(z, rvlv_z[ant], rvlv_t[ant]))            # noqa: E731
        pt = np.where(rvlv_t[pos] < 0, rvlv_t[pos] + 360, rvlv_t[pos])
        pivg = lambda z: float(np.interp(z, rvlv_z[pos], pt))                     # noqa: E731
        ra_rv_z = float(np.median(sm["RA|RV"][1])) if "RA|RV" in sm else 0.036
        top = float(rvlv_z[ant].max())
        self.report["grooves"] = {
            "anterior_IVG_theta_top_apex": [round(aivg(top), 1), round(aivg(self.z_apex + 0.004), 1)],
            "posterior_IVG_theta_top_apex": [round(pivg(float(rvlv_z[pos].max())), 1), round(pivg(self.z_apex + 0.004), 1)],
            "right_AV_groove_zmm": round(ra_rv_z * 1000, 1)}
        # LAD = the painted anterior descending vessel: strongest minimum-cost path over the anterior face
        # (theta -140..-30, pure anterior = -90) from the base to the apex. The RV/LV modelling seam is NOT
        # used here because the artist painted the LAD on the anterior face, not on that seam.
        z_bif = min(top, 0.016)                         # below the pulmonary-trunk / LV crease
        lad_t, lad_z = smooth("LAD", *U.trace_vertical(z_bif, self.z_apex + 0.004, -90,
                                                       lambda z: (-140, -30), start_tol=35), "z")
        lcx_t, lcx_z = smooth("LCX", *U.trace_horizontal(lad_t[0], 115, z_bif, lambda t: (0.012, 0.042),
                                                         start_tol=0.006), "t")
        # LCX: the painted line wobbles in the AV groove; fit z(theta) with a degree-4 Chebyshev polynomial
        # (5 coefficients <= 8 control points) so the vessel follows the groove in one gentle arc
        o = np.argsort(lcx_t)
        cheb = np.polynomial.Chebyshev.fit(np.asarray(lcx_t)[o], np.asarray(lcx_z)[o], 4)
        lcx_t = np.asarray(lcx_t)[o]
        lcx_z = np.clip(cheb(lcx_t), 0.012, 0.042)
        self.report["lcx_fit"] = dict(kind="Chebyshev degree 4", coefficients=5,
                                      max_residual_mm=round(float(np.abs(cheb(np.asarray(tr["LCX"][0])) -
                                                                         np.asarray(tr["LCX"][1])).max()) * 1000, 2))
        rca_start = aivg(top) - 30
        rca_t, rca_z = smooth("RCA", *U.trace_horizontal(rca_start, pivg(ra_rv_z) - 360, ra_rv_z,
                                                         lambda t: (ra_rv_z - 0.010, ra_rv_z + 0.010),
                                                         start_tol=0.006), "t")
        pda_t, pda_z = smooth("PDA", *U.trace_vertical(rca_z[-1], self.z_apex + 0.012, rca_t[-1] + 360,
                                                       lambda z: (pivg(z) - 18, pivg(z) + 18), start_tol=6), "z")

        def at(ts, zz, key, val):
            i = int(np.argmin(np.abs((zz if key == "z" else ts) - val)))
            return ts[i], zz[i]
        br = {}
        for name, z0, z1 in (("D1", 0.010, -0.020), ("D2", -0.006, -0.030)):
            t0 = at(lad_t, lad_z, "z", z0)[0]
            br[name] = smooth(name, *U.trace_vertical(z0, z1, t0, lambda z, t0=t0: (t0 + 3, t0 + 60), start_tol=3), "z")
        for name, t0 in (("OM1", 35), ("OM2", 70)):
            z0 = at(lcx_t, lcx_z, "t", t0)[1]
            br[name] = smooth(name, *U.trace_vertical(z0, -0.014, t0, lambda z, t0=t0: (t0 - 25, t0 + 25),
                                                      start_tol=3), "z")
        t_am = -150
        z0 = at(rca_t, rca_z, "t", t_am)[1]
        br["AM"] = smooth("AM", *U.trace_vertical(z0, -0.014, t_am, lambda z: (t_am - 25, t_am + 25), start_tol=3), "z")
        # RCA | LAD follows the traced LAD itself (a strip on its RV side), not the RV/LV modelling seam, so the
        # anterior septum / anterior wall under the painted LAD always belong to the LAD territory
        o = np.argsort(lad_z)
        self.terr_bounds = dict(lad_lcx=aivg(0.0) + 55, lcx_rca=pivg(0.0) - 70, rca_lad=aivg(0.0) - 30,
                                lad_path=(np.asarray(lad_z)[o], np.asarray(lad_t)[o]))
        self.report["painted_line_strength"] = {k: round(v[2], 3) for k, v in tr.items()}
        # painted LAD width (FWHM across theta) -> tubes ~10 % thicker than the painted line
        widths = []
        for t, z in list(zip(lad_t, lad_z))[::6]:
            r = np.linalg.norm(self.surf(t, z) - (fr.c + z * fr.ez))
            prof = np.array([U.v[U.row(z), U.col(t + dt)] for dt in np.arange(-6, 6.01, 0.5)])
            if prof.max() > 0.3:
                widths.append((prof > prof.max() / 2).sum() * 0.5 * np.pi / 180 * r)
        painted_w = float(np.median(widths)) if widths else 0.0
        self.report["painted_lad_width_mm"] = round(painted_w * 1000, 2)
        self.vessel_scale = max(1.0, 1.1 * painted_w / 2 / VESSEL_R["main"][0])

        def ctrl(ts, zz, every=0.003):                   # sub-sample a trace to ~3 mm control points
            P = self.surf(ts, zz)
            keep, acc = [0], 0.0
            for i in range(1, len(P)):
                acc += np.linalg.norm(P[i] - P[i - 1])
                if acc >= every:
                    keep.append(i)
                    acc = 0.0
            if keep[-1] != len(P) - 1:
                keep.append(len(P) - 1)
            return [(float(ts[i]), float(zz[i])) for i in keep]
        # LAD wraps ~1 cm around the apex onto the inferior wall
        za = self.z_apex
        lad_ctrl = ctrl(lad_t, lad_z) + [(lad_t[-1], za + 0.002), (lad_t[-1] + 180, za + 0.003),
                                         (lad_t[-1] + 180, za + 0.008)]
        bif_tz = lad_ctrl[0]
        loc, n = smooth_normal(self.heart_bvh, self.surf(*bif_tz), 0.004)
        bif = loc + n * VESSEL_OFFSET
        lad = self._surface_path(lad_ctrl[1:], start=bif)
        lcx = self._surface_path(ctrl(lcx_t, lcx_z)[1:], start=bif)
        lm_route = self._left_main(bif, lad, lcx)
        # The traced LAD origin lies ~3 cm from the left sinus. Anatomically the LM is short (8-12 mm), so the
        # bifurcation is moved onto the (clearance-checked) LM route LM_LENGTH beyond the ostium: the rest of that
        # route becomes the proximal LAD and the LCX is re-traced from the new bifurcation.
        cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(lm_route, axis=0), axis=1))])
        i0 = next(i for i, p_ in enumerate(lm_route) if not inside(self.aorta_bvh, p_))   # leaves the aortic wall
        s_bif = cum[i0] + LM_LENGTH
        k = int(np.clip(np.searchsorted(cum, s_bif), 2, len(lm_route) - 2))
        w = (s_bif - cum[k - 1]) / max(cum[k] - cum[k - 1], 1e-9)
        new_bif = lm_route[k - 1] + w * (lm_route[k] - lm_route[k - 1])     # exactly LM_LENGTH beyond the wall
        lm = np.vstack([lm_route[:k], new_bif])
        lad = limit_bends(np.vstack([new_bif, lm_route[k:], lad[1:]]), self.heart_bvh, VESSEL_OFFSET, fixed=[0],
                          band_from=len(lm_route) - k + 1)
        th_b = float(fr.local(new_bif)[0])
        lcx_c = [c for c in ctrl(lcx_t, lcx_z)[1:] if ((c[0] - th_b + 180) % 360) - 180 > 12]
        lcx = self._surface_path(lcx_c, start=new_bif)
        self.report["lm_length_mm"] = round(float(LM_LENGTH) * 1000, 1)       # centreline arc, aortic wall -> bif
        self.report["lm_bif_straight_from_wall_mm"] = round(float(np.linalg.norm(new_bif - lm_route[i0])) * 1000, 1)
        rca_c = ctrl(rca_t, rca_z) + ctrl(pda_t, pda_z)[1:]
        right_sinus, right_exit = self.ostium(self.surf(*rca_c[0]), VESSEL_R["main"][0])
        # surface bridge from the right ostium down to where the painted RCA begins (keeps the vessel on the
        # heart instead of spanning the gap in the air)
        th_e, z_e = (float(x) for x in fr.local(right_exit))
        t1, z1 = rca_c[0]
        dth = ((t1 - th_e + 180) % 360) - 180
        n_b = max(2, int(abs(dth) / 8))
        bridge = [(th_e + dth * k / (n_b + 1), z_e - 0.003 + (z1 - z_e + 0.003) * k / (n_b + 1))
                  for k in range(1, n_b + 1)]
        rca = self._surface_path(bridge + rca_c, start=right_sinus, lead=[right_exit])
        self.report["rca_bridge_points"] = len(bridge)
        paths = {"lm": lm, "lad": lad, "lcx": lcx, "rca": rca}
        branches = []
        for name, parent in (("D1", lad), ("D2", lad), ("OM1", lcx), ("OM2", lcx), ("AM", rca)):
            t, z = br[name]
            c = ctrl(t, z)
            i = int(np.argmin(np.linalg.norm(parent - self.surf(*c[0]), axis=1)))
            branches.append(self._surface_path(c[1:], start=parent[i]))
        self.av_z = float(np.median(np.concatenate([lcx_z[len(lcx_z) // 3:], rca_z])))
        base_z = float((fr.c + self.av_z * fr.ez)[2])                     # heart base = AV-groove plane centre
        r_arch = float(self.sf.arch_end[2])
        if self.report.get("arch_outer_apex_z") is not None:
            self.report["arch_apex_above_heart_base_cm"] = round((self.report["arch_outer_apex_z"] - r_arch - base_z) * 100, 2)
        dp, dr = self.sf.desc_path, self.sf.desc_r
        FH = FULL_HEART_BVH
        clear = [(-1.0 if inside(FH, p) else 1.0) * FH.find_nearest(Vector(p))[3] - r for p, r in zip(dp, dr)]
        start = int(np.argmax(np.array(clear) > 0))
        self.report["aorta_min_clearance_from_heart_mm"] = round(float(min(clear[start:])) * 1000, 2)
        self.trace_debug = dict(th=th, zs=zs, rgb=rgb, traces={k: (v[0], v[1]) for k, v in tr.items()})
        CACHE.mkdir(parents=True, exist_ok=True)                    # debug / documentation figure input
        np.savez_compressed(CACHE / f"trace_{self.variant}.npz", th=th, zs=zs, rgb=rgb, v=U.v,
                            **{f"tr_{k}": np.vstack([v[0], v[1]]) for k, v in tr.items()},
                            **{f"seam_{k.replace('|', '_')}": np.vstack(v) for k, v in self.sf.seam.items()})
        return paths, branches

    def _left_main(self, bif, lad, lcx):
        """Short smooth LM: leaves the left sinus radially and arrives at the bifurcation along the bisector
        of the LAD / LCX starting directions; candidates that clip the heart (incl. pulmonary trunk) are
        rejected and the smoothest one is kept."""
        step = min(self.q["vessel_step"], 0.0018)          # the short LM is sampled finely in both variants
        sinus, exit_ = self.ostium(bif, VESSEL_R["lm"][0])
        radial = unit(exit_ - sinus)
        t_end = unit(unit(lad[min(3, len(lad) - 1)] - lad[0]) + unit(lcx[min(3, len(lcx) - 1)] - lcx[0]))
        L = float(np.linalg.norm(bif - sinus))
        bvhs = [self.heart_bvh] + ([FULL_HEART_BVH] if FULL_HEART_BVH is not None else [])
        best, best_score = None, np.inf
        for m0 in (0.3, 0.5, 0.7, 0.9, 1.1, 1.4):
            for m1 in (0.2, 0.4, 0.6, 0.8, 1.0, 1.3):
                H = hermite(sinus, bif, radial * L * m0, t_end * L * m1, max(5, int(L / step) + 1))
                free = [q for q in H[2:-1] if self.aorta_bvh.find_nearest(Vector(q))[3] > 0.004]
                clip = sum(any(inside(bv, q) or bv.find_nearest(Vector(q))[3] < 0.0013 for bv in bvhs)
                           for q in free)
                clip += sum(min(bv.find_nearest(Vector(q))[3] for bv in bvhs) > 0.0036 for q in free
                            if self.aorta_bvh.find_nearest(Vector(q))[3] > 0.008)          # floating
                P = np.vstack([H, lad[1:3]])                    # judge the bend into the LAD too
                score = max(bend_angles(P).max(), bend_angles(P, BEND_CHORD).max()) + 40 * clip
                if score < best_score:
                    best, best_score = H, score
        # relaxation-only pass (no surface pushes) to take the last degrees off; endpoints stay pinned
        best = limit_bends(best, self.heart_bvh, VESSEL_OFFSET, fixed=[0, len(best) - 1], band_from=len(best) + 1)
        best[-1] = bif
        return best

    def _coronary_paths_procedural(self):
        fr = self.frame
        self.vessel_scale = 1.0
        surface = lambda _fr, t, z: self.surf(t, z)          # noqa: E731
        ostium = self.ostium
        left_sinus, left_exit = ostium(surface(fr, -28, 0.050), VESSEL_R["lm"][0])
        right_sinus, right_exit = ostium(surface(fr, -150, 0.042), VESSEL_R["main"][0])
        bif_tz = (-28, 0.050)

        lm = self._surface_path([(-20, 0.054), bif_tz], start=left_sinus, lead=[left_exit])
        bif = lm[-1]
        lad = self._surface_path([(-36, 0.046), (-48, 0.040)] +
                                 [(lad_theta(z), z) for z in np.linspace(0.030, -0.058, 10)] +
                                 [(-92, -0.0640), (88, -0.0632), (92, -0.0585)], start=bif)
        lcx = self._surface_path([(-20, 0.040), (-8, AV_GROOVE_Z), (10, AV_GROOVE_Z), (30, AV_GROOVE_Z),
                                  (50, AV_GROOVE_Z - 0.001), (70, AV_GROOVE_Z - 0.003)], start=bif)
        rca = self._surface_path([(-150, 0.040), (-165, AV_GROOVE_Z), (180, AV_GROOVE_Z), (160, AV_GROOVE_Z),
                                  (135, AV_GROOVE_Z), (112, AV_GROOVE_Z - 0.001)] +
                                 [(pivg_theta(z), z) for z in (0.018, 0.0, -0.020, -0.038)], start=right_sinus,
                                 lead=[right_exit])
        paths = {"lm": lm, "lad": lad, "lcx": lcx, "rca": rca}

        def branch(parent, tz_start, ctrl):
            target = surface(fr, *tz_start)
            i = int(np.argmin(np.linalg.norm(parent - target, axis=1)))
            return self._surface_path(ctrl, start=parent[i])
        branches = [
            branch(lad, (lad_theta(0.020), 0.020), [(-42, 0.004), (-30, -0.016), (-20, -0.034)]),
            branch(lad, (lad_theta(-0.006), -0.006), [(-56, -0.022), (-44, -0.040), (-36, -0.052)]),
            branch(lcx, (6, AV_GROOVE_Z), [(9, 0.012), (13, -0.008), (16, -0.028)]),
            branch(lcx, (42, AV_GROOVE_Z), [(46, 0.012), (51, -0.008), (55, -0.026)]),
            branch(rca, (-176, AV_GROOVE_Z), [(-173, 0.012), (-169, -0.008), (-166, -0.028)]),
        ]
        self.av_z = AV_GROOVE_Z
        return paths, branches

    def build_coronaries(self):
        fr, q = self.frame, self.q
        paths, branches = (self._coronary_paths_sketchfab() if self.source == "sketchfab"
                           else self._coronary_paths_procedural())
        lm, lad, lcx, rca = paths["lm"], paths["lad"], paths["lcx"], paths["rca"]
        segs = q["vessel_segs"]
        k = self.vessel_scale
        VR = VESSEL_R_SKETCHFAB if self.source == "sketchfab" else VESSEL_R

        def taper(P, r0, r1):
            return np.linspace(r0 * k, r1 * k, len(P))
        radii = {"lm": taper(lm, *VR["lm"]), "lad": taper(lad, *VR["main"]),
                 "lcx": taper(lcx, *VR["main"]), "rca": taper(rca, *VR["main"])}
        tubes = {
            "Coronary_LM": tube(lm, radii["lm"], segs),
            "Coronary_LAD": tube(lad, radii["lad"], segs),
            "Coronary_LCX": tube(lcx, radii["lcx"], segs),
            "Coronary_RCA": tube(rca, radii["rca"], segs),
            "Coronary_Branches": merge(*[tube(b, taper(b, *VR["branch"]), max(6, segs - 2)) for b in branches]),
        }
        for name, (v, f) in tubes.items():
            self.objs[name] = new_obj(name, v, f, self.coll)
        for key in ("lad", "lcx", "rca"):
            v, f = tube(paths[key], HIT_R, 6, caps=True, cap_rings=2)
            self.objs[f"Extra_Hit_{key.upper()}"] = new_obj(f"Extra_Hit_{key.upper()}", v, f, self.coll)
            # outline shell: same centreline, +0.6 mm, inverted normals (front faces culled -> silhouette)
            v, f = tube(paths[key], radii[key] + OUTLINE_EXTRA, segs, caps=True, cap_rings=2)
            ob = new_obj(f"Extra_Outline_{key.upper()}", v, f, self.coll)
            ob.data.flip_normals()
            ob.data.update()
            self.objs[f"Extra_Outline_{key.upper()}"] = ob
        self.report["vessel_radius_scale"] = round(float(k), 3)
        self.paths = paths
        self.branch_paths = branches
        # centreline distance to the myocardium (report)
        dist = {}
        for key, P in {**paths, **{f"branch{i}": b for i, b in enumerate(branches)}}.items():
            d = np.array([self.heart_bvh.find_nearest(Vector(p))[3] for p in P[1:]])
            dist[key] = dict(min_mm=round(d.min() * 1000, 2), median_mm=round(float(np.median(d)) * 1000, 2),
                             max_mm=round(d.max() * 1000, 2))
        self.report["centreline_to_myocardium"] = dist
        allp = {**paths, **{f"branch{i}": b for i, b in enumerate(branches)}}
        self.report["max_bend_deg"] = {k: dict(segments=round(float(bend_angles(P).max()), 1),
                                               chord_4mm=round(float(bend_angles(P, BEND_CHORD).max()), 1))
                                       for k, P in allp.items()}
        th = {k: [round(float(x), 1) for x in fr.local(paths[k][[1, len(paths[k]) // 2, -1]])[0]] for k in paths}
        self.report["coronary_theta_start_mid_end"] = th

    # ---------------------------------------------------------------- territories
    def build_territories(self):
        fr, q = self.frame, self.q
        if self.source == "sketchfab":                     # re-derived on this ventricle surface
            self.terr_z = (self.z_apex + 0.015, self.av_z - 0.006)
        zc, zt = self.terr_z
        surface = lambda _fr, t, z: self.surf(t, z)          # noqa: E731
        nz = max(4, int((zt - zc) / q["terr_dz"]))
        zs = np.linspace(zc, zt, nz)
        s = (zs - zc) / (zt - zc)
        tb = getattr(self, "terr_bounds", None)
        if tb:                                       # re-derived from this heart's grooves (AHA, right-dominant)
            b_ant = tb["lad_lcx"] + 4 * s            # LAD | LCX: anterolateral LV wall
            b_post = tb["lcx_rca"] + 8 * s           # LCX | RCA: inferolateral, short of the posterior IVG
            b_right = np.interp(zs, *tb["lad_path"]) - 15   # RCA | LAD: 15 deg on the RV side of the LAD
        else:
            b_ant = -18 + 4 * s            # LAD | LCX (anterolateral)
            b_post = 52 + 18 * s           # LCX | RCA (posterolateral)
            b_right = -105 - 10 * s        # RCA | LAD (right ventricle / anterior septum)
        self.terr_b = (b_ant, b_post, b_right, zs)
        spans = {"lad": (b_right, b_ant), "lcx": (b_ant, b_post), "rca": (b_post, b_right + 360)}

        def patch_thetas(t0, t1):
            n_t = max(4, int(np.max(t1 - t0) / q["terr_dtheta"]))
            return np.array([[t0[i] + (t1[i] - t0[i]) * j / (n_t - 1) for j in range(n_t)] for i in range(nz)])

        def patch(t0, t1):
            TH = patch_thetas(t0, t1)
            n_t = TH.shape[1]
            grid = np.array([[surface(fr, TH[i, j], zs[i]) for j in range(n_t)] for i in range(nz)])
            F = [(i * n_t + j, i * n_t + j + 1, (i + 1) * n_t + j + 1, (i + 1) * n_t + j)
                 for i in range(nz - 1) for j in range(n_t - 1)]
            return grid.reshape(-1, 3), F

        def cap():
            # the cap's top ring uses exactly the bottom-row vertices of the three patches, so the shared seam at
            # z' = zc is the same polyline on both sides (no slivers between differently sampled edges)
            th = np.unique(np.round(np.concatenate([patch_thetas(t0, t1)[0] for t0, t1 in spans.values()]) % 360, 6))
            th = th[np.concatenate([[True], np.diff(th) > 1e-4])]
            n_t = len(th)
            za = self.z_apex
            zc_s = np.linspace(za + 0.0015, zc, max(3, int((zc - za) / q["terr_dz"])))
            grid = np.array([[surface(fr, t, z) for t in th] for z in zc_s]).reshape(-1, 3)
            V = np.vstack([grid, self.apex_point])
            pole = len(V) - 1
            F = [(i * n_t + k, (i + 1) * n_t + k, (i + 1) * n_t + (k + 1) % n_t, i * n_t + (k + 1) % n_t)
                 for i in range(len(zc_s) - 1) for k in range(n_t)]
            F += [(pole, k, (k + 1) % n_t) for k in range(n_t)]
            return V, F

        for key, (t0, t1) in spans.items():
            v, f = patch(t0, t1)
            if key == "lad":
                v, f = merge((v, f), cap())
            v = np.array([(lambda r: r[0] + r[1] * TERRITORY_OFFSET)(smooth_normal(self.heart_bvh, p, 0.0015))
                          for p in v])
            name = f"Territory_{key.upper()}"
            ob = new_obj(name, v, f, self.coll, outward=False)
            me = ob.data                                  # open sheet: face normals must point away from the heart
            cen = np.array([p.center for p in me.polygons])
            nrm = np.array([p.normal for p in me.polygons])
            if np.mean(np.einsum("ij,ij->i", nrm, cen - fr.c)) < 0:
                me.flip_normals()
                me.update()
            self.objs[name] = ob
        self.feather_territories()
        self.report["territory_boundaries_deg"] = {"lad|lcx": [round(float(b_ant[0]), 1), round(float(b_ant[-1]), 1)],
                                                   "lcx|rca": [round(float(b_post[0]), 1), round(float(b_post[-1]), 1)],
                                                   "rca|lad": [round(float(b_right[0]), 1), round(float(b_right[-1]), 1)],
                                                   "apical_cap_below_zp": round(float(zc), 4),
                                                   "top_zp": round(float(zt), 4)}

    def feather_territories(self, width=TERRITORY_FEATHER):
        """Vertex-alpha feather (exported as COLOR_0 alpha): fade to 0 at outer edges and to 0.5 at
        boundaries shared with a neighbouring territory (two half-faded layers meet -> soft seam)."""
        from mathutils.kdtree import KDTree

        def kd(points):
            t = KDTree(len(points))
            for i, p in enumerate(points):
                t.insert(Vector(p), i)
            t.balance()
            return t

        def boundary_points(ob):
            me = ob.data
            cnt = {}
            for poly in me.polygons:
                for e in poly.edge_keys:
                    cnt[e] = cnt.get(e, 0) + 1
            pts = []
            for (a, b), c in cnt.items():
                if c == 1:
                    va, vb = np.array(me.vertices[a].co), np.array(me.vertices[b].co)
                    pts += [va, (va + vb) / 2]
            return np.array(pts)

        names = [f"Territory_{k}" for k in ("LAD", "LCX", "RCA")]
        bpts = {n: boundary_points(self.objs[n]) for n in names}
        for n in names:
            own = bpts[n]
            k_other = kd(np.vstack([bpts[m] for m in names if m != n]))
            shared = np.array([k_other.find(Vector(p))[2] < 0.0012 for p in own])
            outer = own[~shared]
            if n == "Territory_LAD" and len(outer):      # internal seam between the LAD patch and apical cap (z' = zc)
                zp = (outer - self.frame.c) @ self.frame.ez
                outer = outer[np.abs(zp - self.terr_z[0]) > 0.0015]
            k_out = kd(outer) if len(outer) else None
            k_sh = kd(own[shared]) if shared.any() else None
            V = verts_of(self.objs[n])
            alpha = np.ones(len(V))
            for i, p in enumerate(V):
                a = 1.0
                if k_out is not None:
                    a = min(a, smoothstep(k_out.find(Vector(p))[2] / width))
                if k_sh is not None:
                    a = min(a, 0.5 + 0.5 * smoothstep(k_sh.find(Vector(p))[2] / width))
                alpha[i] = a
            me = self.objs[n].data
            attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            col = np.ones((len(V), 4))
            col[:, 3] = alpha
            attr.data.foreach_set("color", col.ravel())
            me.color_attributes.active_color = attr
            self.report.setdefault("territory_alpha", {})[n] = dict(
                min=round(float(alpha.min()), 3), feathered_fraction=round(float((alpha < 0.999).mean()), 3))

    # ---------------------------------------------------------------- body shell
    def build_body(self):
        q = self.q
        # torso: loft of super-ellipses (z, half-width a, half-depth b, centre y)
        keys = np.array([
            [0.800, 0.040, 0.040, 0.010], [0.830, 0.150, 0.095, 0.010], [0.900, 0.172, 0.108, 0.012],
            [1.000, 0.150, 0.098, 0.008], [1.080, 0.140, 0.094, 0.006], [1.180, 0.152, 0.102, 0.008],
            [1.300, 0.170, 0.110, 0.010], [1.400, 0.185, 0.104, 0.012], [1.445, 0.180, 0.088, 0.014],
            [1.480, 0.120, 0.070, 0.014], [1.500, 0.060, 0.050, 0.012]])
        zs = np.linspace(0.80, 1.50, 60)
        n = 64
        ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
        e = 2 / 2.6
        cx, sy = np.sign(np.cos(ang)) * np.abs(np.cos(ang)) ** e, np.sign(np.sin(ang)) * np.abs(np.sin(ang)) ** e
        secs = []
        for z in zs:
            a, b, yc = (np.interp(z, keys[:, 0], keys[:, k]) for k in (1, 2, 3))
            secs.append(np.stack([a * cx, yc + b * sy, np.full(n, z)], -1))
        parts = [loft(secs)]
        parts.append(tube(resample(np.array([[0, 0.012, 1.45], [0, 0.016, 1.52], [0, 0.020, 1.59]]), 0.01),
                          0.055, 32))                                                      # neck
        parts.append(ellipsoid((0, 0.008, 1.648), (0.076, 0.094, 0.104), nu=48, nv=36))     # head
        for sx in (1, -1):
            arm = catmull_rom(np.array([[0.150 * sx, 0.012, 1.430], [0.215 * sx, 0.018, 1.400],
                                        [0.265 * sx, 0.030, 1.150], [0.305 * sx, 0.010, 0.905]]), 16)
            arm = resample(arm, 0.01)
            t = np.linspace(0, 1, len(arm))
            parts.append(tube(arm, np.interp(t, [0, 0.12, 0.5, 0.55, 1], [0.052, 0.050, 0.038, 0.037, 0.030]), 28))
            hand = (np.array([0.318 * sx, 0.006, 0.835]), (0.022, 0.042, 0.065))
            parts.append(ellipsoid(hand[0], hand[1], nu=24, nv=16))
            leg = resample(catmull_rom(np.array([[0.092 * sx, 0.012, 0.930], [0.098 * sx, 0.008, 0.700],
                                                 [0.102 * sx, 0.004, 0.480], [0.100 * sx, 0.018, 0.230],
                                                 [0.098 * sx, 0.026, 0.075]]), 16), 0.01)
            t = np.linspace(0, 1, len(leg))
            parts.append(tube(leg, np.interp(t, [0, 0.12, 0.48, 0.62, 0.86, 1],
                                             [0.088, 0.085, 0.056, 0.058, 0.040, 0.036]), 32))
            foot = resample(np.array([[0.098 * sx, 0.040, 0.040], [0.100 * sx, -0.050, 0.032],
                                      [0.102 * sx, -0.135, 0.028]]), 0.01)
            parts.append(tube(foot, np.interp(np.linspace(0, 1, len(foot)), [0, 1], [0.040, 0.030]), 20))
        self.leg_paths = []
        V, F = merge(*parts)
        ob = new_obj("Torso_Shell", V, F, self.coll)
        finish(ob, voxel=q["body_voxel"], smooth_iter=14, smooth_factor=0.6)
        finish(ob, target_tris=q["body_tris"])
        self.objs["Torso_Shell"] = ob
        self.shell_bvh = bvh_of(ob)
        log("body tris", tri_count(ob))

    # ---------------------------------------------------------------- organs
    def boolean(self, ob, src, offset, operation):
        """Boolean with a copy of `src` offset along its vertex normals (+ inflate, - shrink)."""
        V = verts_of(src)
        N = np.empty(len(V) * 3)
        src.data.vertices.foreach_get("normal", N)
        cut = new_obj("Extra_tmp_cutter", V + N.reshape(-1, 3) * offset,
                      [tuple(p.vertices) for p in src.data.polygons], self.coll)
        finish(cut, voxel=max(0.002, abs(offset) * 0.5))   # offsetting self-intersects in grooves -> re-manifold
        m = ob.modifiers.new("bool", "BOOLEAN")
        m.operation, m.object, m.solver = operation, cut, "EXACT"
        apply_modifiers(ob)
        bpy.data.objects.remove(cut)

    def organ(self, name, parts, obstacles, margin=0.006, shell_margin=0.008, smooth_iter=6):
        """Union of parts -> keep inside the (shrunken) body shell -> clear inflated obstacles
        (heart, aorta, previous organs) -> remesh + smooth -> clear again -> decimate."""
        q = self.q
        V, F = merge(*parts)
        ob = new_obj(name, V, F, self.coll)
        finish(ob, voxel=q["organ_voxel"], smooth_iter=2)
        shell = self.objs["Torso_Shell"]
        for rnd, scale in enumerate((1.0, 0.5)):
            self.boolean(ob, shell, -shell_margin * scale, "INTERSECT")
            for src in obstacles:
                self.boolean(ob, src, margin * scale, "DIFFERENCE")
            finish(ob, voxel=q["organ_voxel"], smooth_iter=smooth_iter if rnd == 0 else 1)
        finish(ob, target_tris=q["organ_tris"])
        drop_small_islands(ob, 50)
        self.objs[name] = ob
        log(name, "tris", tri_count(ob))
        return ob

    def solid_cutters(self):
        """The Sketchfab heart is an open, double-sided shell: a voxel-remeshed copy would be a thin skin, not a
        solid. Organs are therefore cleared against the convex hull of heart + arch and a tube around the
        descending-aorta extension (both closed)."""
        import bmesh
        H = verts_of(self.objs["Heart_Myocardium"])
        A = verts_of(self.objs["Aorta"])
        arch = A[A[:, 2] > H[:, 2].min() + 0.5 * (H[:, 2].max() - H[:, 2].min())]
        pts = np.vstack([H, arch])
        bm = bmesh.new()
        for p in pts:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts)
        me = bpy.data.meshes.new("Extra_tmp_hull")
        bm.to_mesh(me)
        bm.free()
        hull = bpy.data.objects.new("Extra_tmp_hull", me)
        self.coll.objects.link(hull)
        hull.data.update()
        v, f = tube(self.sf.desc_path, self.sf.desc_r, 24, caps=True, cap_rings=2)
        desc = new_obj("Extra_tmp_desc_cut", v, f, self.coll)
        return [hull, desc]

    def build_organs(self):
        cutters = self.solid_cutters() if self.source == "sketchfab" else []
        obst = list(cutters) or [self.objs["Heart_Myocardium"], self.objs["Aorta"]]   # copy: organs get appended
        lungs = []
        for sx, c, r in ((1, (0.095, 0.018, 1.300), (0.064, 0.090, 0.135)),
                         (-1, (-0.090, 0.018, 1.305), (0.068, 0.092, 0.140))):
            v, f = ellipsoid(c, r, nu=56, nv=40)
            v[:, 2] = np.maximum(v[:, 2], 1.185 + 0.03 * (v[:, 1] - 0.0) + 0.02 * np.abs(v[:, 0] - c[0]) / r[0])
            lungs.append((v, f))
        self.organ("Organ_Lungs", lungs, obst, margin=0.008)
        obst.append(self.objs["Organ_Lungs"])

        kid = []
        for sx, zc in ((1, 1.110), (-1, 1.092)):
            v, f = ellipsoid((0.080 * sx, 0.052, zc), (0.028, 0.019, 0.055), nu=36, nv=28)
            med = (v[:, 0] * sx) < 0.080
            v[med, 0] += sx * 0.010 * np.exp(-((v[med, 2] - zc) / 0.02) ** 2)      # hilum indent
            kid.append((v, f))
        self.organ("Organ_Kidneys", kid, obst)
        obst.append(self.objs["Organ_Kidneys"])

        pan = resample(catmull_rom(np.array([[-0.045, -0.005, 1.118], [-0.010, 0.000, 1.128],
                                             [0.040, 0.010, 1.140], [0.090, 0.022, 1.158]]), 16), 0.006)
        t = np.linspace(0, 1, len(pan))
        self.organ("Organ_Pancreas", [tube(pan, np.interp(t, [0, 0.25, 1], [0.022, 0.016, 0.011]), 20)], obst)
        obst.append(self.objs["Organ_Pancreas"])

        thy = [ellipsoid((0.017 * sx, -0.030, 1.505), (0.010, 0.008, 0.021), nu=24, nv=18) for sx in (1, -1)]
        thy.append(tube(resample(np.array([[-0.014, -0.036, 1.497], [0, -0.039, 1.497], [0.014, -0.036, 1.497]]),
                                 0.003), 0.0045, 12))
        self.organ("Organ_Thyroid", thy, [], shell_margin=0.006, smooth_iter=3)

        brain = [ellipsoid((0.031 * sx, -0.002, 1.668), (0.047, 0.072, 0.056), nu=40, nv=30) for sx in (1, -1)]
        brain.append(ellipsoid((0, 0.048, 1.612), (0.048, 0.028, 0.024), nu=32, nv=22))
        self.organ("Organ_Brain", brain, [], shell_margin=0.010)

        legs = []
        for sx in (1, -1):
            leg = resample(catmull_rom(np.array([[0.092 * sx, 0.012, 0.880], [0.098 * sx, 0.008, 0.700],
                                                 [0.102 * sx, 0.004, 0.480], [0.100 * sx, 0.018, 0.230],
                                                 [0.098 * sx, 0.024, 0.095]]), 16), 0.01)
            t = np.linspace(0, 1, len(leg))
            legs.append(tube(leg, 0.62 * np.interp(t, [0, 0.12, 0.48, 0.62, 0.86, 1],
                                                    [0.082, 0.083, 0.056, 0.058, 0.040, 0.036]), 24))
        self.organ("Organ_Legs", legs, [], shell_margin=0.008)
        for c in cutters:
            bpy.data.objects.remove(c)

    # ---------------------------------------------------------------- anchors + views
    def anchor_point(self, obj_name, direction=(0, -1, 0), from_point=None, offset=0.03):
        ob = self.objs[obj_name]
        bvh = bvh_of(ob)
        c = verts_of(ob).mean(0) if from_point is None else np.asarray(from_point)
        d = unit(direction)
        loc, _, _, _ = bvh.ray_cast(Vector(c + d * 1.0), Vector(-d))
        if loc is not None:
            return np.array(loc) + d * offset
        V = verts_of(ob)                                # ray passed through a gap (e.g. between lobes):
        return V[np.argmax(V @ d)] + d * offset          # use the most extreme vertex in that direction

    def build_anchors(self):
        fr = self.frame
        A = {}
        for key in ("lad", "lcx", "rca"):
            P = self.paths[key]
            mid = P[len(P) // 2]
            _, n = smooth_normal(self.heart_bvh, mid, 0.005)
            A[f"Anchor_{key.upper()}"] = mid + n * 0.03
        A["Anchor_Heart"] = self.anchor_point("Heart_Myocardium", (0.2, -1, 0.1))
        A["Anchor_Vessels"] = self.arch_top + np.array([0, 0, 0.03])
        k = int(np.argmin(np.abs(self.aorta_path[:, 2] - (HEART_CENTROID_BODY[2] - 0.02)) +
                          (self.aorta_path[:, 1] < 0.02)))
        A["Anchor_Blood"] = self.aorta_path[k] + np.array([0.0, 0, 0]) + unit([1.0, 0.6, 0]) * (self.aorta_r[k] + 0.03)
        A["Anchor_Lungs"] = self.anchor_point("Organ_Lungs", (0, -1, 0), from_point=(-0.09, 0.0, 1.32))
        A["Anchor_Kidneys"] = self.anchor_point("Organ_Kidneys", (0, 1, 0), from_point=(0.08, 0.05, 1.11))
        A["Anchor_Pancreas"] = self.anchor_point("Organ_Pancreas", (0, -1, 0))
        A["Anchor_Thyroid"] = self.anchor_point("Organ_Thyroid", (0, -1, 0))
        A["Anchor_Brain"] = self.anchor_point("Organ_Brain", (0, -1, 0.3))
        A["Anchor_Legs"] = self.anchor_point("Organ_Legs", (0, -1, 0), from_point=(0.10, 0.0, 0.62))
        A["Anchor_WholeBody"] = np.array([0.0, 0.010 - 0.60, 1.15])
        self.anchors = A
        # view presets: (subject centre, bounding radius, viewing direction from subject to camera)
        hv = verts_of(self.objs["Heart_Myocardium"])
        hc = hv.mean(0)
        hr = np.percentile(np.linalg.norm(hv - hc, axis=1), 99.5) + 0.006
        bv = verts_of(self.objs["Torso_Shell"])
        bc = (bv.min(0) + bv.max(0)) / 2
        br = (bv.max(0)[2] - bv.min(0)[2]) / 2 + 0.03
        self.views = {
            "Extra_View_Front": (hc, hr, unit([0.30, -1.0, 0.32])),
            "Extra_View_Left": (hc, hr, unit([1.0, -0.25, 0.12])),
            "Extra_View_Posterior": (hc, hr, unit([-0.45, 1.0, -0.30])),
            "Extra_View_Body": (bc, br, unit([0.55, -1.0, 0.10])),
        }

    # ---------------------------------------------------------------- finalise
    def finalise(self):
        amap = self.amap
        offset = -verts_of(self.objs["Heart_Myocardium"]).mean(0)       # centroid -> origin
        for ob in list(self.objs.values()) + ([self.chambers] if self.chambers else []):
            set_verts(ob, verts_of(ob) + offset)
        self.anchors = {k: v + offset for k, v in self.anchors.items()}
        self.views = {k: (c + offset, r, d) for k, (c, r, d) in self.views.items()}
        self.paths = {k: v + offset for k, v in self.paths.items()}
        self.branch_paths = [b + offset for b in self.branch_paths]
        self.offset = offset

        roles = {}
        for v in amap["vessels"]:
            for m in v["mesh_names"]:
                roles[m] = dict(key=v["key"], role="vessel", display_name=v["display_name"])
        for t in amap["territories"]["entries"]:
            for m in t["mesh_names"]:
                roles[m] = dict(key=t["key"], role="territory", display_name=f"{t['key'].upper()} territory")
        for ns in amap["neutral_structures"]:
            for m in ns["mesh_names"]:
                roles[m] = dict(key=ns["key"], role="neutral", display_name=ns["display_name"])
        for m in amap["heart"]["mesh_names"]:
            roles[m] = dict(key="heart", role="heart", display_name=amap["heart"]["display_name"])
        for r in amap["body_regions"]:
            for m in r["mesh_names"]:
                roles.setdefault(m, dict(key=r["region"], role="region", display_name=r["display_name"]))
        for k in ("LAD", "LCX", "RCA"):
            roles[f"Extra_Hit_{k}"] = dict(key=k.lower(), role="hit", display_name=f"{k} hit proxy")
            roles[f"Extra_Outline_{k}"] = dict(key=k.lower(), role="outline", display_name=f"{k} outline")
        neutral_hex = {m: ns["color"] for ns in amap["neutral_structures"] for m in ns["mesh_names"]}

        # materials (one Principled BSDF per mesh, MAT_<MeshName>)
        for name, ob in self.objs.items():
            if name.startswith("Coronary_"):
                p = PALETTE["Coronary"]
                mat = material(f"MAT_{name}", neutral_hex.get(name, p["color"]), p["rough"], cull=False)
            elif name.startswith("Territory_"):
                p = PALETTE["Territory"]
                mat = material(f"MAT_{name}", p["color"], p["rough"], alpha=p["alpha"], cull=False)
            elif name.startswith("Extra_Hit_"):
                mat = material(f"MAT_{name}", "#FFFFFF", 1.0, alpha=0.0)
            elif name.startswith("Extra_Outline_"):
                mat = material(f"MAT_{name}", "#FFF6E8", 1.0, alpha=0.0, cull=True)
            elif self.source == "sketchfab" and name in ("Heart_Myocardium", "Aorta"):
                mat = ob.active_material.copy()            # original Sketchfab material values + textures
                mat.name = f"MAT_{name}"
            elif name == "Torso_Shell":
                p = PALETTE["Torso_Shell"]
                mat = material(f"MAT_{name}", neutral_hex[name], p["rough"], alpha=p["alpha"], vcol=True)
            elif name == "Aorta":
                mat = material(f"MAT_{name}", neutral_hex[name], PALETTE["Aorta"]["rough"], vcol=True)
            elif name == "Heart_Myocardium":
                p = PALETTE[name]
                mat = material(f"MAT_{name}", p["color"], p["rough"], sheen=p["sheen"], vcol=True)
            else:
                p = PALETTE[name]
                mat = material(f"MAT_{name}", p["color"], p["rough"])
            assign(ob, mat)
            for k, v in roles.get(name, {}).items():
                ob[k] = v

        apex_lm = getattr(self, "apex_landmark", None)
        apex_lm = self.apex_point if apex_lm is None else apex_lm + offset
        self.objs["Heart_Myocardium"]["apex_gltf"] = [round(float(apex_lm[0]), 5), round(float(apex_lm[2]), 5),
                                                    round(float(-apex_lm[1]), 5)]

        def gl(P):                                        # Blender Z-up -> glTF Y-up, 0.1 mm precision
            return [[round(float(x), 4), round(float(z), 4), round(float(-y), 4)] for x, y, z in P]
        cl = {"Coronary_LAD": [gl(self.paths["lad"])], "Coronary_LCX": [gl(self.paths["lcx"])],
              "Coronary_RCA": [gl(self.paths["rca"])], "Coronary_LM": [gl(self.paths["lm"])],
              "Coronary_Branches": [gl(b) for b in self.branch_paths]}
        for n, lines in cl.items():
            self.objs[n]["centerlines_gltf"] = json.dumps(lines, separators=(",", ":"))

        # vertex-colour AO on heart, aorta, torso only (never on coronaries)
        if AO_STRENGTH > 0:
            t0 = time.time()
            ao = [("Torso_Shell", 0.12)]
            if self.source == "procedural":                # the Sketchfab textures already carry their shading
                ao += [("Heart_Myocardium", 0.025), ("Aorta", 0.03)]
            for n, dist in ao:
                bake_ao(self.objs[n], bvh_of(self.objs[n]), dist, self.q["ao_rays"], AO_STRENGTH)
            log(f"AO baked in {time.time() - t0:.1f}s")

        # hierarchy: Heart / Body groups at the origin (identity), flat beneath
        heart_g = bpy.data.objects.new("Heart", None)
        body_g = bpy.data.objects.new("Body", None)
        for g in (heart_g, body_g):
            self.coll.objects.link(g)
            g["role"] = "group"
        body_names = {"Torso_Shell"} | {n for n in self.objs if n.startswith("Organ_")}
        for name, ob in self.objs.items():
            ob.parent = body_g if name in body_names else heart_g
        heart_anchor_names = {"Anchor_LAD", "Anchor_LCX", "Anchor_RCA", "Anchor_Heart", "Anchor_Vessels"}
        for name, p in self.anchors.items():
            e = bpy.data.objects.new(name, None)
            e.empty_display_type, e.empty_display_size = "SPHERE", 0.01
            e.location = Vector(p)
            e["role"] = "anchor"
            self.coll.objects.link(e)
            e.parent = heart_g if name in heart_anchor_names else body_g
        vf = math.radians(RENDER["vfov_deg"])
        self.view_poses = {}
        for name, (c, r, d) in self.views.items():
            dist = r * RENDER["margin"] / math.tan(vf / 2)
            pos = c + d * dist
            fwd = unit(c - pos)
            up = np.array([0, 0, 1.0])
            right = unit(np.cross(fwd, up))
            up = np.cross(right, fwd)
            # glTF wants local -Z towards the target and +Y up. With the Y-up export conversion
            # (x, y, z) -> (x, z, -y) applied as a change of basis, that means Blender local +Y = forward
            # and Blender local +Z = up.
            rot = Matrix(np.stack([np.cross(fwd, up), fwd, up], 1).tolist())
            e = bpy.data.objects.new(name, None)
            e.empty_display_type, e.empty_display_size = "ARROWS", 0.03
            e.matrix_world = Matrix.Translation(Vector(pos)) @ rot.to_4x4()
            e["role"], e["target"], e["vfov_deg"] = "view", [float(x) for x in c], RENDER["vfov_deg"]
            self.coll.objects.link(e)
            e.parent = body_g if name == "Extra_View_Body" else heart_g
            self.view_poses[name] = (pos, c, up)
        self.report["triangles"] = {n: tri_count(ob) for n, ob in self.objs.items()}
        self.report["triangles_total"] = sum(self.report["triangles"].values())

    # ---------------------------------------------------------------- checks on the built scene
    def anatomy_checks(self):
        rep = self.report
        hv = verts_of(self.objs["Heart_Myocardium"])
        apex = hv[np.argmin((hv - hv.mean(0)) @ self.frame_final.ez)]       # measured on the final mesh
        apex_dir = unit(apex - hv.mean(0))
        rep["apex_direction_xyz"] = [round(float(x), 3) for x in apex_dir]
        rep["apex_is_left_anterior_inferior"] = bool(apex_dir[0] > 0 and apex_dir[1] < 0 and apex_dir[2] < 0)
        # territory coverage: rays from ventricular surface points along the normal
        terr = {k: bvh_of(self.objs[f"Territory_{k.upper()}"]) for k in ("lad", "lcx", "rca")}
        rng = np.random.default_rng(1)
        th_s = rng.uniform(-180, 180, 1500)
        z_s = rng.uniform(self.z_apex + 0.004, self.terr_z[1] - 0.002, 1500)
        pts = self.surf(th_s, z_s)
        # exclude samples that fall into openings of the source mesh (great-vessel orifices under the pulmonary
        # trunk): their ray lands far inside the ring (radius < 75 % of the ring median at that height)
        rad = np.linalg.norm((pts - self.frame.c) - np.outer((pts - self.frame.c) @ self.frame.ez, self.frame.ez), axis=1)
        zbin = np.round(z_s / 0.002).astype(int)
        med = {zb: np.median(rad[zbin == zb]) for zb in np.unique(zbin)}
        on_surface = np.array([r >= 0.75 * med[zb] for r, zb in zip(rad, zbin)])
        rep["territory_samples_in_openings"] = int((~on_surface).sum())
        th_s, z_s, pts = th_s[on_surface], z_s[on_surface], pts[on_surface]
        counts = []
        for p in pts:
            loc, n = smooth_normal(self.heart_bvh_final, p, 0.0015)
            hits = 0
            for b in terr.values():
                h = b.ray_cast(Vector(loc - n * 0.002), Vector(n), 0.006)
                hits += h[0] is not None
            counts.append(hits)
        counts = np.array(counts)
        # second look with a long two-sided ray: separates real holes from sheets passing under an overhang
        long_hits = []
        for p, c in zip(pts, counts):
            if c:
                continue
            loc, n = smooth_normal(self.heart_bvh_final, p, 0.0015)
            hit = any(b.ray_cast(Vector(loc - n * 0.012), Vector(n), 0.024)[0] is not None for b in terr.values())
            long_hits.append(hit)
        rep["territory_gap_long_ray_resolved"] = int(sum(long_hits))
        # exact coverage in (theta, z') parameter space (the patches share their boundary curves)
        zc, zt = self.terr_z
        ba, bp, br_, zs_b = self.terr_b
        z_g = np.linspace(self.z_apex, zt, 200)
        b_ant = np.interp(z_g, zs_b, ba)[:, None]
        b_post = np.interp(z_g, zs_b, bp)[:, None]
        b_right = np.interp(z_g, zs_b, br_)[:, None]
        th_g, z_g = np.meshgrid(np.linspace(-180, 180, 721), z_g)
        t = th_g
        tt = np.where(t < b_right, t + 360, t)                    # continuous theta starting at b_right
        lad = ((tt >= b_right) & (tt < b_ant)) | (z_g < zc)
        lcx = (tt >= b_ant) & (tt < b_post) & (z_g >= zc)
        rca = (tt >= b_post) & (tt < b_right + 360) & (z_g >= zc)
        n_cov = lad.astype(int) + lcx + rca
        rep["territory_param_gap_fraction"] = float((n_cov == 0).mean())
        rep["territory_param_overlap_fraction"] = float((n_cov > 1).mean())
        rep["territory_gap_fraction_short_ray"] = round(float((counts == 0).mean()), 4)
        rep["territory_gap_fraction"] = round(float(((counts == 0).sum() - sum(long_hits)) / len(counts)), 4)
        rep["territory_overlap_fraction"] = round(float((counts > 1).mean()), 4)
        rep["territory_gap_samples_theta_zmm"] = [[round(float(t), 1), round(float(z) * 1000, 1)]
                                                 for t, z, c in zip(th_s, z_s, counts) if c == 0][:12]
        return rep


# =============================================================================== scene / export / render
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_clinical_texture(b):
    """Clinical variant base colour: painted vessel lines softened (dark thin lines replaced by the local
    average), saturation -55 %, lifted toward a warm muted tissue tone. Realistic textures are untouched."""
    from vessel_trace import box_blur
    mat = b.objs["Heart_Myocardium"].active_material
    img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and "baseColor" in n.image.name)
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H, W, 4).astype(np.float64)
    rgb = px[:, :, :3]
    blur = np.stack([box_blur(rgb[:, :, k], 6, 6) for k in range(3)], -1)
    L, Lb = rgb.mean(2), blur.mean(2)
    m = box_blur(np.clip((Lb - L - 0.015) / 0.06, 0, 1), 2, 2)[:, :, None]
    rgb = rgb * (1 - m) + blur * m
    gray = rgb.mean(2, keepdims=True)
    rgb = gray + (1 - CLINICAL["desaturate"]) * (rgb - gray)
    tone = np.array(hex_rgb(CLINICAL["tone"]))
    rgb = (1 - CLINICAL["tone_mix"]) * rgb + CLINICAL["tone_mix"] * tone
    out = np.concatenate([np.clip(rgb, 0, 1), np.ones((H, W, 1))], -1).astype(np.float32)
    clin = bpy.data.images.new("Heart_Tex_baseColor_clinical", W, H)
    clin.pixels.foreach_set(out.ravel())
    CACHE.mkdir(parents=True, exist_ok=True)
    clin.filepath_raw = str(CACHE / "clinical_baseColor.png")
    clin.file_format = "PNG"
    clin.save()
    b.clinical_image = clin
    return CACHE / "clinical_baseColor.png"


def export(path, b):
    """Blender -> raw glb (PNG textures, no compression) -> gltf_post.mjs (variants, attribution, alpha) ->
    `npx gltf-transform resize | webp | draco` -> final glb."""
    import shutil
    import subprocess
    path.parent.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    raw = CACHE / f"_raw_{path.stem}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(raw), export_format="GLB", export_yup=True, export_apply=True, export_extras=True,
        export_vertex_color="ACTIVE", export_cameras=False, export_lights=False, use_selection=False,
        export_image_format="AUTO", export_draco_mesh_compression_enable=False)
    if b.source == "sketchfab":
        import sketchfab_heart as SH
        clinical = str(make_clinical_texture(b) if not getattr(b, "clinical_image", None)
                       else CACHE / "clinical_baseColor.png")
        attribution, mods = SH.ATTRIBUTION, SH.MODIFICATIONS
    else:
        clinical, attribution, mods = "", "Procedurally generated in this repo (blender/build_heart.py), CC0", ""
    npx = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
    node = shutil.which("node") or "node"
    t1, t2, t3 = (CACHE / f"_{k}_{path.stem}.glb" for k in ("v", "r", "w"))
    steps = [[node, str(ROOT / "blender" / "gltf_post.mjs"), str(raw), str(t1), clinical, attribution, mods]]
    if b.source == "sketchfab":
        steps += [[npx, "gltf-transform", "resize", str(t1), str(t2), "--width", str(b.q["tex_size"]),
                   "--height", str(b.q["tex_size"])],
                  [npx, "gltf-transform", "webp", str(t2), str(t3), "--quality", "90"]]
    else:
        t3 = t1
    steps += [[npx, "gltf-transform", "draco", str(t3), str(path), "--quantize-position", "14",
               "--quantize-normal", "10", "--quantize-color", "8", "--quantize-texcoord", "12"]]
    for cmd in steps:
        r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"{' '.join(cmd[:3])} failed:\n{r.stdout}\n{r.stderr}")
    log("exported", path, f"{path.stat().st_size / 1e6:.2f} MB")


def build_variant(amap, variant, source="sketchfab"):
    reset_scene()
    q = QUALITY[variant]
    b = Builder(amap, q, variant, source)
    t0 = time.time()
    b.build_heart()
    b.build_aorta()
    b.build_coronaries()
    b.build_territories()
    b.build_body()
    b.build_organs()
    b.build_anchors()
    b.finalise()
    b.frame_final = HeartFrame(b.frame.c + b.offset)
    b.frame = b.frame_final
    if b.chambers is not None:
        b.surf_bvh = bvh_of(b.chambers)
        b.heart_bvh_final = b.surf_bvh
    else:
        b.heart_bvh_final = bvh_of(b.objs["Heart_Myocardium"])
    b.anatomy_checks()
    if b.chambers is not None:                        # helper surface is never exported
        bpy.data.objects.remove(b.chambers)
        b.chambers = None
    log(f"{variant} built in {time.time() - t0:.0f}s, {b.report['triangles_total']} triangles")
    return b


# ------------------------------------------------------------------------------- renders
def setup_render(res=None):
    """Cycles with the shared viewer look: charcoal radial background for camera rays, CC0 studio HDRI for
    lighting/reflections, ACES-style view transform."""
    sc = bpy.context.scene
    look = VIEWER_LOOK
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = RENDER["samples"]
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res or RENDER["res"]
    sc.render.film_transparent = True              # background composited afterwards (untone-mapped, like CSS)
    used = None
    for vt in ("ACES 2.0", "ACES 1.3", "ACES", "AgX"):      # ACES if this Blender build has it, else AgX
        try:
            sc.view_settings.view_transform = vt
            used = vt
            break
        except TypeError:
            continue
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    look.setdefault("blender", {})["view_transform"] = used
    world = bpy.data.worlds.new("Extra_World")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(ROOT / look["environment"]["hdri"]), check_existing=True)
    bg_light = nt.nodes.new("ShaderNodeBackground")
    bg_light.inputs["Strength"].default_value = look["environment"]["intensity"]
    nt.links.new(env.outputs["Color"], bg_light.inputs["Color"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (0.5, 0.5, 0.0)
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    sc_ = nt.nodes.new("ShaderNodeMath")
    sc_.operation = "DIVIDE"
    sc_.inputs[1].default_value = look["background"]["radius"]
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = list(srgb_to_lin(hex_rgb(look["background"]["center"]))) + [1]
    ramp.color_ramp.elements[1].color = list(srgb_to_lin(hex_rgb(look["background"]["edge"]))) + [1]
    bg_cam = nt.nodes.new("ShaderNodeBackground")
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tc.outputs["Window"], sub.inputs[0])
    nt.links.new(sub.outputs[0], ln.inputs[0])
    nt.links.new(ln.outputs["Value"], sc_.inputs[0])
    nt.links.new(sc_.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg_cam.inputs["Color"])
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(bg_light.outputs[0], mix.inputs[1])
    nt.links.new(bg_cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def place_rig(pos, target, up, scale):
    for n in [o.name for o in bpy.data.objects if o.name.startswith("Extra_Render_")]:
        bpy.data.objects.remove(bpy.data.objects[n])
    cam_d = bpy.data.cameras.new("Extra_Render_Cam")
    cam_d.sensor_fit = "VERTICAL"
    cam_d.angle_y = math.radians(RENDER["vfov_deg"])
    cam_d.clip_start, cam_d.clip_end = 0.005, 50
    cam = bpy.data.objects.new("Extra_Render_Cam", cam_d)
    bpy.context.scene.collection.objects.link(cam)
    fwd = unit(target - pos)
    right = unit(np.cross(fwd, up))
    u = np.cross(right, fwd)
    cam.matrix_world = Matrix.Translation(Vector(pos)) @ Matrix(np.stack([right, u, -fwd], 1).tolist()).to_4x4()
    bpy.context.scene.camera = cam
    d = np.linalg.norm(pos - target)
    back = -fwd
    for L in VIEWER_LOOK["lights"]:                     # camera-space directions (x right, y up, z to viewer)
        name, (dx, dy, dz) = L["name"], L["direction"]
        offs = dx * right + dy * u + dz * back
        ld = bpy.data.lights.new(f"Extra_Render_{name}", "AREA")
        ld.size = L["size_rel"] * d
        ld.energy = L["cycles_irradiance"] * (1.1 * d) ** 2 * scale     # ~constant irradiance at the subject
        ld.color = hex_rgb(L["color"])
        lo = bpy.data.objects.new(f"Extra_Render_{name}", ld)
        bpy.context.scene.collection.objects.link(lo)
        lp = target + unit(offs) * d * 1.1
        f2 = unit(target - lp)
        r2 = unit(np.cross(f2, [0, 0, 1.0]))
        u2 = np.cross(r2, f2)
        lo.matrix_world = Matrix.Translation(Vector(lp)) @ Matrix(np.stack([r2, u2, -f2], 1).tolist()).to_4x4()


def visibility(b, body=False, territories=False):
    for name, ob in b.objs.items():
        hidden = name.startswith(("Extra_Hit_", "Extra_Outline_"))
        if name.startswith("Territory_"):
            hidden = not territories
        if name == "Torso_Shell" or name.startswith("Organ_"):
            hidden = not body
        ob.hide_render = hidden


def composite_background(path):
    """Alpha-composite the render over the viewer_look radial gradient (exact sRGB colours)."""
    img = bpy.data.images.load(str(path), check_existing=False)
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H, W, 4)
    bg = VIEWER_LOOK["background"]
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H / 2) / W) ** 2) / bg["radius"]
    t = np.clip(r, 0, 1)[..., None]
    grad = (1 - t) * np.array(hex_rgb(bg["center"])) + t * np.array(hex_rgb(bg["edge"]))
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + grad * (1 - a)
    px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def render(path):
    bpy.context.scene.render.filepath = str(path)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    if bpy.context.scene.render.film_transparent:
        composite_background(path)
    log("rendered", path.name, f"{time.time() - t0:.0f}s")


def set_color(ob, hex_color, emission=0.0):
    bsdf = ob.active_material.node_tree.nodes["Principled BSDF"]
    lin = list(srgb_to_lin(hex_rgb(hex_color))) + [1]
    bsdf.inputs["Base Color"].default_value = lin
    if emission:
        bsdf.inputs["Emission Color"].default_value = lin
        bsdf.inputs["Emission Strength"].default_value = emission


def set_look(b, look):
    """Realistic = original Sketchfab materials. Clinical = clinical base colour, roughness 0.65, normal 0.4
    (the same values gltf_post.mjs writes into the KHR_materials_variants 'clinical' variant)."""
    if b.source != "sketchfab":
        return
    if not hasattr(b, "look_mats"):
        b.look_mats = {}
        for n in ("Heart_Myocardium", "Aorta"):
            real = b.objs[n].active_material
            clin = real.copy()
            clin.name = f"{real.name}_clinical"
            nt = clin.node_tree
            bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
            for node in nt.nodes:
                if node.type == "TEX_IMAGE" and "baseColor" in node.image.name:
                    node.image = b.clinical_image
                if node.type == "NORMAL_MAP":
                    node.inputs["Strength"].default_value = CLINICAL["normal_scale"]
            for sock in ("Roughness", "Metallic"):
                for link in list(bsdf.inputs[sock].links):
                    nt.links.remove(link)
            bsdf.inputs["Roughness"].default_value = CLINICAL["roughness"]
            bsdf.inputs["Metallic"].default_value = 0.0
            b.look_mats[n] = {"realistic": real, "clinical": clin}
    for n, mats in b.look_mats.items():
        b.objs[n].material_slots[0].material = mats[look]


def outline_material(hex_color):
    """Cycles stand-in for the app's outline: the inverted shell shows only where it extends past the vessel
    (front-facing = transparent, back-facing = emissive)."""
    m = bpy.data.materials.new("Extra_Render_outline")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = list(srgb_to_lin(hex_rgb(hex_color))) + [1]
    em.inputs["Strength"].default_value = 2.5
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(em.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], o.inputs["Surface"])
    return m


def do_renders(b, out_dir, demo_colors, lite=False):
    setup_render()
    out_dir.mkdir(parents=True, exist_ok=True)
    if lite:
        set_look(b, "realistic")
        visibility(b)
        place_rig(*b.view_poses["Extra_View_Front"], 1.0)
        render(out_dir / "_lite_front.png")
        return
    looks = ("realistic", "clinical") if b.source == "sketchfab" else ("realistic",)
    for look in looks:
        sfx = "" if look == "realistic" else "_clinical"
        set_look(b, look)
        for view, fname in (("Extra_View_Front", "heart_front"), ("Extra_View_Left", "heart_left"),
                            ("Extra_View_Posterior", "heart_posterior")):
            visibility(b)
            place_rig(*b.view_poses[view], 1.0)
            render(out_dir / f"{fname}{sfx}.png")
        visibility(b, body=True)
        place_rig(*b.view_poses["Extra_View_Body"], 1.0)
        render(out_dir / f"body_front{sfx}.png")
        if demo_colors:
            saved = {}
            for key in ("lad", "lcx", "rca"):
                ob = b.objs[f"Coronary_{key.upper()}"]
                flag = demo_colors.get(f"{key}_flag")
                set_color(ob, demo_colors[key], 0.8 if flag else 0)
                if flag:                                   # flagged: glow + outline
                    ol = b.objs[f"Extra_Outline_{key.upper()}"]
                    saved[ol.name] = ol.material_slots[0].material
                    ol.material_slots[0].material = outline_material("#FFF3E0")
            visibility(b)
            for name in saved:
                b.objs[name].hide_render = False
            place_rig(*b.view_poses["Extra_View_Front"], 1.0)
            render(out_dir / f"heart_demo_risk{sfx}.png")
            for name, m in saved.items():
                b.objs[name].material_slots[0].material = m
            for key in ("lad", "lcx", "rca"):
                ob = b.objs[f"Territory_{key.upper()}"]
                set_color(ob, demo_colors[key])
                nt = ob.active_material.node_tree
                if not any(n.type == "VERTEX_COLOR" for n in nt.nodes):
                    vc = nt.nodes.new("ShaderNodeVertexColor")
                    vc.layer_name = "Col"
                    mul = nt.nodes.new("ShaderNodeMath")
                    mul.operation = "MULTIPLY"
                    mul.inputs[1].default_value = PALETTE["Territory"]["alpha"]
                    nt.links.new(vc.outputs["Alpha"], mul.inputs[0])
                    nt.links.new(mul.outputs[0], nt.nodes["Principled BSDF"].inputs["Alpha"])
            visibility(b, territories=True)
            render(out_dir / f"territories_demo{sfx}.png")
            for key in ("lad", "lcx", "rca"):                # restore neutral base colours
                set_color(b.objs[f"Coronary_{key.upper()}"], PALETTE["Coronary"]["color"])
                bsdf = b.objs[f"Coronary_{key.upper()}"].active_material.node_tree.nodes["Principled BSDF"]
                bsdf.inputs["Emission Strength"].default_value = 0.0
                set_color(b.objs[f"Territory_{key.upper()}"], PALETTE["Territory"]["color"])
    set_look(b, "realistic")
    if b.source == "sketchfab":
        render_compare(b, out_dir)
    visibility(b)


def render_compare(b, out_dir):
    """Our realistic heart from the Sketchfab default front view (same viewing direction relative to the
    model, same portrait framing as reference/01_front.jpg) -> composed next to the reference by make_all."""
    R = b.sf.R
    d = unit(R @ np.array([0, -1.0, 0.10]))
    up = unit(R @ np.array([0, 0, 1.0]))
    hv = np.vstack([verts_of(b.objs["Heart_Myocardium"]), verts_of(b.objs["Aorta"])])
    hv = hv[hv[:, 2] > np.percentile(verts_of(b.objs["Heart_Myocardium"])[:, 2], 0)]    # heart + arch region
    c = (hv.min(0) + hv.max(0)) / 2
    r = np.percentile(np.linalg.norm(verts_of(b.objs["Heart_Myocardium"]) - c, axis=1), 99.5)
    dist = r * 1.12 / math.tan(math.radians(RENDER["vfov_deg"]) / 2)
    setup_render(res=(800, 898))
    visibility(b)
    place_rig(c + d * dist, c, up, 1.0)
    render(out_dir / "_ours_front_for_compare.png")
    setup_render()


def render_source_views(out_dir):
    """6 orthographic views of the untouched source model -> artifacts/figures/src_*.png (inspection)."""
    import sketchfab_heart as SH
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(SH.SRC_GLTF))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 700
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.25, 0.25, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type, cam.data.ortho_scale = "ORTHO", 1.8
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3
    sc.collection.objects.link(sun)
    for name, dv in {"front": (0, -1, 0), "back": (0, 1, 0), "left": (1, 0, 0), "right": (-1, 0, 0),
                     "top": (0, 0, 1), "bottom": (0, 0, -1)}.items():
        pos = np.array(dv, float) * 3
        f = unit(-pos)
        upv = np.array([0, 1.0, 0]) if abs(f[2]) > 0.99 else np.array([0, 0, 1.0])
        rr = unit(np.cross(f, upv))
        uu = np.cross(rr, f)
        M = Matrix.Translation(Vector(pos)) @ Matrix(np.stack([rr, uu, -f], 1).tolist()).to_4x4()
        cam.matrix_world = M
        sun.matrix_world = Matrix.Translation(Vector(pos + np.array([0.5, 0, 0.5]))) @ M.to_3x3().to_4x4()
        sc.render.filepath = str(out_dir / f"src_{name}.png")
        bpy.ops.render.render(write_still=True)


# =============================================================================== main
def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "artifacts" / "heart.glb"))
    ap.add_argument("--lite", default=str(ROOT / "artifacts" / "heart_lite.glb"))
    ap.add_argument("--blend", default=str(ROOT / "blender" / "heart_source.blend"))
    ap.add_argument("--renders", default="")
    ap.add_argument("--demo-colors", default="")
    ap.add_argument("--report", default=str(ROOT / "artifacts" / "asset_build_report.json"))
    ap.add_argument("--heart-source", choices=("sketchfab", "procedural"), default="sketchfab")
    a = ap.parse_args(argv)
    for k in ("out", "lite", "blend", "renders", "report"):          # Blender resolves relative paths oddly
        if getattr(a, k):
            setattr(a, k, str(Path(getattr(a, k)).resolve()))
    amap = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    demo = json.loads(a.demo_colors) if a.demo_colors else {}
    reports = {}
    LOOK_PATH.write_text(json.dumps(VIEWER_LOOK, indent=1), encoding="utf-8")
    if a.renders and a.heart_source == "sketchfab":
        render_source_views(Path(a.renders))
    b = build_variant(amap, "lite", a.heart_source)
    export(Path(a.lite), b)
    reports["lite"] = b.report
    if a.renders:
        do_renders(b, Path(a.renders), demo, lite=True)
    b = build_variant(amap, "full", a.heart_source)
    export(Path(a.out), b)
    reports["full"] = b.report
    if a.renders:
        do_renders(b, Path(a.renders), demo)
    for k, v in b.anchors.items():
        reports.setdefault("anchors", {})[k] = [round(float(x), 4) for x in v]
    Path(a.blend).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.blend)), compress=True)
    Path(a.report).write_text(json.dumps(reports, indent=1, default=float), encoding="utf-8")
    LOOK_PATH.write_text(json.dumps(VIEWER_LOOK, indent=1), encoding="utf-8")   # + the view transform used
    log("report", json.dumps({v: {k: r[k] for k in r if k != "triangles"} for v, r in reports.items()
                              if v in ("full", "lite")}, indent=1))


if __name__ == "__main__":
    main()
