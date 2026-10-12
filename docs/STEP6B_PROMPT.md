# ULTIMATE PROMPT — Step 6B: Realistic Sketchfab Heart → Production 3D Asset
# Multimodal AI Hackathon 2026 · Track A · Cardiovascular Risk Visualization & Prediction

You are a senior technical artist, medical illustrator and Blender/three.js engineer.
Work autonomously until EVERYTHING below is done and verified. Stop and ask me ONLY if:
- a required asset or tool is missing, or
- an action is destructive.

- Project root = this folder (it contains `artifacts/`, `blender/`, `cardio_ml/`, `notebooks/`, `tests/`). All paths below are relative to it.
- OS: Windows.
- Blender: auto-detect it.
  - Check `where blender`, then `C:\Program Files\Blender Foundation\Blender *\blender.exe` (use the newest version).
  - Print the path you use. Ask me only if none is found.
- Node.js: required for gltf-transform (`npx @gltf-transform/cli`). Check `node -v`.

## 0. SAFETY FIRST (do before anything else)
1. The project is NOT under git yet.
   - Run `git init`.
   - Create a `.gitignore`: .venv/, __pycache__/, artifacts/cache/, *.blend1, node_modules/, *.egg-info/.
   - Commit everything as "Baseline: Steps 1-6 before Sketchfab heart".
   - Then create the branch `step6b-sketchfab-heart` and work there.
2. Also copy the current `artifacts/heart.glb`, `artifacts/heart_lite.glb` and `blender/build_heart.py` into `backup/step6_procedural/`.
3. Never delete the procedural build. Add a flag to `blender/build_heart.py`: `--heart-source {sketchfab,procedural}`, default `sketchfab`.

## 1. READ CONTEXT FIRST
- `artifacts/anatomy_map.json` — single source of truth for names, colours and rules
- `artifacts/ASSET_SPEC.md` — the contract
- `cardio_ml/anatomy.py` — `validate_glb_names`, `color_for`, `write_asset_spec`
- `blender/build_heart.py`, `blender/check_glb.py`, `blender/preview.html`, `blender/make_all.py`, `blender/serve_preview.py`
- `artifacts/STEP6_ASSET.md`, `artifacts/asset_build_report.json`
- `assets_src/sketchfab_heart/`:
  - scene.gltf, scene.bin, textures/, license.txt
  - `reference/` — 4 screenshots of the Sketchfab viewer: 01_front, 02_right_side, 03_posterior, 04_posterior_inferior. They show the exact look to match.

Write a short plan to `docs/STEP6B_PLAN.md`, then execute it without waiting.

## 2. WHAT THE PRODUCT NEEDS (context)
A web app (built later, in Step 7) where:
- the LAD, LCX and RCA coronaries are coloured by ML-predicted stenosis probability
- flagged vessels pulse, glow and get an outline
- the user can rotate, zoom and click vessels or regions, and the camera flies to anchors
- a territory overlay can be toggled
- organs glow inside a translucent body
- there's a Realistic ↔ Clinical look toggle
- it runs smoothly on laptops without a dedicated GPU

Judging weights:
- 3D visualization 25%: anatomy, spatial risk mapping, interactivity
- System integration 15%
- Technical implementation 10%: reproducibility, public anatomical resources

## 3. SOURCE MODEL
- "Realistic Human Heart" by neshallads — CC BY 4.0. 1 mesh (heart + great vessels fused), 1 material `Heart_Tex`, 3 textures (baseColor, normal, metallicRoughness), double-sided.
- **Attribution** (use EXACTLY this text in the README, STEP6_ASSET.md, `anatomy_map.json → asset.sources`, and glTF `asset.extras.attribution`):
  `This work is based on "Realistic Human Heart" (https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089) by neshallads (https://sketchfab.com/neshallads) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)`
- Modifications note: "re-aligned, re-scaled, split into parts, coronary tubes and territories added, clinical texture variant added."

## 4. HARD RULES (problem statement + contract — never break)
1. Only `Coronary_LAD`, `Coronary_LCX` and `Coronary_RCA` are risk-coloured.
   - Each is ONE continuous mesh along its whole course.
   - NEVER split into proximal/mid/distal segments: the dataset has no lesion location.
2. `Coronary_LM` and `Coronary_Branches` are separate neutral meshes.
3. The painted texture lines are NOT the coronaries. Risk colour needs real tube meshes.
4. Nothing is placed or shaped from patient data. Region RWMA is never a coordinate.
5. Exact, case-sensitive contract names, from `anatomy_map.json`. Helper objects must be prefixed `Extra_`.
6. Exactly 1 material per mesh.
7. Export:
   - glTF 2.0 .glb, Y-up, metres
   - origin = centroid of `Heart_Myocardium`
   - Draco geometry compression + WebP (or KTX2) textures, via `npx @gltf-transform/cli`
   - full ≤ 150k triangles, ≤ 10 MB · lite ≤ 60k triangles, ≤ 4 MB

## 5. REQUIRED OBJECTS
### Meshes
| Mesh | Notes |
|---|---|
| Heart_Myocardium | |
| Coronary_LAD, Coronary_LCX, Coronary_RCA | risk-coloured |
| Coronary_LM, Coronary_Branches | neutral |
| Aorta | |
| Territory_LAD, Territory_LCX, Territory_RCA | |
| Torso_Shell | |
| Organ_Lungs, Organ_Kidneys, Organ_Pancreas, Organ_Thyroid, Organ_Brain, Organ_Legs | |

### Empties
Anchor_LAD, Anchor_LCX, Anchor_RCA, Anchor_Heart, Anchor_Vessels, Anchor_Lungs, Anchor_Kidneys, Anchor_Pancreas, Anchor_Thyroid, Anchor_Brain, Anchor_Blood, Anchor_Legs, Anchor_WholeBody

### Extras
| Extra | Spec |
|---|---|
| Extra_Hit_LAD / LCX / RCA | invisible hit tubes, radius 6 mm, alpha 0 |
| Extra_Outline_LAD / LCX / RCA | the same tube +0.6 mm, inverted normals, alpha 0 (the app turns it on when flagged or selected) |
| Extra_View_Front / Left / Posterior / Body | camera presets; local −Z aims at the target; 35° vertical FOV, 15% margin |

### Groups
- `Heart`: heart, coronaries, aorta, territories, extras
- `Body`: shell, organs, region anchors
- Pivot at the origin, so the app can scale-pulse the heart.

### glTF extras on each contract mesh
`{"key", "role", "display_name"}`, taken from the map.

## 6. BUILD STEPS (inside `blender/build_heart.py`, a headless one-command rebuild)

### 6.1 Import + inspect
- Import `assets_src/sketchfab_heart/scene.gltf`.
- Render 6 orthographic views → `artifacts/figures/src_*.png`. Look at them, and compare with `reference/`.
- Identify: ventricles, atria, auricles, aorta (with 3 arch branches), pulmonary trunk, vena cavae, pulmonary veins, apex, the painted coronary lines.

### 6.2 Align, scale, centre
- Frame while modelling (Blender Z-up): anterior = −Y, patient left = +X, superior = +Z.
- Long axis: PCA of the ventricle vertices + an apex landmark.
- Rotate so the apex points left-anterior-inferior ≈ (0.55, −0.45, −0.70), with the right-ventricle surface facing −Y.
- Scale to 12 cm base-to-apex.
- Place it in the body exactly where the Step 6 heart was.
- Verify with renders, not just numbers.

### 6.3 Split
- `Aorta` = aortic root + ascending + arch + its 3 branch stubs.
  - Separate it by region-growing from an arch seed + a bounding-cylinder cleanup.
  - Fill the cut holes; smooth the seams; no visible seam from the front, left or posterior presets.
  - If the source aorta stops at the arch: extend it with a matching tube descending behind the heart, blend the joint, and match the texture colour.
- `Heart_Myocardium` = everything else (ventricles, atria, auricles, pulmonary trunk, vena cavae, pulmonary veins).
- Each gets its own material, sharing the same texture images.

### 6.4 Coronaries (critical)
- Locate the painted vessel lines: inspect the baseColor and normal UV textures — the vessels show as dark grooves or ridges in the normal map — plus anatomical landmarks (AV groove, anterior and posterior interventricular grooves, aortic sinuses).
- Centrelines:
  - snapped to the surface (raycast / shrinkwrap)
  - offset 1.5–2 mm outward
  - Catmull-Rom smoothing
  - no bend > 35° between consecutive segments
  - gentle taper: main 2.2 → 1.4 mm; branches 1.2 → 0.8 mm
  - ≥ 12 radial segments full / 8 lite
  - capped ends
- Paths (right-dominant):

| Vessel | Path |
|---|---|
| LM | left aortic sinus → bifurcation |
| LAD | anterior interventricular groove → wraps ~1 cm around the apex |
| LCX | left AV groove → lateral → posterior |
| RCA | right sinus → right AV groove → posterior descending artery toward the apex |
| Branches | 2 diagonals, 2 obtuse marginals, 1 acute marginal |

- The tubes sit exactly over the painted lines wherever those exist.
- Materials: roughness 0.3, emissive-ready (`emissiveFactor` 0), neutral base #C9C2B8. The app sets the colour at runtime.
- Build the hit and outline extras from the same centrelines.

### 6.5 Territories
- Re-derive them on THIS ventricle surface: AHA 17-segment logic (θ around the fitted long axis + apical cap), right-dominant.
  - LAD 1, 2, 7, 8, 13, 14, 17 · LCX 5, 6, 11, 12, 16 · RCA 3, 4, 9, 10, 15
- Offset 1 mm, ~3 mm vertex-alpha feather, zero gaps and overlap, alpha 0.35, hidden by default.

### 6.6 Looks
**DEFAULT = Realistic**, IDENTICAL to Sketchfab (see `reference/`):
- Keep the original textures UNCHANGED, except resizing: 2048 px full / 1024 px lite.
- Keep the original material values and double-sidedness.
- The painted coronary lines stay as they are; the tubes sit on top of them.

**VARIANT "clinical"** (`KHR_materials_variants`):
- Base colour desaturated −55% and lifted toward a warm muted tissue tone #D9A79A.
- Roughness ≥ 0.5.
- Painted vessel lines softened, so there are no doubled vessels.
- If variants prove fragile in three.js: export a separate `heart_clinical.glb` with identical names instead, and document it.

**Readability on the realistic look (vessels must stand out WITHOUT changing the heart):**
- Tubes ~10% thicker than the painted lines, glossier (roughness 0.3).
- Contrast render: demo LAD 0.85 (flagged: glow + outline), LCX 0.40, RCA 0.15. All three vessels clearly identifiable.
- If a low-risk vessel blends in, lift its base lightness slightly and rely on the outline when hovered or selected. Document it.

### 6.7 Body, organs, anchors (keep from Step 6; refit to the new heart)
- Keep Torso_Shell and the Organ_* meshes from the procedural build (palette and look unchanged).
- Re-run the intersection clearing against the NEW heart and aorta. Organs stay inside the shell and don't intersect anything.
- Recompute the heart and vessel anchors (~3 cm along the outward normal, at the vessel midpoints) and re-aim the `Extra_View_*` presets at the new heart.

### 6.8 Step 6 polish items (also fix)
- No mesh islands < 50 triangles in any contract mesh (removes stray fragments).
- Realistic aortic-arch height (~5 cm above the heart base).
- The 35° bend limit on all centrelines.

### 6.9 Presentation (match Sketchfab exactly) → `artifacts/viewer_look.json`
Record these exact settings, and use the SAME settings in the renders and `preview.html`:
- Background: dark charcoal radial gradient, #3A3A3A centre → #1E1E1E edges (as in `reference/`).
- Lighting: a neutral studio CC0 HDRI from Poly Haven (download it to `assets_src/hdri/`, credit it in the README) + a soft key light from upper-front-left + a rim light from behind. Reproduce the wet specular highlights seen in `reference/01_front.jpg`.
- Renderer: ACESFilmic tone mapping, sRGB output, no realtime shadows, mild ambient occlusion only if FPS allows.

### 6.10 Export
Full + lite `.glb`, plus the clinical file if variants weren't used:
- Draco + WebP/KTX2 via gltf-transform
- extras ON, vertex colours ON
- attribution in `asset.extras`
Outputs:
- `artifacts/heart.glb`, `artifacts/heart_lite.glb`
- `blender/heart_source.blend`

## 7. VALIDATION (everything must pass before you say done)
1. `python -c "from cardio_ml.anatomy import validate_glb_names as v; [print(f, v(f)) for f in ['artifacts/heart.glb','artifacts/heart_lite.glb']]"` → ok for all.
2. `blender/check_glb.py` (extend it). Checks:
   - names
   - triangle and size budgets
   - Draco + compressed textures
   - 1 material per mesh
   - centroid within 1 mm of the origin
   - Y-up
   - apex direction
   - vessel sides (LAD anterior, LCX lateral→posterior, RCA right→posterior)
   - vessel-to-surface distance 1–4 mm on the NEW mesh
   - no islands < 50 triangles
   - bend ≤ 35°
   - territories: no gaps, no overlap
   - organs contained and not intersecting
   - anchors within 5 cm of, and outside, their structure
   - variants present (or the clinical file exists)
   - attribution present
3. Renders (Cycles CPU, ~64 samples, denoised, 1600×1000) → `artifacts/figures/`, in BOTH looks:
   - `heart_front`, `heart_left`, `heart_posterior`
   - `heart_demo_risk`
   - `territories_demo`
   - `body_front`
   - `lite_vs_full`
   - `compare_sketchfab_vs_ours.png`: `reference/01_front.jpg` next to our realistic final, same angle and lighting. They must look the same, apart from the added coronary tubes.
4. LOOK at every render, and fix what you find: floating or buried vessels, seams at the aorta split, texture stretching, dark muddy areas, organs intersecting, sorting artefacts with the translucent body. Iterate until it looks like a polished medical visualisation.
5. Web smoke test, `blender/preview.html` (three.js + GLTFLoader + DRACOLoader + KTX2Loader if used + OrbitControls, settings from `viewer_look.json`):
   - load both files
   - Realistic ↔ Clinical toggle works
   - clicking each hit proxy logs the correct vessel key (raycast hit proxies + myocardium, nearest hit wins)
   - outline + glow demo on LAD
   - FPS shown on screen
   - screenshot → `artifacts/figures/web_preview.png`
   - serve it with `python blender/serve_preview.py`
6. Run `pytest` — all existing tests must still pass.

## 8. DELIVERABLES
- `blender/build_heart.py` (`--heart-source` flag), `check_glb.py`, `preview.html`, `make_all.py` (runs everything end to end)
- `artifacts/heart.glb`, `heart_lite.glb` (+ `heart_clinical.glb` if needed), `viewer_look.json`
- `blender/heart_source.blend`
- `artifacts/figures/*` (all renders above)
- `anatomy_map.json → asset.sources` updated + ASSET_SPEC.md regenerated via `write_asset_spec()`
- `artifacts/STEP6_ASSET.md` updated (≤ ½ page):
  - source + attribution
  - modifications
  - both looks
  - budgets
  - how each app feature is supported
- README: "Rebuild the 3D asset" + Credits sections
- `docs/STEP6B_PLAN.md`
- git: commit on branch `step6b-sketchfab-heart`, with a clear message

## 9. FINAL REPORT (reply to me with)
- A table: check → pass/fail
- Triangle and size counts for each file
- Paths of the 4 key images: `compare_sketchfab_vs_ours`, `heart_demo_risk` (realistic), `heart_demo_risk` (clinical), `web_preview`
- Any compromise you made, and why

## NEVER
- Ship without the CC BY attribution.
- Use painted texture lines as the coronaries.
- Split a target vessel into segments.
- Change the realistic textures (except resizing).
- Break contract names, anchors, budgets or tests.
- Delete the procedural build or the backups.
- Say "done" without passing every check AND looking at every render.
