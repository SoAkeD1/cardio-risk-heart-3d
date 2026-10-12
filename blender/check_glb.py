"""Re-import each exported .glb in a fresh Blender scene and verify the Step 6 contract.

    blender -b --factory-startup -P blender/check_glb.py -- artifacts/heart.glb artifacts/heart_lite.glb

Prints objects, triangles (per mesh + total), file size, materials per mesh, Draco, heart centroid,
Y-up, view-preset aim, anatomy checks, organ containment and anchor placement. Exit code 1 on failure.
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
AMAP = json.loads((ROOT / "artifacts" / "anatomy_map.json").read_text(encoding="utf-8"))
MAX_BEND_DEG = 35.0
MIN_ISLAND_TRIS = 50
CONTRACT_PREFIX = ("Coronary_", "Territory_", "Organ_", "Heart_", "Aorta", "Torso_", "Extra_Hit_")
BUDGET = {"heart.glb": (150_000, 10.0), "heart_lite.glb": (60_000, 4.0)}
TRANSLUCENT = ("Torso_Shell", "Territory_", "Extra_Hit_", "Extra_Outline_")
TEX_SIZE = {"heart.glb": 2048, "heart_lite.glb": 1024}
SKETCHFAB = next((s_ for s_ in AMAP["asset"]["sources"] if s_["name"] == "Realistic Human Heart"), None)


def glb_json(path):
    data = path.read_bytes()
    length, _ = struct.unpack_from("<I4s", data, 12)
    return json.loads(data[20:20 + length])


def verts(ob):
    a = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", a)
    a = a.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    return a @ M[:3, :3].T + M[:3, 3]


def bvh(ob):
    return BVHTree.FromPolygons([tuple(v) for v in verts(ob)], [tuple(p.vertices) for p in ob.data.polygons])


def inside(tree, p, d=Vector((0.0123, 0.0071, 1.0)).normalized()):
    o, hits = Vector(p), 0
    for _ in range(64):
        loc, _, _, _ = tree.ray_cast(o + d * 1e-5, d)
        if loc is None:
            break
        hits, o = hits + 1, loc
    return hits % 2 == 1


def island_tris(ob):
    """Triangle count of every connected mesh island (vertices duplicated at glTF UV/normal seams are welded
    by position first, so seams are not mistaken for separate islands)."""
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    key = {}
    canon = []
    for i, p in enumerate(np.round(co.reshape(-1, 3), 6)):
        canon.append(key.setdefault(tuple(p), i))
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
    for i, c in enumerate(canon):
        a, b = find(i), find(c)
        if a != b:
            parent[a] = b
    me.calc_loop_triangles()
    cnt = {}
    for t in me.loop_triangles:
        r = find(t.vertices[0])
        cnt[r] = cnt.get(r, 0) + 1
    return sorted(cnt.values())


def bends(P, chord=None):
    P = np.asarray(P, float)
    w = 1
    if chord:
        w = max(1, int(round(chord / np.median(np.linalg.norm(np.diff(P, axis=0), axis=1)))))
    if len(P) < 2 * w + 1:
        return np.zeros(1)
    d1 = P[w:len(P) - w] - P[:len(P) - 2 * w]
    d2 = P[2 * w:] - P[w:len(P) - w]
    c = np.einsum("ij,ij->i", d1, d2) / np.linalg.norm(d1, axis=1) / np.linalg.norm(d2, axis=1)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def quat_rotate(q, v):           # glTF quaternion (x, y, z, w)
    x, y, z, w = q
    u = np.array([x, y, z])
    v = np.asarray(v, float)
    return 2 * u.dot(v) * u + (w * w - u.dot(u)) * v + 2 * w * np.cross(u, v)


def nodes_by_name(gj):
    return {n.get("name"): n for n in gj["nodes"]}


def check(path: Path) -> bool:
    ok = True
    res = []

    def report(name, passed, detail=""):
        nonlocal ok
        ok &= bool(passed)
        res.append(f"  [{'PASS' if passed else 'FAIL'}] {name}{': ' + str(detail) if detail else ''}")

    print(f"\n=== {path.name} ===")
    gj = glb_json(path)
    size_mb = path.stat().st_size / 1e6
    max_tris, max_mb = BUDGET.get(path.name, (150_000, 10.0))
    report("file size", size_mb <= max_mb, f"{size_mb:.2f} MB (<= {max_mb})")
    used = gj.get("extensionsUsed", [])
    report("Draco compression", "KHR_draco_mesh_compression" in used)
    textured = bool(gj.get("images"))
    if textured:
        report("compressed textures (WebP/KTX2)", ("EXT_texture_webp" in used or "KHR_texture_basisu" in used)
               and all(i.get("mimeType") in ("image/webp", "image/ktx2") for i in gj["images"]),
               ", ".join(f"{i.get('name')}:{i.get('mimeType')}" for i in gj["images"]))
        variants = gj.get("extensions", {}).get("KHR_materials_variants", {}).get("variants", [])
        names = [v["name"] for v in variants]
        clinical_file = path.with_name("heart_clinical.glb").exists()
        mats = gj.get("materials", [])
        hm = gj["meshes"][nodes_by_name(gj)["Heart_Myocardium"]["mesh"]]["primitives"][0]
        default_ok = mats[hm["material"]]["name"] == "MAT_Heart_Myocardium"
        report("looks: KHR_materials_variants realistic(default)+clinical (or heart_clinical.glb)",
               ("realistic" in names and "clinical" in names and default_ok) or clinical_file, f"variants {names}")
        attr = gj.get("asset", {}).get("extras", {}).get("attribution")
        report("CC BY attribution in asset.extras (exact text)", SKETCHFAB is not None and attr == SKETCHFAB["attribution"])
    # materials per mesh + alpha modes (raw glTF)
    mats = gj.get("materials", [])
    multi = [m["name"] for m in gj["meshes"] if len({p.get("material") for p in m["primitives"]}) != 1]
    report("exactly 1 material per mesh", not multi, str(multi) if multi else f"{len(gj['meshes'])} meshes")
    blend_ok = all(mats[m["primitives"][0]["material"]].get("alphaMode") == "BLEND"
                   for m in gj["meshes"] if m["name"].startswith(TRANSLUCENT))
    report("translucent materials alphaMode BLEND", blend_ok)
    textured_mats = {i for i, m in enumerate(gj.get("materials", []))
                     if any(k in json.dumps(m) for k in ("baseColorTexture", "normalTexture", "metallicRoughnessTexture"))}
    tex_meshes = sorted({m["name"] for m in gj["meshes"] for p_ in m["primitives"] if p_.get("material") in textured_mats})
    report("textures only on Heart_Myocardium / Aorta (none on coronaries, territories, helpers)",
           set(tex_meshes) <= {"Heart_Myocardium", "Aorta"}, ", ".join(tex_meshes) or "none")
    # Y-up: the torso's tallest extent must be along glTF +Y
    nodes = {n.get("name"): n for n in gj["nodes"]}
    tm = gj["meshes"][nodes["Torso_Shell"]["mesh"]]["primitives"][0]["attributes"]["POSITION"]
    mn, mx = np.array(gj["accessors"][tm]["min"]), np.array(gj["accessors"][tm]["max"])
    report("Y-up (body height along +Y)", int(np.argmax(mx - mn)) == 1, f"extent {np.round(mx - mn, 3).tolist()}")
    # view presets: -Z (glTF) aims at the target stored in extras (Blender coords -> glTF (x, z, -y))
    for n in [k for k in nodes if k and k.startswith("Extra_View_")]:
        nd = nodes[n]
        t = nd.get("extras", {}).get("target")
        pos = np.array(nd.get("translation", [0, 0, 0]))
        fwd = quat_rotate(nd.get("rotation", [0, 0, 0, 1]), [0, 0, -1])
        up = quat_rotate(nd.get("rotation", [0, 0, 0, 1]), [0, 1, 0])
        tgt = np.array([t[0], t[2], -t[1]])
        ang = math.degrees(math.acos(np.clip(fwd.dot((tgt - pos) / np.linalg.norm(tgt - pos)), -1, 1)))
        report(f"{n} aims at target", ang < 1.0 and up[1] > 0.5, f"{ang:.2f} deg off, up.y={up[1]:.2f}")

    # centreline smoothness (glTF extras "centerlines_gltf" on each coronary node)
    worst = {}
    for n in [k for k in nodes if k and k.startswith("Coronary_")]:
        lines = json.loads(nodes[n].get("extras", {}).get("centerlines_gltf", "[]"))
        if not lines:
            report(f"{n} centreline in extras", False)
            continue
        worst[n] = max(max(bends(L).max(), bends(L, 0.004).max()) for L in lines)
    report(f"no centreline bend > {MAX_BEND_DEG:.0f} deg (segments and 4 mm chords, all vessels + branches)",
           worst and max(worst.values()) <= MAX_BEND_DEG,
           ", ".join(f"{k.replace('Coronary_', '')} {v:.1f}" for k, v in worst.items()))
    # territory feather: COLOR_0 with alpha (VEC4)
    feather_ok = []
    for k in ("LAD", "LCX", "RCA"):
        prim = gj["meshes"][nodes[f"Territory_{k}"]["mesh"]]["primitives"][0]
        acc = prim["attributes"].get("COLOR_0")
        feather_ok.append(acc is not None and gj["accessors"][acc]["type"] == "VEC4")
    report("territories carry COLOR_0 RGBA (vertex-alpha feather)", all(feather_ok))

    # ---- import
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    obs = {o.name.split(".")[0]: o for o in bpy.data.objects}
    meshes = {n: o for n, o in obs.items() if o.type == "MESH"}
    tris = {}
    for n, o in sorted(meshes.items()):
        o.data.calc_loop_triangles()
        tris[n] = len(o.data.loop_triangles)
    total = sum(tris.values())
    print("  objects:", ", ".join(sorted(obs)))
    print("  triangles:", ", ".join(f"{k}={v}" for k, v in tris.items()))
    report("triangle budget", total <= max_tris, f"{total} (<= {max_tris})")
    report("1 material slot per mesh", all(len(o.material_slots) == 1 for o in meshes.values()))
    small = {n: min(island_tris(o)) for n, o in meshes.items()
             if n.startswith(CONTRACT_PREFIX) and min(island_tris(o)) < MIN_ISLAND_TRIS}
    report(f"no mesh island < {MIN_ISLAND_TRIS} triangles", not small, str(small) if small else
           f"smallest {min(min(island_tris(o)) for o in meshes.values())} tris")
    for k in ("LAD", "LCX", "RCA"):
        ob = meshes[f"Territory_{k}"]
        ca = ob.data.color_attributes
        if len(ca):
            a = np.array([c.color[3] for c in ca[0].data])
            report(f"Territory_{k} feather alpha 0 -> 1", a.min() < 0.05 and a.max() > 0.95 and 0.03 < (a < 0.99).mean() < 0.5,
                   f"min {a.min():.2f}, max {a.max():.2f}, feathered {(a < 0.99).mean():.0%} of vertices")
        else:
            report(f"Territory_{k} feather alpha 0 -> 1", False, "no colour attribute after import")
    hv = verts(meshes["Heart_Myocardium"])
    c = hv.mean(0)
    report("heart centroid at origin", np.linalg.norm(c) < 0.001, f"{np.round(c * 1000, 3).tolist()} mm")
    if textured:
        imgs = [im for im in bpy.data.images if "baseColor" in im.name and "clinical" not in im.name]
        sz = max(imgs[0].size) if imgs else 0
        report("realistic textures resized only (base colour size)", sz == TEX_SIZE.get(path.name, sz), f"{sz}px")
    # outlines: same centreline, normals inverted (face normals point toward the vessel axis)
    cl_all = {}
    for n in [k for k in nodes if k and k.startswith("Coronary_")]:
        lines = json.loads(nodes[n].get("extras", {}).get("centerlines_gltf", "[]"))
        cl_all[n] = [np.array([[x, -z, y] for x, y, z in L]) for L in lines]     # glTF Y-up -> Blender Z-up
    for k in ("LAD", "LCX", "RCA"):
        ob = meshes.get(f"Extra_Outline_{k}")
        if ob is None:
            report(f"Extra_Outline_{k} present", False)
            continue
        V = verts(ob)
        C = cl_all[f"Coronary_{k}"][0]
        inward = 0
        polys = ob.data.polygons
        for poly in list(polys)[:: max(1, len(polys) // 300)]:
            pc = np.array(poly.center)
            q = C[np.argmin(np.linalg.norm(C - pc, axis=1))]
            inward += np.dot(np.array(poly.normal), q - pc) > 0
        frac = inward / len(list(polys)[:: max(1, len(polys) // 300)])
        report(f"Extra_Outline_{k}: inverted normals, alpha 0", frac > 0.9, f"{frac:.0%} faces point inward")
    groups = {n: obs[n] for n in ("Heart", "Body") if n in obs}
    report("Heart/Body groups", len(groups) == 2 and all(o.parent in groups.values() for n, o in meshes.items()))

    # ---- anatomy (Blender Z-up after import: anterior -Y, left +X, superior +Z)
    a_gl = nodes["Heart_Myocardium"].get("extras", {}).get("apex_gltf")
    apex = np.array([a_gl[0], -a_gl[2], a_gl[1]]) if a_gl else hv[np.argmin(hv[:, 2])]
    d = (apex - c) / np.linalg.norm(apex - c)
    on_surface = bvh(meshes["Heart_Myocardium"]).find_nearest(Vector(apex))[3] < 0.001
    extreme = (apex - c) @ d >= np.percentile((hv - c) @ d, 99.5)
    report("apex landmark: on the heart, the extreme point along its axis, pointing left-anterior-inferior",
           on_surface and extreme and d[0] > 0.2 and d[1] < -0.2 and d[2] < -0.3, np.round(d, 2).tolist())
    lad, lcx, rca = (verts(meshes[f"Coronary_{k}"]) - c for k in ("LAD", "LCX", "RCA"))
    cl_end = {n: L[0][-1] for n, L in cl_all.items()}
    report("LAD on the anterior surface", np.mean(lad[:, 1] < 0.01) > 0.8, f"{np.mean(lad[:, 1] < 0.01):.0%} anterior")
    report("LCX lateral -> posterior", lcx[:, 0].mean() > 0 and lcx[:, 1].max() > 0.015,
           f"mean x {lcx[:, 0].mean() * 100:.1f} cm, max y {lcx[:, 1].max() * 100:.1f} cm")
    rca_end = cl_end["Coronary_RCA"] - c
    report("RCA right -> posterior/diaphragmatic (crux, PDA)", rca[:, 0].min() < -0.012 and
           (rca_end[1] > 0.004 or rca_end[2] < -0.02),
           f"min x {rca[:, 0].min() * 100:.1f} cm, end (y {rca_end[1] * 100:.1f}, z {rca_end[2] * 100:.1f}) cm")
    hb = bvh(meshes["Heart_Myocardium"])
    ab = bvh(meshes["Aorta"])                         # coronaries originate from the aortic root
    for k in ("LAD", "LCX", "RCA", "LM", "Branches"):
        v = verts(meshes[f"Coronary_{k}"])
        dist = np.array([min(hb.find_nearest(Vector(p))[3], ab.find_nearest(Vector(p))[3]) for p in v[::3]]) * 1000
        report(f"Coronary_{k} hugs the epicardium / aortic root", np.percentile(dist, 99) < 6.0,
               f"vertex distance p1-p99 {np.percentile(dist, 1):.1f}-{np.percentile(dist, 99):.1f} mm")
    ab_ = bvh(meshes["Aorta"])
    for n, lines in cl_all.items():                  # centreline 1-4 mm above the NEW heart surface
        d_all = []
        for L in lines:
            for q in L:
                if ab_.find_nearest(Vector(q))[3] > 0.008:          # skip the aortic origin (leaves the aorta)
                    d_all.append(hb.find_nearest(Vector(q))[3] * 1000)
        d_all = np.array(d_all)
        ok_ = (np.percentile(d_all, 2) >= 1.0) and (np.percentile(d_all, 98) <= 4.0)
        report(f"{n} centreline 1-4 mm above the heart", ok_,
               f"p2-p98 {np.percentile(d_all, 2):.2f}-{np.percentile(d_all, 98):.2f} mm (max {d_all.max():.1f})")
    for k in ("LAD", "LCX", "RCA"):
        v = verts(meshes[f"Territory_{k}"])
        dist = np.array([hb.find_nearest(Vector(p))[3] for p in v[::4]]) * 1000
        report(f"Territory_{k} offset above myocardium", 0.5 < np.median(dist) < 1.6 and dist.max() < 3,
               f"median {np.median(dist):.2f} mm, max {dist.max():.2f} mm")

    # ---- organs: inside the shell, not intersecting heart / aorta / each other
    shell = bvh(meshes["Torso_Shell"])
    organ_names = [n for n in meshes if n.startswith("Organ_")]
    trees = {n: bvh(meshes[n]) for n in organ_names + ["Heart_Myocardium", "Aorta"]}
    for n in organ_names:
        v = verts(meshes[n])
        frac = np.mean([inside(shell, p) for p in v[:: max(1, len(v) // 150)]])
        report(f"{n} inside Torso_Shell", frac == 1.0, f"{frac:.0%} of sampled vertices")
    clashes = [(a, b) for i, a in enumerate(trees) for b in list(trees)[i + 1:]
               if a.startswith("Organ_") and trees[a].overlap(trees[b])]
    report("organs do not intersect heart/aorta/each other", not clashes, str(clashes) if clashes else "")

    # ---- anchors: within 5 cm of their structure but outside it
    targets = {v["camera_anchor"]: v["mesh_names"] for v in AMAP["vessels"]}
    targets[AMAP["heart"]["camera_anchor"]] = AMAP["heart"]["mesh_names"]
    for r in AMAP["body_regions"]:
        targets.setdefault(r["camera_anchor"], r["mesh_names"] or ["Aorta"])
    for a, mesh_names in targets.items():
        if a not in obs:
            report(f"{a} present", False)
            continue
        p = np.array(obs[a].matrix_world.translation)
        best = min((trees.get(m) or bvh(meshes[m])).find_nearest(Vector(p))[3] for m in mesh_names)
        ins = any(inside(trees.get(m) or bvh(meshes[m]), p) for m in mesh_names)
        limit = 0.65 if a == "Anchor_WholeBody" else 0.05             # whole-body anchor is 0.6 m anterior by spec
        report(f"{a} near but outside its structure", best <= limit and not ins, f"{best * 100:.1f} cm")
    print("\n".join(res))
    print(f"  ==> {'ALL CHECKS PASSED' if ok else 'SOME CHECKS FAILED'}")
    return ok


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    paths = [Path(p).resolve() for p in argv] or [ROOT / "artifacts" / "heart.glb", ROOT / "artifacts" / "heart_lite.glb"]
    rep = ROOT / "artifacts" / "asset_build_report.json"
    if rep.exists():
        r = json.loads(rep.read_text())
        for v in ("full", "lite"):
            if v in r:
                print(f"build report [{v}]: arch apex {r[v].get('arch_apex_above_heart_base_cm')} cm above the heart "
                      f"base; aorta clearance from heart after the root emerges "
                      f"{r[v].get('aorta_min_clearance_from_heart_mm')} mm")
                print(f"build report [{v}]: territory gaps {r[v]['territory_gap_fraction']:.1%}, overlaps "
                      f"{r[v]['territory_overlap_fraction']:.1%}; centreline-to-myocardium (mm) "
                      + ", ".join(f"{k} {x['min_mm']}-{x['max_mm']}" for k, x in r[v]['centreline_to_myocardium'].items()))
    if rep.exists():
        r = json.loads(rep.read_text())
        for v in ("full", "lite"):
            if v in r:
                x = r[v]
                ok_gap = x.get("territory_gap_fraction", 1) == 0 and x.get("territory_param_gap_fraction", 0) == 0
                ok_ovl = x.get("territory_overlap_fraction", 1) == 0 and x.get("territory_param_overlap_fraction", 0) == 0
                print(f"  [{'PASS' if ok_gap and ok_ovl else 'FAIL'}] build report [{v}]: territories no gaps / no overlap")
                if not (ok_gap and ok_ovl):
                    sys.exit(1)
    results = [check(p) for p in paths]
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
