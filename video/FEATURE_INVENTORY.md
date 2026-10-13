# CardioLens: feature inventory for the demo video

Every user-visible feature and notable technical detail, verified in the code on branch `video`
(base `origin/main` @ c2b3cd7). **Importance:** A = must show, B = show briefly, C = montage / caption only.
"Trigger" is how the capture scripts reach it.

## ML (Steps 1–4)

| # | Item | Files | Trigger / source | Imp. |
|---|---|---|---|---|
| M1 | Dataset: Extension of Z-Alizadeh Sani, UCI id 411, 303 patients, 55 features | `cardio_ml/data.py`, `artifacts/metrics.json` (`dataset`) | dataset card | A |
| M2 | 4 targets: Cath/CAD, LAD, LCX, RCA (71 / 58 / 39 / 38 % positive) | `cardio_ml/config.py`, `artifacts/figures/eda_target_balance.png` | figure | A |
| M3 | Leakage rule: label columns never inputs; asserted before every fit; API returns 400 | `cardio_ml/models.py`, `app/backend/services.py`, `app/backend/tests/test_api.py` | card + test name | A |
| M4 | Data audit: constant `Exertional CP` dropped | `notebooks/track_a_ml.py` §1.3 | caption | B |
| M5 | Data audit: "Fmale" source typo handled | `cardio_ml/data.py` (`_SEX`) | caption | C |
| M6 | Label-logic check (every CAD patient has ≥1 stenotic vessel; 1 "Normal" with a vessel kept as recorded) | notebook §1.4 | caption | B |
| M7 | Engineered features: Diamond–Forrester pretest probability, eGFR (CKD-EPI 2021), TG/HDL, LDL/HDL, NLR, PLR, absolute lymphocytes, risk-factor / ECG counts | `cardio_ml/features.py` | list card | A |
| M8 | Validation: stratified 20 % hold-out (n = 61), 5×5 repeated CV, nested Optuna (inner 3-fold, 30 trials), 1000 bootstrap CIs | `cardio_ml/evaluation.py`, `metrics.json.validation` | animated diagram | A |
| M9 | Model zoo: LR, SVM, RF, ExtraTrees, LightGBM, XGBoost, CatBoost, voting, stacking; TabPFN attempted and skipped (licence) | `cardio_ml/models.py`, `model_zoo_auc.png`, `metrics.json.tabpfn` | figure | A |
| M10 | Vessel strategies A / B / C compared; A kept | `cardio_ml/vessels.py`, `metrics.json.vessel_strategies` | card | A |
| M11 | Calibration (sigmoid), F1-optimal thresholds (CAD 0.195, LAD 0.465, LCX 0.29, RCA 0.275), risk tiers (Low < 0.08 ≤ Moderate < 0.82 ≤ High) | `thresholds.json`, `calibration_reliability.png` | figure + chips | A |
| M12 | Results (hold-out AUC [95 % CI]): CAD 0.895 [0.806, 0.966], LAD 0.832 [0.725, 0.930], LCX 0.768 [0.647, 0.878], RCA 0.741 [0.598, 0.868] + acc/prec/recall/F1 | `metrics.json.holdout` | results table | A |
| M13 | Feature selection inside folds (LCX SHAP top-15, RCA SHAP top-10) and ablation | `ablation.json`, notebook §3.4a–b | caption | C |
| M14 | SHAP mapped to raw features + 6 physiological groups; LIME agreement 3.1 / 5 | `cardio_ml/explain.py`, `shap_global_cad.png`, `metrics.json.lime_shap_top5_overlap` | figure | A |
| M15 | Latency: 149 ms mean / 150 ms p95 for a full prediction with explanations | `metrics.json.latency_ms` | count-up | B |

## Step 5: mapping

| # | Item | Files | Trigger / source | Imp. |
|---|---|---|---|---|
| P1 | `anatomy_map.json` = single source of truth; `scene_state()` pure function (~0.3 ms, schema-validated) | `cardio_ml/anatomy.py`, `artifacts/anatomy_map.json`, `scene_state.schema.json` | animated diagram | A |
| P2 | CIELAB sequential colour scale; colour = probability, flag/outline = threshold | `step5_color_scale.png`, `anatomy.py` | figure | A |
| P3 | Reliability badges from hold-out AUC (CAD High, LAD/LCX Moderate, RCA Limited) | `anatomy_map.json`, VesselCards | app shot | A |
| P4 | Whole-vessel colouring (no lesion location); LM / branches neutral | `STEP5_MAPPING.md`, `coronary_schematic_*.png` | figure | A |
| P5 | AHA 17-segment territories, right-dominant | `territories_demo.png`, `Territory_*` meshes | figure + app (T) | B |
| P6 | Body regions = "location of a contributing risk factor, NOT disease" | `anatomy.py`, Overlays | app (B) | B |
| P7 | What-if = correlational (model-estimated associations) | `anatomy.what_if()`, WhatIfPanel | caption + app | A |
| P8 | Snapshot tests of scene state | `tests/snapshots/*.json`, `tests/test_anatomy.py` | caption | C |

## Step 6: 3D asset

| # | Item | Files | Trigger / source | Imp. |
|---|---|---|---|---|
| H1 | Procedural CC0 heart v1, kept as fallback (`--heart-source procedural`) | `blender/build_heart.py`, `backup/step6_procedural/` | figure | B |
| H2 | Sketchfab "Realistic Human Heart" by neshallads, CC BY 4.0 (credit on screen) | `blender/sketchfab_heart.py`, `src_*.png` | figure + credit | A |
| H3 | Aligned to long axis, scaled to 12 cm; split Heart_Myocardium + Aorta; descending aorta extended | `sketchfab_heart.py` | caption | B |
| H4 | Coronaries traced from the painted texture (minimum-cost paths in grooves); LCX Chebyshev (deg 4) smoothing; LM 10 mm | `blender/vessel_trace.py`, `build_heart.py` (`LM_LENGTH = 0.010`) | figure + caption | A |
| H5 | Hit proxies (`Extra_Hit_*`), outline shells (`Extra_Outline_*`), anchors, view presets (`Extra_View_*`) | `build_heart.py`, `three/Picking.tsx` | diagram caption | B |
| H6 | Realistic / Clinical via `KHR_materials_variants` | `heart_front.png`, `heart_front_clinical.png` | figure + app (L) | A |
| H7 | Draco + WebP; full 108,326 tris / 1.58 MB, lite 45,938 tris / 0.60 MB | `STEP6_ASSET.md`, `lite_vs_full.png` | figure | B |
| H8 | `check_glb.py` validator; one-command headless build (`blender/make_all.py`); Poly Haven CC0 HDRI; `viewer_look.json` | `blender/*`, `artifacts/viewer_look.json` | caption | C |
| H9 | Sketchfab vs ours comparison | `compare_sketchfab_vs_ours.png` | figure | B |

## Steps 7–8: app

| # | Item | Files | Trigger | Imp. |
|---|---|---|---|---|
| U1 | Opening animation (once per tab session; skippable) | `features/shell/OpeningAnimation.tsx`, `public/media/cardiolens-opening.mp4` | fresh session | B |
| U2 | First-run 3-step tour (skippable, remembered); empty state | `onboarding/Tour.tsx`, `EmptyState.tsx` | fresh profile | B |
| U3 | 6 sample patients (deterministic hold-out picks incl. "Model uncertainty example"); `?case=` links | `patient/SampleMenu.tsx`, `/api/examples` | Sample patients menu, `?case=multi` | A |
| U4 | Patient panel: schema-driven controls, search, accordions with "N changed" chips | `patient/PatientPanel.tsx`, `FieldControl.tsx` | ☰ patient dock | A |
| U5 | Normal-range bands, help tooltips, extrapolation notes | `FieldControl.tsx`, `app/backend/reference_ranges.py`, `content/feature_display.json` | hover ⓘ | B |
| U6 | Effect meters (from `feature_response.json`); Alt+click reset; Reset with Undo | `FieldControl.tsx`, `scripts/feature_response_audit.py` | bars icon, Reset | B |
| U7 | Live prediction: 250 ms debounce + abort; stale result kept while loading | `api/hooks.ts`, `lib/debounce.ts` | edit a field | A |
| U8 | Offline banner + auto-recovery | `shell/StatusBanner.tsx`, `useServiceRecovery` | route abort in capture | B |
| U9 | Change toast with per-target deltas, or "little effect" | `three/ChangeFeedback.tsx` | toggle HTN / murmur | A |
| U10 | Vessel flash + Δ chips; tier transition; region link chip | `ChangeFeedback.tsx`, `Overlays.tsx` | toggle smoker | A |
| U11 | "What changed" panel with revert | `risk/WhatChanged.tsx` | after edits | B |
| U12 | Orbit / zoom / damping | `three/CameraRig.tsx` | drag, wheel | A |
| U13 | Hover tooltips (probability, threshold, reliability, whole-vessel note) | `three/Tooltip3D.tsx`, `Picking.tsx` | hover LAD | A |
| U14 | Click → camera fly-to + two-way selection with cards and Why tab | `Picking.tsx`, `CameraRig.tsx`, `store.ts` | click LAD | A |
| U15 | LM / branches "not modelled" tooltip | `Tooltip3D.tsx` | hover left main | B |
| U16 | View presets 1–4, Realistic/Clinical (L), heartbeat (H), turntable | `CanvasToolbar.tsx`, `Shortcuts.tsx` | keys / toolbar | A |
| U17 | Reset (R), fullscreen (F), screenshot PNG, display quality Auto/Full/Lite (PerformanceMonitor auto-switch) | `CanvasToolbar.tsx`, `Viewer.tsx`, `snapshot.ts` | toolbar | B |
| U18 | Legend with collision-free threshold ticks | `three/Legend.tsx`, `lib/tickLayout.ts` | always on | B |
| U19 | Territories (T) | `Overlays.tsx`, `useSceneBinding.ts` | T | A |
| U20 | Body mode (B): region glows / chips + x-ray slider | `Overlays.tsx`, `CanvasToolbar.tsx` | B | A |
| U21 | Vessel name tags when several are flagged | `Overlays.tsx` | `?case=multi` | B |
| U22 | 2D fallback without WebGL | `three/Fallback2D.tsx` | `?nowebgl` | C |
| U23 | Risk summary: probability, tier chip, expected vessels, reliability, plain-language summary | `risk/RiskSummary.tsx`, `ResultsPanel.tsx` | right column | A |
| U24 | Vessel cards: bar + threshold tick, flags, reliability, top drivers | `risk/VesselCards.tsx` | right column | A |
| U25 | Why? SHAP waterfall per target + show all | `explain/WhyPanel.tsx`, `ShapWaterfall.tsx` | scroll to Why | A |
| U26 | Physiological breakdown + sortable measurement table with typical ranges | `explain/Breakdown.tsx` | scroll | A |
| U27 | What-if: modifiable sliders only, before/after/Δ table, show on heart, hold-to-compare, sensitivity chart, causality caveat, apply/reset | `whatif/WhatIfPanel.tsx`, `SensitivityChart.tsx`, `Viewer.tsx` | Explore what-if | A |
| U28 | Model card: metrics with CIs, validation, thresholds/tiers, figures, reliability, limitations, sample outcomes, attributions | `modelcard/ModelCardDialog.tsx`, `/api/model-card` | Model card | A |
| U29 | Export: PDF report (disclaimer on every page), copy summary, PNG | `report/ExportMenu.tsx`, `buildReportPdf.ts`, `copySummary.ts` | Export ▾ | A |
| U30 | Educational overlay (off by default, sourced general facts, never changes the heart) | `onboarding/EducationCard.tsx`, `content/education.json`, `/api/education` | toolbar book icon | B |
| U31 | Dark / light theme | `shell/ThemeToggle.tsx` | sun icon | B |
| U32 | Tablet bottom sheet; mobile tabs | `shell/BottomSheet.tsx`, `MobileTabs.tsx` | 1024 / 390 viewports | B |
| U33 | Keyboard shortcut sheet (?) | `shell/Shortcuts.tsx` | ? | B |
| U34 | Dev debug drawer (Ctrl+Shift+D) | `shell/DebugDrawer.tsx` | caption only | C |
| U35 | Accessibility: live region, focus rings, reduced motion, skip link | `App.tsx`, `e2e/a11y.spec.ts` | caption | C |
| U36 | Persistent non-dismissible disclaimer; credits footer | `shell/DisclaimerStrip.tsx` | always on | A |
| U37 | Collapsible patient dock (new UI by Shinjan) | `App.tsx` (`patient-dock`) | ☰ | B |

## Engineering

| # | Item | Files | Source | Imp. |
|---|---|---|---|---|
| E1 | FastAPI endpoints: health, schema, examples, predict, what-if, sensitivity, model-card, anatomy-map, education; unified error shape | `app/backend/routers/*`, `main.py` | API card | A |
| E2 | Zero-hardcoding guard + proof test | `scripts/check_no_hardcoding.py`, `tests/test_no_hardcoding.py`, `e2e/proof.spec.ts` | terminal clip | A |
| E3 | Tests: pytest 49, vitest 22, Playwright (counts from the run on this build) | `tests/`, `app/backend/tests/`, `app/frontend/src/test/`, `app/frontend/e2e/` | terminal clip | A |
| E4 | 3D colour == API (±1/255) e2e test | `e2e/colours.spec.ts` | caption + terminal | A |
| E5 | PDF text test, offline recovery test | `e2e/app.spec.ts`, `e2e/live.spec.ts` | caption | C |
| E6 | axe: 0 serious; ~59 fps; Lighthouse | `e2e/a11y.spec.ts`, `artifacts/fps_*.json`, `lighthouse.json` | numbers card | A |
| E7 | Deployment: Vercel (havoc-rho.vercel.app, one container service), Docker, `Start CardioLens.bat`, `scripts/dev.py` | `vercel.json`, `Dockerfile.vercel`, `Dockerfile`, `scripts/start.py` | live capture + card | A |
| E8 | Reproducibility: notebook retrains (seeded, cached), `blender/make_all.py` rebuilds the asset, `scripts/build.py` | `notebooks/`, `blender/`, `scripts/` | caption | B |
| E9 | Type generation from the API schema | `scripts/gen_types.py`, `api/types.gen.ts` | caption | C |
| E10 | Feature-response audit | `scripts/feature_response_audit.py`, `feature_response_heatmap.png` | caption | C |
