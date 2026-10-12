# Decisions (Steps 7 + 8)

Non-obvious choices made while building CardioLens, with the reason for each.

## Phase 0: asset
* **LCX smoothing.** I replaced the support-weighted trace with a degree-4 Chebyshev fit of z(θ): 5 coefficients,
  within the "≤ 8 control points" rule. The painted LCX wobbles by up to 6.6 mm; the fit removes that and still
  sits in the AV groove.
* **Left main length.** The traced LAD origin lies about 3 cm from the left sinus. Instead of inventing a new route,
  the bifurcation is placed on the existing clearance-checked LM route, exactly 10 mm (centreline arc) after
  the vessel leaves the aortic wall. The rest of that route becomes the proximal LAD, and the LCX is re-traced
  from the new bifurcation. All bend, offset and anatomy checks still pass.
* **Descending-aorta texture.** No texture region is long enough to keep the arch texel density without
  repeating. I chose "no repetition" over "same density": the extension maps once, continuously, along
  the arch wall, so the texture stretches along the vessel instead of tiling. The realistic textures themselves
  are unchanged.
* **Territory cap seam.** The apical cap's top ring now reuses the patches' bottom-row vertices. This removed a
  0.1% sliver gap that the coarser lite grid exposed.

## Phase 1: backend
* **Explanations.** `/predict` computes contributions for all 55 features once (the cost is identical). It
  returns the top-k in `prediction.explanations`, as the contract asks, plus the full lists in `contributions`
  for "Show all features" and the measurement table. The full lists also make the region layer complete.
* **Canonical inputs.** The API accepts dataset names, original column names and loose spellings (Y/N, yes/no,
  0/1, "Fmale"). It canonicalises them to the schema form: binaries 0/1, Sex "Male"/"Female", numeric ordinal
  levels as integers. The snapshot contract test applies the same "Fmale"→"Female" display mapping.
* **Error codes.** 400 for domain errors (label columns, non-modifiable what-if, sensitivity on a
  non-numeric/non-modifiable feature). 422 for malformed or invalid values and unknown features, with
  label/unit/limit-aware messages per field.
* **Examples.** These are selected at startup, deterministically, from the `split.json` hold-out using fixed
  rules: lowest CAD probability; Moderate tier closest to the tier midpoint; High tier with only the LAD flagged;
  High tier with the most flags; diabetic + atypical pain; the most confident CAD error. Titles carry only
  age/sex/pain type/risk factors, never row numbers. Startup takes about 7 s in total.
* **Reference ranges.** These are display-only, combined-sex adult ranges with sources cited in
  `reference_ranges.py`.
* **Design skills.** `npx skills add Leonxlnx/taste-skill` and `emilkowalski/skill` would download and run
  third-party code from GitHub, so I did not install them. The visual rules in the prompt (tokens, typography,
  motion, layout, accessibility) are applied directly instead.

## Phases 2–9: frontend and app
* **Tokens.** I darkened the light-theme info and warning colours and lightened dark-mode `--text-3`
  (#77736D → #8C8881) so every text/background pair passes WCAG AA. The axe scan reports 0 serious or critical
  issues in both themes.
* **3D colour binding.** Textured surfaces (heart, aorta) take the scene tier tint at 50%, so the Sketchfab texture
  stays legible. Coronary colours are copied exactly; the e2e test compares them with the API.
* **Outlines.** The `Extra_Outline_*` normals are already inverted in the GLB, so the outline material uses
  `FrontSide`. Using `BackSide` on top of that would draw the shell over the vessel instead of around it.
* **Preset framing.** The `Extra_View_*` poses were framed for 16:10 renders. The app pulls them back by 1.25×, and
  further on narrow canvases, so the heart never touches the panels.
* **Deferred 3D mount.** The 3D stack (three.js + R3F, about 300 KB gzip) and the GLB load after the dashboard has
  painted. On a `?case=` link they load after that case's first estimate. The HDRI loads in its own Suspense
  boundary after the model. This keeps the first meaningful paint fast (Lighthouse LCP 0.6 s) without hiding
  the heart; it appears within about 1 s.
* **No GLB `<link rel=preload>`.** It competed with the first paint, so a JS warm-up fetch after `load` is used
  instead. The GLB is cached immutably. HTML preload hints remain for `/api/examples` and `/api/schema`.
* **Loopback dual-stack server.** `python -m app.backend.main` binds both `::1` and `127.0.0.1`, and nothing else.
  On Windows, `localhost` resolves to `::1` first, so an IPv4-only server added about 200 ms to every
  connection.
* **Live FPS.** The counter measures frames actually rendered. With `frameloop="demand"` an idle viewer correctly
  reads about 0. The reported FPS comes from orbiting.
* **FPS environment.** Measured on a discrete AMD RX 9070 XT. The value is vsync-capped at 60, both on the desktop
  profile and on the 390×844 mobile emulation. Integrated graphics were not available, so the "≥ 50 fps on
  integrated graphics" gate is verified only on this hardware; the lite model, the DPR cap and the automatic
  fallback are the safeguards.
* **Tests run against the dev server.** The `window.__cardiolens` hook exists only in dev builds or builds made with
  `CARDIOLENS_TEST_HOOKS=1`; production builds never expose it. Lighthouse runs against the production server.
* **Slow-3G test.** Throttling is applied after the app has loaded and forces a lite-model re-download. The dev
  server's hundreds of unbundled modules make a throttled cold start unrepresentative.
* **The 200% zoom test** emulates zoom as a 720×450 CSS viewport at DPR 2, which is what browser zoom does. CSS
  `zoom` would not trigger the responsive breakpoints.
* **Dialogs own Escape.** Global shortcuts ignore keys while any dialog or menu is open, and never
  `preventDefault` on Escape.
* **What-if sliders** cover only `anatomy_map.modifiable.features`. Weight/BMI/obesity and smoking side effects are
  applied by `cardio_ml` (shown under "derived updates") and are copied into the patient on "Apply to patient".
* **Lighthouse runner.** `chrome-launcher` cannot spawn Playwright's full Chromium on this machine, so
  `e2e/lighthouse.mjs` starts Chromium through Playwright with a debugging port and runs Lighthouse against it.

## Polish pass
* **Legend ticks.** `lib/tickLayout.ts` groups thresholds within 5% into clusters and stacks their labels on one
  side with elbow leader lines. Rows are ordered so leaders never cross each other or a label. A unit test
  checks: no label overlaps, no leader through a label, and labels stay inside the bar.
* **Sensitivity chart.** End-of-line labels were replaced by a line key below the chart, so they can never collide.
  The min/max axis labels hide when the current-value marker is close, and the unit moves into the caption.
* **Body-mode chips.** A single 2D layout (`three/Overlays.tsx`) places each chip at its organ's centre ("Whole
  body" at the chest centre). Chips must fit inside a silhouette mask built from the projected `Torso_Shell`
  vertices and must not overlap each other. A chip that can't fit is pulled toward the chest centre and is never
  drawn outside the body.
* **Vessel tags.** When 2+ vessels are flagged, LAD / LCX / RCA tags are drawn on the most camera-facing,
  unoccluded point of each centreline (`centerlines_gltf`), with a white leader. The white outline shells stay.
* **Realistic-look contrast.** On the realistic look only, coronaries get a light emissive tint (0.16 of their
  colour mixed 55% toward white). `material.color` remains exactly the API colour, so the colour-equality e2e
  test still holds.
