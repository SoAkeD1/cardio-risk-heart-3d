"""Render the Step 6 procedural CC0 heart (kept as a fallback) for the video, front view.

blender -b --factory-startup -P video/pipeline/render_procedural.py
-> video/assets/procedural_front.png
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
GLB = ROOT / "backup" / "step6_procedural" / "heart.glb"
OUT = ROOT / "video" / "assets" / "procedural_front.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB))
sc = bpy.context.scene

# keep only the heart group (hide body / torso / organs / helpers)
keep = ("Heart_", "Coronary_", "Aorta")
for o in sc.objects:
    if o.type == "MESH" and not o.name.startswith(keep):
        o.hide_render = True

meshes = [o for o in sc.objects if o.type == "MESH" and not o.hide_render and o.name.startswith(("Heart_", "Coronary_"))]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center, size = (lo + hi) / 2, max(hi - lo)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 60
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
# glTF Y-up -> Blender Z-up; anterior = -Y in Blender after import
cam.location = center + Vector((0, -size * 3.4, size * 0.1))
cam.rotation_euler = (math.radians(87), 0, 0)
sc.camera = cam

for name, loc, energy in (("key", (1.5, -2.5, 2.0), 6), ("fill", (-2.0, -1.5, 0.5), 2), ("rim", (0.0, 2.5, 1.5), 4)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size * 1.5
    lo_ = bpy.data.objects.new(name, ld)
    lo_.location = center + Vector(loc) * size
    lo_.rotation_euler = (center - lo_.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(lo_)

world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.05, 0.055, 1)
sc.world = world
try:
    sc.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 1200, 1000
sc.view_settings.view_transform = "Standard" if "Standard" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else sc.view_settings.view_transform
sc.render.film_transparent = False
sc.render.filepath = str(OUT)
OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
print("wrote", OUT)
