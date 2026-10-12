# CardioLens architecture

## Data → model → API → scene state → 3D
1. **Data and models (Steps 1–4, frozen).** `cardio_ml` encodes the 55 raw clinical features, engineers derived ones
   (eGFR, pretest probability, ratios) inside fitted pipelines, and serves four calibrated models (CAD, LAD, LCX, RCA).
   SHAP contributions are mapped back to raw features and 6 physiological groups, in probability points.
2. **Anatomy mapping (Step 5).** `anatomy.scene_state(prediction)` is a pure function that turns a prediction into a
   render-ready scene. It gives each mesh a colour (CIELAB scale), emissive level, pulse rate, flag and tooltip.
   It also produces per-vessel cards, body-region glows and the legend. Every name, colour and text comes from
   `artifacts/anatomy_map.json`.
3. **API (Step 8, `app/backend`).** FastAPI loads the predictor and the map **once** at startup (lifespan).
   `services.py` only validates inputs, calls `cardio_ml` and assembles responses. The routers are thin:
   `/api/health · schema · examples · predict · what-if · sensitivity · model-card · anatomy-map`.
   * Every error has one shape: 400 for domain errors (label columns, non-modifiable what-if changes), 422 with
     per-field messages, 500 without stack traces.
   * Every prediction-bearing response carries `disclaimer` and `latency_ms`.
4. **Frontend (Step 7, `app/frontend`).**
   * State and data: React + TypeScript (strict) with a Zustand store. Patient edits pass through a 250 ms
     debounce and an AbortController, then go to `/api/predict`. The previous result stays rendered while the
     next one loads.
   * 3D: the R3F viewer loads the Draco/WebP GLB, resolves `KHR_materials_variants` (Realistic / Clinical), and
     **copies** the scene colours onto per-mesh material clones, with a 400 ms tween. Flagged vessels show their
     `Extra_Outline_*` shell and an emissive pulse.
   * Picking: rays are cast against the hit proxies plus the myocardium together, and the nearest hit wins.
   * Correspondence check: an end-to-end test compares the material colours with the API scene (±1/255).

## Extensibility
* **Add a clinical feature:** add it to `cardio_ml/config.py` and retrain. The schema endpoint then exposes it, and
  the patient panel renders it automatically (type → control, group → accordion). Help text goes in
  `app/backend/feature_help.py`; an optional reference range goes in `reference_ranges.py`.
* **Add or replace a model:** register it in `cardio_ml/models.py`. The API and UI are model-agnostic; the model
  card reads `metrics.json` and `thresholds.json`.
* **Add an anatomical structure:** add its entry to `anatomy_map.json` and a mesh with the same name to the GLB
  (`blender/build_heart.py`). The viewer binds by name and warns about anatomy-map meshes missing from the file.

## Performance choices
* **Asset:** Draco geometry and WebP textures. `heart.glb` is 108k triangles / 1.6 MB; `heart_lite.glb` is 46k
  triangles / 0.6 MB. Lite is chosen automatically on low-memory, touch or mobile devices, or when frame rate drops.
* **Rendering:** `frameloop="demand"` when idle, switching to `always` only while something animates.
  Device pixel ratio is capped at 1.75 (1.25 in lite). There are no realtime shadows.
* **Bundling:** three.js, R3F and jsPDF live in lazy chunks, so the initial JS is 128 KB gzip. The 3D stack mounts
  once the dashboard has painted; the HDRI is decoded after the model is on screen.
* **Serving and caching:** the GLB, decoders and fonts are self-hosted with immutable cache headers. The production
  server listens on both loopback addresses, which avoids a ~200 ms IPv6 fallback per connection on Windows.
* **Measured:**
  * `/api/predict` p95 is 149 ms, including SHAP for all 55 features.
  * Lighthouse (desktop): Performance 92–93, Accessibility 100, Best Practices 100.
  * The viewer runs at a vsync-capped 59–60 fps when orbiting.

## Safety
* **Disclaimer:** a persistent, non-dismissible strip whose text is exactly `config.DISCLAIMER` from the API. The
  same text appears on every PDF page and in the model card.
* **Leakage guard:** `Cath`, `LAD`, `LCX` and `RCA` can never be inputs. The API returns 400 with a clear message.
* **Honest reliability:**
  * Every estimate shows a badge (High / Moderate / Limited) derived from its hold-out AUC.
  * The model card lists metrics with 95% CIs and states the limitations: single centre, n = 303, no lesion location.
  * It also includes a deliberately chosen "Model uncertainty example".
* **No anatomical over-claiming:** whole vessels are coloured uniformly; the left main and branches stay neutral;
  Region RWMA is never mapped to anatomy.
* **What-if wording:** changes are labelled as model-estimated associations, not treatment effects.
* **Privacy:** patient inputs live only in memory. Only view and UI preferences are stored in `localStorage`.
  There is no analytics.
