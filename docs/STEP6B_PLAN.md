# Step 6B plan: Sketchfab heart as a production asset

**Safety (done first).** `git init`, then a baseline commit (`4c57cec`) and the `step6b-sketchfab-heart` branch.
The procedural `heart*.glb` and `build_heart.py` are copied to `backup/step6_procedural/`. The procedural build
stays available behind `--heart-source procedural`.

**What the source looks like (inspected).**
* One mesh with 22.5k triangles and 13 islands: LV+LA, RA+SVC, RV, aorta (ascending, arch, 3 branch stubs; it ends
  at the arch), pulmonary trunk, right pulmonary artery, and 7 small vessel-end caps.
* Coronaries are painted only: dark lines in the base-colour texture, ridges in the normal map.
* The model is upright, with anterior facing −Y and the apex low and to the patient's left.

**Pipeline in `blender/build_heart.py --heart-source sketchfab` (default).**
1. **Import and align.** Import `scene.gltf` and render 6 orthographic `src_*.png` views. Fit the long axis by PCA
   of the ventricle vertices plus an apex landmark. Rotate to (0.55, −0.45, −0.70) with a roll that keeps the RV
   anterior. Scale so base-to-apex is 12 cm, and put the myocardium centroid where the Step 6 heart was.
2. **Split by island.** The aorta island(s) plus their caps become `Aorta`; everything else becomes
   `Heart_Myocardium`. Each group is welded by distance, so caps join their tubes and no island under 50
   triangles remains. The arch height is checked against about 5 cm. A texture-matched descending tube is added
   from the arch end and overlaps it to blend the joint. Each part gets its own material sharing the original
   textures.
3. **Coronaries on the painted lines.** Cast rays on a (θ, z′) grid around the fitted axis, with UV look-ups into
   the base-colour texture, to build a "vesselness" map (local darkness). Extract the LAD, LCX, RCA-in-AV-groove,
   PDA and the 5 branches as minimum-cost paths inside anatomical windows. Map them to 3D, snap 1.9 mm outward,
   smooth with Catmull-Rom, limit bends to under 35°, taper, and add 12 (full) / 8 (lite) segments with caps.
   The LM and RCA start at the aortic sinuses. Hit tubes (6 mm) and outline tubes (+0.6 mm, inverted, alpha 0)
   share the same centrelines.
4. **Territories.** AHA 17-segment patches on this surface, offset 1 mm, with a 3 mm vertex-alpha feather and
   alpha 0.35.
5. **Body and organs** come from Step 6, with Boolean clearing re-run against the new heart and aorta. Anchors
   and views are recomputed.
6. **Looks.** *Realistic* uses the original textures and material values, double-sided. *Clinical* is a
   `KHR_materials_variants` variant: base colour −55% saturation, tinted toward #D9A79A, painted lines softened,
   roughness ≥ 0.5, normal strength reduced.
7. **Export.** Blender writes the glb. `blender/gltf_post.mjs` then adds the variants, attribution,
   `emissiveFactor` and alpha modes. `npx @gltf-transform/cli` resizes (2048 / 1024), converts to WebP and
   applies Draco.
8. **Presentation (`viewer_look.json`).** Charcoal radial background, the Poly Haven `studio_small_09` HDRI,
   key + rim lights, ACES-style tone mapping. The same settings drive the Cycles renders and `preview.html`.
9. **Validation.** `check_glb.py` is extended (textures, variants, attribution, outlines). Renders in both looks,
   plus `compare_sketchfab_vs_ours`. Web smoke test with the Realistic/Clinical toggle, picking, an LAD glow and
   outline demo, and on-screen FPS. Then pytest, the docs and a commit.
