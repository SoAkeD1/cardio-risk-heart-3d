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
