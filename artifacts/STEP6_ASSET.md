# Step 6: 3D heart and body asset (6B: Sketchfab heart)

**Source and attribution.** This work is based on "Realistic Human Heart" (https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089) by neshallads (https://sketchfab.com/neshallads) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
*Modifications:* re-aligned, re-scaled, split into parts, coronary tubes and territories added, clinical texture variant added.
This text is embedded in both GLBs (`asset.extras.attribution`) and in `anatomy_map.json → asset.sources`.

**Build.** Run `python blender/make_all.py` (Blender 5.2 headless, about 5 min with renders). Pass
`--heart-source procedural` to rebuild the Step 6 CC0 heart. The build:
* imports, welds and splits the source into `Heart_Myocardium` and `Aorta`, extending the descending aorta;
* aligns the apex landmark to the left-anterior-inferior long axis and scales base-to-apex to 12 cm;
* traces the painted vessels on a cylindrical unwrap, using minimum-cost paths inside the anatomical grooves;
* sweeps new continuous tubes 1.5–2 mm above the surface, with every bend ≤ 35°.

**Contract rules.**
* LAD, LCX and RCA are one mesh each; the LM and the branches are neutral.
* The painted lines stay texture only; the tubes are the coronaries.
* Territories are re-derived for a right-dominant AHA layout: 1 mm offset, 3 mm alpha feather, 0% gaps and 0%
  overlaps.
* The RCA|LAD boundary follows the traced LAD.

**Looks.**
* **Realistic** (default) uses the original textures, only resized to 2048 px (lite: 1024 px).
* **Clinical** is a `KHR_materials_variants` variant: saturation reduced 55% and lifted toward #D9A79A, roughness
  ≥ 0.5, painted lines softened.
* `viewer_look.json` is shared by the Cycles renders and three.js. It sets a charcoal radial background, the Poly
  Haven CC0 HDRI, key and rim lights, ACES and sRGB.

| File | Triangles | Size | Budget |
|---|---|---|---|
| `heart.glb` | 108,326 | 1.58 MB | ≤ 150k, ≤ 10 MB |
| `heart_lite.glb` | 45,938 | 0.60 MB | ≤ 60k, ≤ 4 MB |

**Runtime features.**
* Picking uses `Extra_Hit_*` proxies (6 mm radius, alpha 0), raycast together with the myocardium; the nearest hit
  wins.
* `Extra_Outline_*` meshes (+0.6 mm, inverted normals) give the flag outline.
* The asset also carries `Anchor_*`, `Extra_View_*`, the Heart/Body groups at the origin, and `Torso_Shell` for an
  X-ray view.

**Validation.**
* `check_glb.py`: all checks pass on both files.
* `validate_glb_names()`: ok on both files.
* pytest: passes.
* three.js smoke test (`preview.html`): both files and both looks load; clicks on LAD, LCX and RCA resolve
  correctly.

**Compromises.**
* **Tube size:** tubes are thicker than the 1.25 mm painted line (radius 1.8→1.3 mm, branches 1.1→0.8 mm) so they
  stay readable.
* **Aortic arch:** the apex is 4.3 cm above the base, not 5 cm, because the source arch is kept.
* **Descending aorta:** the added extension reuses arch-wall UVs, so its texture visibly tiles.
* **D2 and PDA:** their painted support is weak, so groove priors dominate those traces.
* **Blender look:** Blender 5.2 has no "ACES Filmic" transform, so the renders use ACES 2.0.
