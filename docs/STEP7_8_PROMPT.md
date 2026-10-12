# ULTIMATE PROMPT v2 — Steps 7 + 8: CardioLens
# Interactive 3D cardiac-risk web app + FastAPI backend
# Multimodal AI Hackathon 2026 · Track A · Cardiovascular Risk Visualization & Prediction

==========================================================================================
## PART A — HOW TO WORK
==========================================================================================
You are a senior full-stack engineer, a three.js / React Three Fiber specialist, and a product designer for medical software.

Work AUTONOMOUSLY through Phases 0–9 below, in order. After each phase:
1. Run its gate.
2. Fix until it passes.
3. Commit with the message `phase N: <summary>`.

Stop and ask me ONLY if a required tool is missing or an action is destructive. Otherwise decide sensibly, and log the decision in `docs/DECISIONS.md`.

- Project root = this folder. All paths are relative to it. OS: Windows 11.
- Git: create the branch `step7-app` from the current branch.
- Python: use the existing `.venv`, if present, plus the `cardio_ml` package (installed `-e`).
- Node: ≥ 20. Use npm.
- Never edit `artifacts/models/*`, `thresholds.json` or `metrics.json`. The ML is frozen.
- Read before coding:
  - `cardio_ml/{predict.py, anatomy.py, config.py, explain.py}`
  - `artifacts/{feature_schema.json, thresholds.json, metrics.json, anatomy_map.json, scene_state.schema.json, viewer_look.json, ASSET_SPEC.md, STEP5_MAPPING.md, STEP6_ASSET.md, ML_SUMMARY.md, split.json}`
  - `blender/preview.html` (reuse its picking, outline, variant and look logic)
  - `tests/snapshots/*`
  - `docs/STEP6B_PROMPT.md`
- Write `docs/STEP7_PLAN.md`: architecture diagram (Mermaid), screen list, component tree, API list, risks. Then execute without waiting.

==========================================================================================
## PART B — PRODUCT DEFINITION
==========================================================================================
- **Name:** CardioLens. **Tagline:** "See where cardiac risk lives."
- **One-line pitch:** enter routine clinical data → see calibrated CAD and per-artery stenosis risk on an interactive 3D heart, with the reasons why and what-if exploration.

**Primary users:**
| User | Wants |
|---|---|
| Clinician | quick intuitive overview; trusts calibrated numbers; wants to know why |
| Medical student | learns coronary anatomy + risk factors |
| Hackathon judge | 3–5 minutes to evaluate: must reach the "wow" moment in < 10 s |

**Experience principles:**
1. Instant clarity: the result is understandable in under 5 seconds.
2. Calm, not alarming: clinical tone, restrained colour.
3. Honest: calibrated probabilities, reliability badges, limitations, disclaimer.
4. Direct manipulation: everything updates live; the 3D view and the dashboard stay in sync.
5. Zero friction: no sign-up, no required reading, sample patients one click away.

**Problem-statement requirements → where they're met** (keep this table updated in the README):
| PS ref | Requirement | Where it's met |
|---|---|---|
| 1a–e | Models, leakage rule, metrics | Already done (Steps 1–4). Surface them in the Model Card. |
| 2a | Interactive 3D torso/heart (R3F) | Viewer |
| 2b | LAD/LCX/RCA colours update from probabilities | Viewer, from scene_state |
| 2c | Rotate / zoom / select → vessel risk detail | Viewer + Vessel cards |
| 3a | CAD status + vessel probabilities beside the canvas | Right panel |
| 3b | Interpretable breakdown (SHAP) | "Why?" section |
| 3c | Measurements + relative contribution | Physiological breakdown |
| 4a | Open-source meshes | Sketchfab CC BY heart, credited |
| 5 | Visible disclaimer | Persistent strip + PDF + model card |
| Tech | No dedicated GPU needed | lite model, performance mode, FPS gate |
| Tech | Extensible | schema-driven UI, anatomy_map-driven 3D, model registry |
| Tech | Consistent correspondence | mesh names / colours only from scene_state + anatomy_map |

==========================================================================================
## PART C — ARCHITECTURE
==========================================================================================
```
app/
├── backend/
│   ├── main.py                 # FastAPI app factory, startup model load, static serving in prod
│   ├── settings.py             # pydantic-settings: ARTIFACTS_DIR, CORS_ORIGINS, LOG_LEVEL
│   ├── schemas.py              # Pydantic v2 request/response models (single source for OpenAPI)
│   ├── services.py             # thin wrappers around cardio_ml (no ML logic here)
│   ├── routers/{health,schema,examples,predict,whatif,sensitivity,modelcard,assets}.py
│   └── tests/test_api.py, test_contracts.py, test_perf.py
├── frontend/
│   ├── index.html
│   ├── vite.config.ts          # proxy /api → :8000; manualChunks for three
│   ├── tsconfig.json           # strict, noUncheckedIndexedAccess
│   ├── tailwind.config.ts      # reads CSS variables from tokens.css
│   ├── public/
│   │   ├── models/heart.glb, heart_lite.glb      (copied by scripts/sync_assets.py)
│   │   ├── decoders/draco/*, decoders/basis/*    (self-hosted)
│   │   ├── env/studio_small_09_1k.hdr
│   │   └── figures/*.png                         (model-card figures, 2D fallback schematics)
│   └── src/
│       ├── main.tsx, App.tsx, routes.tsx
│       ├── api/client.ts, api/types.gen.ts       (openapi-typescript), api/hooks.ts (TanStack Query)
│       ├── state/store.ts                        (Zustand — see Part E)
│       ├── lib/{format.ts, color.ts, debounce.ts, device.ts, storage.ts}
│       ├── three/
│       │   ├── Viewer.tsx              (Canvas, Suspense, performance monitor)
│       │   ├── Environment.tsx         (HDRI, lights, background from viewer_look.json)
│       │   ├── HeartModel.tsx          (load glb, variants, apply scene_state to meshes)
│       │   ├── useSceneBinding.ts      (mesh-name → material binding; animated colour tweening)
│       │   ├── Picking.tsx             (raycast hit proxies + myocardium; hover/select)
│       │   ├── Outline.tsx             (Extra_Outline_* shells + optional postprocessing outline)
│       │   ├── CameraRig.tsx           (OrbitControls, fly-to anchors / view presets)
│       │   ├── Territories.tsx, BodyLayer.tsx, RegionGlow.tsx
│       │   ├── Heartbeat.tsx           (uniform scale pulse; reduced-motion aware)
│       │   ├── Legend.tsx, Tooltip3D.tsx, CanvasToolbar.tsx
│       │   └── Fallback2D.tsx          (no-WebGL fallback: coronary schematic + dashboard)
│       ├── features/
│       │   ├── patient/{PatientPanel, FieldGroup, FieldControl, SampleMenu, ChangedChip}.tsx
│       │   ├── risk/{RiskSummary, RiskTierChip, VesselCard, VesselCards, ProbabilityBar}.tsx
│       │   ├── explain/{WhyPanel, ShapWaterfall, GroupBreakdown, MeasurementTable}.tsx
│       │   ├── whatif/{WhatIfPanel, WhatIfSlider, DeltaTable, SensitivityChart}.tsx
│       │   ├── modelcard/{ModelCardDialog, MetricsTable, FigureGallery, Limitations}.tsx
│       │   ├── report/{ExportMenu, buildReportPdf.ts, copySummary.ts}.tsx
│       │   ├── onboarding/{Tour, EmptyState}.tsx
│       │   └── shell/{TopBar, DisclaimerStrip, Footer, StatusBanner, ThemeToggle}.tsx
│       ├── ui/{Button, IconButton, Slider, NumberField, Toggle, Segmented, Tabs, Tooltip,
│       │       Dialog, Sheet, Drawer, Badge, Toast, Skeleton, Accordion, Kbd}.tsx  (Radix-based)
│       ├── styles/{tokens.css, globals.css}
│       └── test/ (vitest unit tests) + e2e/ (Playwright)
└── scripts/
    ├── sync_assets.py   # copy glb/hdr/figures/decoders from artifacts → frontend/public; verify hashes
    ├── dev.py           # start backend + frontend, wait for health, open browser; Ctrl+C stops both
    ├── build.py         # npm build → FastAPI serves frontend/dist at / on :8000
    └── gen_types.py     # export OpenAPI → openapi-typescript → src/api/types.gen.ts
```

**Pinned stack** (pin exact versions in package.json / requirements):
- **Backend:** fastapi, uvicorn[standard], pydantic v2, pydantic-settings, orjson, httpx (tests), pytest
- **Frontend:**
  - react 18, react-dom, typescript, vite
  - three, @react-three/fiber, @react-three/drei, @react-three/postprocessing
  - zustand, @tanstack/react-query
  - tailwindcss, @radix-ui/* primitives, lucide-react (icons)
  - motion (framer-motion)
  - visx (or recharts) for the SHAP / breakdown charts
  - jspdf + html-to-image (report)
  - openapi-typescript
  - vitest + @testing-library/react
  - @playwright/test, eslint, prettier

==========================================================================================
## PART D — BACKEND (Step 8) — exact contracts
==========================================================================================
**General:**
- Load `CardioPredictor` + `anatomy_map` ONCE at startup (lifespan) and keep them in app state.
- Log the load time.
- All ML logic comes from `cardio_ml`: predict_patient, explain_patient, scene_state, what_if, sensitivity_curve, load_map. No duplicated logic.
- JSON via ORJSONResponse; gzip middleware (min 1 KB).
- CORS: only `http://localhost:5173` in dev; none in prod (same origin).
- Errors use one shape: `{ "error": { "code": str, "message": str, "fields": {name: message}? } }`
  - 422: validation — human-readable messages using the schema's labels, units and limits
  - 400: domain errors, e.g. a label column given as input, or a non-modifiable what-if feature
  - 500: generic, no stack trace leaks
- Every prediction-bearing response includes `disclaimer` (the exact `config.DISCLAIMER` string) and `latency_ms`.
- Patient payload: `{ "features": { <feature_name or original_name>: value } }`. Missing features fall back to the schema defaults (cardio_ml already does this). Echo back the `resolved_features` actually used.

**Endpoints:**

1. `GET /api/health` → `{status:"ok", models:{cad,lad,lcx,rca: model_name}, vessel_strategy, loaded_at, load_ms, version}`
2. `GET /api/schema` →
   ```
   { groups:[{key,label,order}],
     features:[{name, original_name, label, group, type, unit, min, max, default,
                allowed_values?, normal_range?, modifiable:bool, help}] }
   ```
   - `normal_range`: add a small, documented reference table in `app/backend/reference_ranges.py` for BP, PR, FBS, CR, TG, LDL, HDL, BUN, ESR, HB, K, Na, WBC, Lymph, Neut, PLT, EF-TTE, BMI. Cite the general adult reference sources in comments. Display only — never fed to the model.
   - `help`: a 1-line plain-language explanation per feature (write good ones for all 55).
3. `GET /api/examples` → 6 curated hold-out patients, chosen deterministically from `split.json` test indices:
   - clear low-risk
   - borderline / moderate
   - high-risk single-vessel (LAD)
   - high-risk multi-vessel
   - a diabetic with atypical pain
   - a case the model gets wrong (label it "Model uncertainty example" — honest)

   Each: `{id, title (e.g. "58 M · typical angina · diabetic"), subtitle, features, true_labels(for model card only, hidden in the main UI)}`. De-identified: no row numbers in titles.
4. `POST /api/predict` body `{features, k?:8, focus?:"cad"|"lad"|"lcx"|"rca", show_territories?:bool}` →
   ```
   { prediction: <predict_patient output>,
     scene: <scene_state output, validated against scene_state.schema.json>,
     summary_text: str,   # 1–2 sentence plain-language summary built from tier + top-3 CAD drivers
     resolved_features, warnings, disclaimer, latency_ms }
   ```
5. `POST /api/what-if` body `{features, changes:{feature:value}}` →
   `{before, after, delta:{cad,lad,lcx,rca}, scene_after, derived_updates_applied, note, disclaimer, latency_ms}`
   - 400 for non-modifiable features, listing the allowed ones.
6. `POST /api/sensitivity` body `{features, feature, n?:15}` → `{feature, unit, points:[{value,cad,lad,lcx,rca}], current_value, note}`. Modifiable numeric features only.
7. `GET /api/model-card` →
   ```
   { dataset_citation, n_patients, validation, targets:[{key,label,model,strategy,holdout:{metric:{value,ci_low,ci_high}},
     nested_cv:{auc_mean,auc_std}, threshold, reliability_badge}], risk_tiers, calibration,
     limitations:[str], figures:[{title, path}], attributions:[{what, text, url, license}] }
   ```
   Built from metrics.json, thresholds.json, ML_SUMMARY.md, anatomy_map.asset.sources, viewer_look.environment.
8. `GET /api/anatomy-map` → `anatomy_map.json` (the frontend reads names, styles, tooltips and modifiable features from here).
9. In production: `GET /` + static → `frontend/dist` (SPA fallback); cache headers immutable for hashed assets and the glb.

**Backend tests (pytest + httpx AsyncClient):**
- Every endpoint: 200 + schema shape (validate scene against `scene_state.schema.json` with jsonschema).
- Leakage: posting `Cath` / `LAD` / `LCX` / `RCA` as features → 400 with a clear message.
- Invalid input: a non-numeric string, out-of-physiological-limits, an unknown feature → 422 with field messages.
- Defaults: an empty `features` → 200, using the defaults.
- Determinism: the same input gives an identical output.
- The snapshot patients (tests/snapshots) match the scene output.
- What-if: non-modifiable → 400; modifiable → deltas equal after − before.
- The disclaimer appears in every prediction-bearing response.
- Performance: 50 sequential /predict calls → print p50/p95. **Gate: p95 < 250 ms.**

==========================================================================================
## PART E — FRONTEND STATE & DATA FLOW
==========================================================================================
**Zustand store (`state/store.ts`), typed:**
```ts
patient: Record<string, number|string>        // current inputs
defaults: Record<string, number|string>       // from schema
prediction?: PredictResponse                  // last good result (kept while refetching)
pending: boolean
whatIf: { enabled: boolean; changes: Record<string, number>; result?: WhatIfResponse; showOnHeart: boolean }
selection: { target?: 'lad'|'lcx'|'rca'; hover?: string }
explainTarget: 'cad'|'lad'|'lcx'|'rca'
view: { mode:'heart'|'body'; preset:'front'|'left'|'posterior'|'body'; look:'realistic'|'clinical';
        territories:boolean; xray:number; heartbeat:boolean; performance:'auto'|'quality'|'lite' }
ui: { theme:'dark'|'light'; leftOpen:boolean; rightTab:string; tourDone:boolean }
```

**Flow:**
1. Any patient change → debounce 250 ms → `useMutation(/api/predict)`, with an AbortController that cancels stale requests.
2. On success → `prediction` updates → the 3D binding tweens to the new scene colours, the panels update.
3. Keep the previous `prediction` rendered while pending (a subtle top progress line). Never blank the UI.
4. Persist `view` + `ui` (not patient data) in localStorage, wrapped in try/catch. Restore on load.
5. Shareable state: an optional `?case=<exampleId>` URL param loads a sample.

==========================================================================================
## PART F — 3D VIEWER (Step 7 core) — implementation details
==========================================================================================

**F1. Canvas setup**
- `<Canvas>`:
  - `dpr={[1, 1.75]}` (lite mode: [1, 1.25])
  - `gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}`
  - `frameloop="demand"` when idle; switch to `"always"` only while animating (pulse, heartbeat, fly-to)
- Background: a CSS radial gradient behind a transparent canvas (from viewer_look.json: #3A3A3A → #1E1E1E). The light theme uses a soft light-grey gradient instead.
- Environment: drei `<Environment files="/env/studio_small_09_1k.hdr" />` + key and rim directional lights with viewer_look intensities and directions (camera-relative: update them on camera change). No realtime shadows.
- `<PerformanceMonitor>`: if the average fps < 40 for 2 s → switch to lite (once), lower the dpr, and show a toast "Switched to performance mode" with an undo.

**F2. Model loading**
- `useGLTF('/models/heart.glb', '/decoders/draco/')` + KTX2Loader with `/decoders/basis/`; preload.
- Auto-select lite when: `navigator.deviceMemory <= 4`, OR mobile UA / coarse pointer, OR the user chose "lite".
- Progress overlay: drei `useProgress` → a thin bar + % on a faint heart silhouette. Fade in the model over 300 ms.
- **Variants:** read `KHR_materials_variants` from the glTF (parser.json extensions). Implement `selectVariant('realistic'|'clinical')`, swapping materials per mesh mapping (as in preview.html). Fall back to a `heart_clinical.glb` if variants are absent.

**F3. Binding scene_state → meshes (`useSceneBinding`)**
- Build `Map<meshName, Mesh>` once after load.
- Validate that every mesh named in `anatomy_map` exists; dev console error + UI warning if not.
- For each `scene.meshes[name]`:
  - Clone the material ONCE per mesh (don't mutate shared materials).
  - Tween `material.color` → `color` and `emissive` → `color × emissive`, over 400 ms, easeOutCubic, done in `useFrame` with lerp (no layout thrash).
  - `opacity` → `transparent` = opacity < 1.
  - `flagged` → show `Extra_Outline_<V>` (MeshBasicMaterial, white #FFFFFF, side BackSide, opacity 0.9); emissive pulse `e(t) = base × (0.6 + 0.4·sin(2π·pulse_hz·t))`.
- Coronary vessels: only LAD/LCX/RCA get risk colours. LM / branches keep neutral `anatomy_map` colours.
- **What-if preview:** when `whatIf.showOnHeart`, bind `scene_after` instead, and show a small "WHAT-IF PREVIEW" chip on the canvas plus a "Compare" hold-to-peek button (hold → shows the original).

**F4. Picking & hover (`Picking.tsx`)**
- Raycast against `[Extra_Hit_LAD, Extra_Hit_LCX, Extra_Hit_RCA, Heart_Myocardium, Aorta, Coronary_LM, Coronary_Branches, Organ_*]`; the nearest hit wins. Throttle hover raycasts to rAF.
- Hover:
  - vessel → cursor pointer, a subtle lift (emissive +0.15), and a tooltip anchored near the pointer:
    ```
    <Display name>
    Stenosis probability 72%  ·  threshold 47%   [Stenosis likely]
    Reliability: High (hold-out AUC 0.83)
    Whole-vessel estimate — dataset has no lesion location
    ```
  - LM / branches → "Not modelled — no label in dataset"
  - myocardium → the CAD tier summary
  - organ (in body mode) → the region tooltip from scene.regions
- Click vessel → `selection.target = key`:
  - camera fly-to `Anchor_<KEY>`
  - right panel: scroll to + pulse-highlight that vessel card (two-way: clicking a card selects in 3D too)
  - explainTarget switches to that vessel
- Click empty space → clear the selection. Double-click → focus the point (orbit target).
- Touch: tap = hover + select; long-press = tooltip.

**F5. Camera (`CameraRig.tsx`)**
- OrbitControls:
  - damping 0.08
  - rotateSpeed 0.6, zoomSpeed 0.8
  - min/max distance from the heart bounds (0.18–0.9 m in heart mode, 0.6–3.5 m in body mode)
  - polar limits to avoid flipping
  - panning limited to the bounds
- Presets from the `Extra_View_*` nodes (position + their −Z look-at target from extras). Fly-to = 600 ms easeInOutCubic on position + target. Skip the animation if prefers-reduced-motion.
- Idle: NO auto-rotate by default. Optional "Turntable" toggle for demos, 6°/s.

**F6. Heart beat & motion**
- Uniform scale of the `Heart` group: `s = 1 + A·beat(t)` with A = 0.012, at a 1.0 Hz rate. Double-bump curve (lub-dub).
- High tier → A 0.018. Off when reduced-motion or the toggle is off.
- All motion is ≤ 3 Hz; the flag pulse is ≤ 1.6 Hz, from scene_state.

**F7. Overlays (CanvasToolbar — top-right of the canvas, icon buttons with tooltips + keyboard shortcuts)**
| Control | Behaviour |
|---|---|
| View presets | Front (1) / Left (2) / Posterior (3) / Body (4) |
| Look | Realistic / Clinical (L) |
| Territories | toggle (T): the `Territory_*` meshes at `anatomy_map.style.territory.opacity`, tinted from the vessel colours; tooltip with the AHA + right-dominance assumption text |
| Body mode | toggle (B): Torso_Shell visible, opacity from `xray` (slider 0.05–0.4), organs visible; the top-3 `scene.regions` glow (warm #E4572E raises / cool #3B7DD8 lowers, intensity = region.intensity, gentle 0.5 Hz breathing glow) + floating arrow chips (↑/↓ + region name) at each anchor; `Anchor_Blood` shows a "Blood tests" HUD chip |
| Heartbeat | toggle (H) |
| Turntable | toggle |
| Reset view | (R) |
| Screenshot | camera icon → PNG of the canvas + a legend overlay |
| Fullscreen canvas | (F) |

**F8. Legend (bottom-left of the canvas, collapsible)**
- A horizontal gradient bar from `anatomy_map.style.color_scale.stops` (CIELAB interpolation done in `lib/color.ts`), 0–100%.
- Threshold ticks labelled LAD 47% / LCX 29% / RCA 28% (from the API, not hardcoded).
- Text: "Colour = calibrated probability of ≥50% stenosis · Outline = above decision threshold".
- Neutral swatch: "Not modelled (left main, branches)".

**F9. Fallbacks**
- No WebGL → `Fallback2D`: the coronary schematic coloured by the API values (SVG drawn in code, with names from the map), plus the full dashboard. A banner explains it.
- Model fails to load → retry button; the dashboard still works.

**F10. Performance gates**
- Full model at 1080p on integrated graphics: ≥ 50 fps while orbiting. Lite on a mobile emulation: ≥ 30 fps.
- Bundle: three in a separate chunk; initial JS ≤ 450 KB gzip (excluding the glb); lazy-load the model card, PDF and charts.
- The glb is served with long cache headers; preload hints in index.html.

==========================================================================================
## PART G — DASHBOARD & PANELS
==========================================================================================

**G1. Left panel — Patient (340 px; drawer on tablet/mobile)**
- Header: "Patient", a [Load sample ▾] menu (the 6 examples, with titles), [Reset], and a search field (filters fields by label).
- Accordions per group, in order: Demographics · Risk factors · Examination & symptoms · ECG · Labs · Echocardiography. The group header shows a "• N changed" chip.
- FieldControl, chosen by schema type:
  - binary → Toggle (Yes/No)
  - categorical / ordinal → Segmented control (≤ 4 options) or Select
  - numeric → Slider + NumberField, with:
    - unit (mono font)
    - the normal-range band drawn on the slider track
    - min/max from the schema
    - step from the data precision
- Help: an info icon → a tooltip with `help` text + the normal range. Values outside the training range get a soft amber "extrapolation" note under the field (text, not colour alone).
- Sex uses "Male / Female" labels (map the "Fmale" typo internally).
- Changed-from-default fields show a small dot; Alt+click resets that field.

**G2. Right panel — Results (380 px; bottom sheet on tablet; tabs on mobile)**

Order (scrollable, sticky section headers):

1. **RiskSummary**
   - Large CAD probability ("73%", tabular numerals, 40 px) + RiskTierChip (Low / Moderate / High: icon + text + tier colour from map style) + the label at the threshold ("CAD likely").
   - "Expected stenotic vessels: 1.4 of 3".
   - `summary_text` from the API, in a readable 15 px paragraph.
   - Loading state: the numbers cross-fade; no layout shift (fixed heights).
2. **VesselCards** (LAD, LCX, RCA, always in this order). Each card:
   - Name + short description (from the map)
   - ProbabilityBar: track = the colour scale, a marker at the probability, a tick at the threshold, value text
   - Badges: [Stenosis likely] (if flagged) and [Reliability: High / Moderate / Limited]
   - Top 3 drivers: "↑ Typical chest pain (Yes) +12 pts"
   - Clicking or hovering the card highlights the vessel in 3D (two-way sync); the selected card gets an accent border.
3. **WhyPanel (PS 3b)**
   - Tabs: CAD | LAD | LCX | RCA (synced with the selection).
   - ShapWaterfall (visx):
     - top-k bars, sorted by |contribution|
     - each bar labelled "<label> = <value> <unit>"
     - signed contribution in probability points, with a ↑ / ↓ icon
     - colours: raises = #E4572E-family, lowers = #3B7DD8-family (from the map regions style)
     - base value → final probability
   - "Show all features" expands to the full list. One-line explainer: "Bars show how much each measurement pushed this patient's estimate up or down (SHAP)."
4. **Physiological breakdown (PS 3c)**
   - GroupBreakdown: 6 horizontal bars (demographic, risk factor, examination, ECG, lab, echo), `contribution_pct`, for the selected target.
   - MeasurementTable (sortable): Measurement | Value | Unit | Normal range | Status (within / above / below, as text + icon) | Contribution % | Direction.
5. **WhatIfPanel**
   - Toggle "Explore what-if". Sliders only for `anatomy_map.modifiable` features (BP, LDL, HDL, TG, FBS, Current smoker, Weight/BMI, DM, HTN, DLP); each slider starts at the current patient value.
   - DeltaTable: Target | Before | After | Δ (pts, with ↑ / ↓).
   - "Show on heart" toggle (binds scene_after) + hold-to-compare.
   - SensitivityChart (visx line) for the focused slider: x = feature range, y = probability for the 4 targets, with a marker at the current value.
   - Always visible: "Model-estimated change only — correlational, not a treatment effect."
   - [Apply to patient] (copies the changes into the inputs) and [Reset what-if].

**G3. Top bar**
- Logo mark + "CardioLens".
- Sample patients ▾ · Model card · Export ▾ (PDF report, PNG screenshot, Copy summary) · Theme toggle · Help (re-open the tour) · keyboard-shortcut sheet (?).

**G4. Model Card (Dialog, lazy)**
- Sections:
  1. Dataset (citation, n = 303, single centre)
  2. Validation (nested CV + 20% hold-out, bootstrap CIs)
  3. Metrics table: rows = targets; columns = accuracy, precision, recall, F1, ROC-AUC, PR-AUC, Brier — value [CI]
  4. Thresholds & risk tiers (with the rule text)
  5. Calibration + ROC figures
  6. Reliability badges explained
  7. Limitations (bullets from the API)
  8. Attributions (dataset, Sketchfab CC BY full text, Poly Haven CC0, libraries)
- A "Sample case outcome" section MAY show the true labels of example patients, clearly labelled "for evaluation transparency".

**G5. Export**
- PDF (A4, jsPDF; 1–2 pages):
  - header with logo + timestamp
  - patient summary table (changed and key fields)
  - 3D snapshot (front preset, rendered offscreen at 2×)
  - CAD probability + tier + vessel probabilities with flags + reliability
  - top-5 drivers per target
  - group breakdown
  - what-if section (if used), with the caveat
  - the disclaimer in the footer of every page
  - attribution line
- Copy summary: a plain-text clinical summary.
- PNG: canvas + legend.

**G6. Shell**
- DisclaimerStrip: fixed at the bottom, 36 px, never dismissible, calm neutral style + info icon. The text is exactly `config.DISCLAIMER` (from the API).
- Footer, inside the strip or the Model card: "3D heart: 'Realistic Human Heart' by neshallads, CC BY 4.0 — modified" (with a link) · "Data: Z-Alizadeh Sani (UCI)".
- StatusBanner: backend offline / model load failure / no WebGL, with a retry.

**G7. Onboarding**
- First visit: EmptyState in the right panel ("Load a sample patient to see risk on the heart" + a primary button) and the heart shown neutral.
- Coach-mark tour (3 steps, skippable, Esc closes, remembered):
  1. → the Sample patients button: "Start with a sample patient — or enter your own."
  2. → the canvas: "Each artery is coloured by its predicted stenosis risk. Click one."
  3. → the Why / What-if panel: "See what drives the estimate, and explore what-if changes."

==========================================================================================
## PART H — DESIGN SYSTEM (apply the design skills)
==========================================================================================
**H0. Skills:**
- `npx skills add Leonxlnx/taste-skill` and `npx skills add emilkowalski/skill` (if not already installed).
- Read and apply: design-taste-frontend; emil-design-eng, animate, break-ui, mobile-native.
- On conflicts: product, safety and contract rules in this prompt win; visual craft follows the skills.

**H1. Tokens (`styles/tokens.css`, dark default + light)**
| Token | Dark | Light |
|---|---|---|
| --bg | #0F1012 | #F6F5F3 |
| --surface-1 | #16181B | #FFFFFF |
| --surface-2 | #1D2024 | #F0EEEB |
| --surface-3 | #252930 | #E7E4E0 |
| --border | rgba(255,255,255,.08) | rgba(0,0,0,.08) |
| --text-1 | #F2F0ED | #1B1C1E |
| --text-2 | #A7A39D | #5D5A55 |
| --text-3 | #77736D | #8A867F |
| --accent (UI only) | #5FB3A8 | #2F8F84 |
| --focus | #8FD3C9 | #1F6F66 |

- Risk colours: ONLY from `anatomy_map.style` (vessel scale, tier tints, raises / lowers). Never used for UI chrome, buttons or links.
- Status (non-risk): info #7AA7E0, warning text #D9B26A (always with an icon + text).
- Radii: 6 / 10 / 14 px. Shadows: very soft, dark-mode-appropriate (no harsh drop shadows).
- Spacing: 4-pt grid (4, 8, 12, 16, 20, 24, 32, 40).

**H2. Typography**
- Inter Variable (self-hosted) for the UI, with `font-feature-settings: "tnum"` on all numbers. JetBrains Mono for units and code.
- Scale: 40 (hero number) / 28 / 20 / 16 / 14 / 12; line-height 1.4–1.5; letter-spacing −0.01em above 20 px.

**H3. Motion (motion / framer-motion)**
| Element | Duration / easing |
|---|---|
| UI transitions | 160–220 ms, ease-out [0.2, 0.8, 0.2, 1] |
| Panel / sheet | 280 ms |
| Number changes | count-up 300 ms |
| Mesh colour | 400 ms tween |
| Camera fly-to | 600 ms |

- No bounce/spring overshoot on clinical data. No autoplay animations except the heartbeat (subtle, toggleable).
- Respect `prefers-reduced-motion`: disable the heartbeat, the pulses (replace them with a static outline), fly-to (instant) and the count-ups.

**H4. Layout & responsiveness**
| Width | Layout |
|---|---|
| ≥ 1280 | 3 columns (340 / flex / 380) |
| 1024–1279 | left drawer (toggle) + canvas + right 360 |
| 768–1023 | canvas full width; right panel as a bottom sheet (snap points 30% / 60% / 92%); left as a drawer |
| < 768 | canvas 55vh + tabs: Inputs / Risk / Why / What-if; lite model; touch-optimised (44 px targets) |

- No horizontal scroll at any width (test 375, 768, 1024, 1280, 1440, 1920).

**H5. Accessibility (WCAG 2.2 AA)**
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI and graphics.
- Full keyboard path; visible focus rings (2 px --focus); skip-link to the results.
- ARIA: the canvas gets `role="img"` + `aria-label` with a live text description, e.g. "LAD 72% stenosis likely; LCX 31%; RCA 18%". Vessel selection is mirrored by focusable buttons.
- A live region (polite) announces "Prediction updated: CAD 73%, High tier".
- Colour never stands alone: icons, text and arrows are paired with every colour cue.

**H6. Copywriting**
- Plain, calm, precise. Examples:
  - "CAD likely" / "CAD unlikely"
  - "Stenosis likely"
  - "Model reliability: Limited — interpret with caution"
- Probabilities as whole-number %; contributions as "+12 pts".
- Never say "diagnosis", "you have", or "treatment". Say "model estimate", "decision support".

**H7. Anti-annoyance rules (hard)**
- No modal on load except the skippable tour.
- No layout shift on updates (reserve space).
- No spinners covering content.
- Debounced inputs; no request storms.
- Remember the user's view, look and panel preferences.
- No sounds. No toasts for routine updates (only errors or mode switches).
- Every primary action ≤ 2 clicks.
- Undo for destructive-ish actions (Reset patient → toast with Undo).

==========================================================================================
## PART I — PHASED EXECUTION (do in order; commit after each gate)
==========================================================================================

**Phase 0 — Asset fixes (from Step 6B review)** — in `blender/build_heart.py` / `blender/vessel_trace.py`:
1. **LCX zig-zag:** fit the traced LCX with a smoothing spline (≤ 8 control points, or a curvature penalty) so it follows the left AV groove in one gentle arc. Keep the bend ≤ 35° and the 1.5–2 mm offset.
2. **Left main length:** 34 mm → 8–12 mm. Move the bifurcation toward the left ostium; re-trace the LAD/LCX starts.
3. **Descending-aorta tiling:** continuous cylindrical UVs matched to the arch texel density, or a seamless matching material blend. No visible repetition.

Rerun `python blender/make_all.py` + `check_glb.py` + `validate_glb_names` + pytest. Re-render `heart_demo_risk` (both looks) + `compare_sketchfab_vs_ours` and LOOK at them.
**GATE:** all checks pass + the 3 fixes are visually confirmed.

**Phase 1 — Backend:** Part D in full + tests.
**GATE:** pytest green; p95 /predict < 250 ms; the OpenAPI is exported.

**Phase 2 — Frontend scaffold:**
- Vite + TS strict + Tailwind + tokens + fonts + Radix UI primitives + the store + the API client (generated types) + the TanStack hooks + `scripts/{sync_assets,dev,gen_types}.py`.
**GATE:** `python scripts/dev.py` opens the app shell (top bar, empty panels, disclaimer) talking to `/api/health`.

**Phase 3 — 3D viewer:** Part F (F1–F9).
**GATE:** the model renders with the viewer look; both variants toggle; picking + tooltips + fly-to work; the legend shows; FPS ≥ 50 (full) in Playwright on a desktop profile.

**Phase 4 — Patient panel + live prediction:** G1 + the data flow.
**GATE:** loading each sample updates the 3D colours to EXACTLY the API scene colours (an e2e test reads the material colours via a test hook `window.__cardiolens.getMeshColors()`, exposed only in dev/test builds).

**Phase 5 — Results panels:** G2 (summary, vessel cards, Why, breakdown) + two-way selection sync.
**GATE:** all PS 3a/3b/3c items are visible; unit tests cover formatting and sorting.

**Phase 6 — What-if + Model card + Export + Onboarding + Shell:** G2.5, G3–G7.
**GATE:** what-if deltas are correct; the PDF contains the disclaimer on every page; the tour works and is remembered.

**Phase 7 — Responsive + accessibility + motion polish:** Part H.
**GATE:** no horizontal scroll at the 6 widths; an axe-core scan (Playwright) has 0 serious/critical issues; reduced-motion verified.

**Phase 8 — Hardening (break-ui skill):**
- extreme and invalid values
- rapid slider drags (verify request cancellation)
- the backend killed mid-session
- slow 3G throttling
- tiny and huge viewports
- keyboard only
- WebGL disabled
- 200% browser zoom
Fix everything.
**GATE:** no console errors or warnings in the normal flow.

**Phase 9 — Production build + docs + final QA.** See Part J and Part K.

==========================================================================================
## PART J — TESTING & QUALITY GATES (final)
==========================================================================================
1. **Backend:** pytest (all of Part D) green; the latency report is printed.
2. **Frontend:** `tsc --noEmit`, eslint (no warnings), vitest unit tests:
   - color.ts (CIELAB interpolation matches `cardio_ml.anatomy.color_for` for 11 probabilities — export reference values from Python into a JSON fixture)
   - format.ts
   - the store reducers
   - the debounce/cancel logic
3. **Playwright e2e** (Chromium; desktop 1440×900 + mobile 390×844):
   - load the app → the tour appears → skip → load each of the 6 samples → assert the LAD/LCX/RCA colours == the API scene colours (±1 / 255)
   - click LAD on the canvas (use the projected `Anchor_LAD` screen position) → the LAD card is selected, the camera moved, the Why tab = LAD
   - keyboard: Tab to the vessel buttons, Enter selects RCA
   - what-if: set LDL → the delta row updates; "Show on heart" changes the colours
   - Export PDF → the download exists → parse its text (pdf-parse) → it contains the disclaimer
   - Model card opens and shows the metrics table with CIs
   - backend offline → banner shown, and the 3D is still interactive
   - FPS: orbit for 5 s → report the average fps (full + lite)
   - screenshots → `artifacts/figures/app_{desktop,tablet,mobile}_{dark,light}.png`, `app_modelcard.png`, `app_whatif.png`, `app_body_mode.png`, `app_territories.png`, plus `app_report.pdf`
4. **Lighthouse** (desktop, production build): Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95. Save the report to `artifacts/lighthouse.html`.
5. **Visual review:** LOOK at every screenshot. Fix alignment, overflow, truncation, contrast, clutter and inconsistent spacing. Iterate until it looks like a polished, premium medical product.

==========================================================================================
## PART K — RUN, BUILD, DOCS
==========================================================================================
- `python scripts/dev.py` → syncs the assets, starts uvicorn :8000 + vite :5173, waits for health, and opens the browser.
- `python scripts/build.py` → production build; a single server on :8000 (`python -m app.backend.main`).
- Optional: a Dockerfile (python-slim + built frontend) for judges.
- README update:
  - "Run the app" — written for a non-technical user of the Claude desktop app: "ask Claude: run python scripts/dev.py"
  - screenshots
  - the PS-requirement table (Part B)
  - an architecture Mermaid diagram
  - credits: dataset; Sketchfab CC BY full text; Poly Haven CC0; major libraries + licences
- `docs/ARCHITECTURE.md` (≤ 1.5 pages, feeds the 6-page documentation):
  - data → model → API → scene_state → 3D binding
  - extensibility: add a feature (schema → UI auto), a model (registry), an anatomical structure (anatomy_map + mesh name)
  - performance choices (Draco/KTX2, lite, demand frameloop)
  - safety (disclaimer, leakage guard, honest reliability)
- `docs/DEMO_SCRIPT.md` — a 5–7 minute YouTube demo shot list with timings + narration lines:
  1. the problem (20 s)
  2. load a high-risk sample → the heart lights up (40 s)
  3. rotate / zoom / click LAD → detail (60 s)
  4. Why? SHAP + breakdown (60 s)
  5. what-if LDL / BP / smoking (45 s)
  6. body mode + territories (30 s)
  7. model card: honest metrics + limitations (45 s)
  8. architecture + tech (45 s)
  9. disclaimer + close (15 s)
- `docs/DECISIONS.md` — every non-obvious decision you made.

==========================================================================================
## PART L — FINAL REPORT (reply to me with)
==========================================================================================
1. A table: gate → pass/fail, with numbers:
   - /predict p50/p95
   - FPS (full / lite)
   - Lighthouse scores
   - bundle size
   - the axe result
2. Screenshot paths: desktop dark, mobile, body mode, model card, what-if, report PDF.
3. How to run it — exact steps for a Claude desktop app user, no terminal knowledge assumed.
4. Known limitations / compromises, and why.
5. Suggested next steps for the demo video and the 6-page documentation.

==========================================================================================
## NEVER
==========================================================================================
- Hardcode feature lists, mesh names, colours, thresholds or tooltips. They come from the schema, anatomy_map and the API.
- Use red/orange/amber for non-risk UI.
- Show a lesion location within a vessel, colour the LM/branches by risk, or map RWMA to anatomy.
- Call what-if outputs causal or treatment effects.
- Hide, shrink-to-invisible, or allow dismissing the disclaimer.
- Load anything from a CDN at runtime (self-host fonts, decoders, the HDRI and the models).
- Store patient data anywhere except in memory (no localStorage of patient inputs, no analytics).
- Modify the trained models, thresholds or metrics.
- Say "done" without passing every gate AND personally reviewing every screenshot.
