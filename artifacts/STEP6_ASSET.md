# Step 6: 3D heart and body asset

**Build method.** The asset is 100% procedural and CC0. It is built by `blender/build_heart.py`, which is
reproducible headless in about 30 s; `python blender/make_all.py` also renders, checks and validates. The heart is
a parametric surface S(θ, z′) along a left-anterior-inferior long axis. It has an egg-shaped profile, a fuller left
ventricle, interventricular and AV grooves, and the atria as smooth lobes of the base dome. The auricles and the
pulmonary-trunk stub are fused in by a voxel remesh, smoothed and decimated. The coronaries are Catmull-Rom
centrelines placed in (θ, z′), snapped to the final epicardium (1.9 mm above it, measured) and swept into
continuous, gently tapered tubes. Every centreline bends less than 35° (measured on both consecutive segments and 4 mm chords; worst case 29.6°). The left main and RCA leave the aortic sinus radially, on a tangent-continuous lead-in. Centrelines are stored in each coronary node's glTF extras (`centerlines_gltf`, glTF coordinates) for label or flow placement. The aortic arch apex sits 5.0 cm above the heart base. It stays left-posterior, and after the root emerges it never touches the heart again (about 1 mm clearance). The LAD, LCX and RCA are **one mesh each**, never split into segments.
The territories are AHA 17-segment patches (right-dominant) with smooth θ/z′ boundaries, offset 1 mm
(0% gaps and 0% overlaps measured), with a 3 mm vertex-alpha feather exported as `COLOR_0` alpha. Outer edges fade to 0; shared edges fade to 0.5, so neighbouring territories cross-fade. The body is a loft plus swept limbs fused into one closed shell. The organs are
Boolean-cleared against an inflated heart, aorta and earlier organs, and kept inside a shrunken copy of the shell.
Every contract name, neutral colour and role comes from `anatomy_map.json`. Nothing is shaped or placed from
patient data, and Region RWMA is never a coordinate.

**Simplifications.** The anatomy is stylised for education, not patient-specific. It assumes right-dominant
circulation, approximates the AHA territories on the epicardial surface (the septum is shown as the groove strips),
and includes only representative branches (2 diagonals, 2 obtuse marginals, 1 acute marginal).

**Budgets (measured).**

| File | Triangles | Size | Budget |
|---|---|---|---|
| `heart.glb` | 116,208 | 0.34 MB | ≤ 150k, ≤ 10 MB |
| `heart_lite.glb` | 41,354 | 0.16 MB | ≤ 60k, ≤ 4 MB |

Both files use Draco compression, glTF 2.0, Y-up and metres, with the origin at the myocardium centroid (0.0 mm
error). Each mesh has exactly one Principled material (`MAT_<Mesh>`) and there are no textures. Subtle
vertex-colour AO is applied only to the heart, aorta and torso. The runtime may multiply it in or ignore it.

**How each app feature is supported.**
* **Click/hover on thin vessels:** invisible `Extra_Hit_LAD/LCX/RCA` tubes (6 mm radius, `alphaMode BLEND`, alpha 0).
  Raycast the hit proxies *together with* the myocardium and keep the nearest hit, so a vessel behind the heart is
  not picked.
* **Camera fly-to:** `Anchor_*` empties sit about 3 cm outside each structure. `Extra_View_Front/Left/Posterior/Body`
  hold the camera position, with local −Z aimed at `extras.target` (35° vertical FOV, 15% margin).
* **Heart vs body modes and heartbeat:** the `Heart` and `Body` groups both sit at the origin, so the app can
  scale-pulse the whole heart group uniformly.
* **Territory toggle:** `Territory_*` sheets are hidden by default and tinted from the vessel colour.
* **X-ray view:** `Torso_Shell` is a single closed translucent surface (alpha 0.18).
* **Low-end devices:** `heart_lite.glb` has the same names, anchors and views.

**Validation.**
* `check_glb.py` passes every check for both files: budgets, Draco, materials, centroid, Y-up, view aim,
  no mesh island under 50 triangles, centreline bends ≤ 35°, territory `COLOR_0` alpha feather, apex direction, vessel sides, vessel-to-surface distance, territories, organ containment and non-intersection,
  and anchors.
* `validate_glb_names()` returns ok for both files.
* The three.js smoke test (`blender/preview.html`) loads both files in under 0.5 s. Clicking each hit proxy
  returns the right vessel in both. A synchronous render benchmark takes 0.24 ms per frame for the full file.
  That was measured on a **discrete** AMD RX 9070 XT; integrated graphics were not available to test.

**Licences.** All geometry is original and CC0. `three.js` (MIT) is used only by the preview page.
