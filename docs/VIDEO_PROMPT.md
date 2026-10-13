# ULTIMATE PROMPT — CardioLens demo video (≤ 10 minutes, well-edited, informative, calm)
# Multimodal AI Hackathon 2026 · Track A · Deliverable: "3–10 minute YouTube video demonstrating the working system,
# feature input workflow, 3D visualization interactions, and technical implementation"

You are a senior product-video producer, technical narrator and automation engineer.

Produce a complete, professionally edited demo video of THIS repository (CardioLens, `SoAkeD1/cardio-risk-heart-3d`).
Work autonomously. Stop and ask me ONLY if:
- a required tool can't be installed, or
- you need my own voice recordings (see 4.3).

- Project root = this folder. OS: Windows 11. Create the branch `video`. Put everything under `video/`.
- **HARD LIMIT:** final duration 8:30–9:45 (never above 10:00, never below 7:00).

==========================================================================================
## 1. FIRST: READ THE WHOLE REPO AND BUILD A FEATURE INVENTORY
==========================================================================================
Read everything before writing a single scene:
- `README.md`
- `docs/` (ARCHITECTURE, DECISIONS, DEMO_SCRIPT, STEP6B_PLAN, STEP7_PLAN, all *_PROMPT.md)
- `artifacts/` (ML_SUMMARY.md, metrics.json, thresholds.json, anatomy_map.json, STEP5_MAPPING.md, STEP6_ASSET.md, feature_response.json, figures/)
- `notebooks/track_a_ml.py`
- `cardio_ml/*`
- `blender/*`
- `app/backend/*` (routers, services, content/)
- `app/frontend/src/**` (every component in three/, features/, ui/, state/, lib/)
- `app/frontend/e2e/*`
- `scripts/*`
- `tests/*`
- `Dockerfile*`, `vercel.json`, `Start CardioLens.bat`

Write `video/FEATURE_INVENTORY.md`: EVERY user-visible feature and every notable technical tidbit, each with:
- the file(s) that implement it
- how to trigger it in the UI (clicks / keys / URL)
- its importance: A = must show, B = show briefly, C = mention in a montage or caption only

It must at least cover the items below. Verify each one in the code; add anything else you find:

**ML (Steps 1–4)**
- Dataset: Z-Alizadeh Sani extension, UCI id 411, 303 patients, 55 features.
- 4 targets: Cath/CAD, LAD, LCX, RCA. The leakage rule is asserted in code, and the API rejects label columns (400).
- Data audit:
  - constant `Exertional CP` dropped
  - the "Fmale" typo handled
  - label-logic check
- Engineered features:
  - Diamond–Forrester pretest probability
  - eGFR (CKD-EPI 2021)
  - TG/HDL, LDL/HDL, NLR, PLR, absolute lymphocytes
  - risk-factor / ECG counts
- Validation:
  - stratified 20% hold-out
  - 5×5 repeated CV with nested Optuna tuning
  - bootstrap 95% CIs
- Model zoo: LR, SVM, RF, ExtraTrees, LightGBM, XGBoost, CatBoost, voting/stacking; TabPFN attempted and skipped (licence).
- Vessel strategies A / B / C compared; A chosen.
- Calibration, F1-optimal thresholds, risk tiers.
- Results: CAD AUC 0.895, LAD 0.832, LCX 0.768, RCA 0.741 (read the exact values from metrics.json).
- SHAP mapped to raw features + 6 physiological groups; LIME agreement 3.1/5; ~149 ms latency.

**Step 5 — mapping**
- `anatomy_map.json` is the single source of truth; `scene_state()` is a pure function.
- CIELAB colour scale; colour = probability, flag/outline = threshold.
- Reliability badges from the hold-out AUC.
- Whole-vessel colouring (no lesion location); LM/branches neutral.
- AHA territories (right-dominant).
- Body regions = "location of a contributing risk factor, NOT disease".
- What-if = correlational. Snapshot tests.

**Step 6 — 3D**
- Procedural CC0 heart first (kept as a fallback: `--heart-source procedural`).
- Then the Sketchfab "Realistic Human Heart" (CC BY 4.0):
  - aligned / scaled to 12 cm
  - split into Heart_Myocardium + Aorta, descending aorta extended
  - coronaries traced from the painted texture (minimum-cost paths in the grooves)
  - LCX Chebyshev smoothing, LM 10 mm
- Hit proxies, outline shells, anchors, view presets.
- Realistic/Clinical via KHR_materials_variants.
- Draco + WebP; full vs lite budgets.
- `check_glb.py` validator, Blender headless one-command build, the Poly Haven HDRI, `viewer_look.json`.

**Steps 7–8 — app**
- Opening animation; first-run 3-step tour; empty state.
- 6 sample patients (deterministic hold-out picks, incl. "Model uncertainty example"); `?case=` URLs.
- Patient panel:
  - schema-driven controls, search, accordions with "N changed" chips
  - normal-range bands, help tooltips, extrapolation notes
  - effect meters (from feature_response.json), Alt+click reset, Reset with Undo
- Live prediction: 250 ms debounce + cancel; stale handling; offline banner with auto-recovery.
- Change feedback:
  - change toast with per-target deltas, or "little effect"
  - vessel flash + delta chips
  - tier transition, region link chip
  - the "What changed" panel with revert
- 3D:
  - orbit / zoom / damping
  - hover tooltips (probability, threshold, reliability, whole-vessel note)
  - click → camera fly-to + two-way selection with the cards and the Why tab
  - LM/branches "not modelled" tooltip
  - view presets 1–4, Realistic/Clinical (L), heartbeat (H), turntable
  - reset (R), fullscreen (F), screenshot PNG, display quality Auto/Full/Lite (PerformanceMonitor auto-switch)
  - legend with collision-free threshold ticks
  - territories (T), body mode (B) with region glows/chips + x-ray slider
  - vessel name tags when several are flagged
  - 2D fallback without WebGL
- Results:
  - Risk summary (probability, tier chip, expected vessels, reliability, plain-language summary)
  - Vessel cards (bar + threshold tick, flags, reliability, top drivers)
  - Why? SHAP waterfall per target + show all
  - Physiological breakdown + sortable measurement table with typical ranges
- What-if: modifiable sliders only, before/after/Δ table, show on heart, hold-to-compare, sensitivity chart, causality caveat, apply/reset.
- Model card: metrics with CIs, validation, thresholds/tiers, figures, reliability, limitations, sample outcomes, attributions.
- Export: PDF report (disclaimer on every page), copy summary, PNG.
- Educational overlay (off by default, general facts with sources, never changes the heart).
- Dark/light theme; tablet bottom sheet; mobile tabs; keyboard shortcut sheet (?); dev debug drawer (Ctrl+Shift+D).
- Accessibility: live region, focus, reduced motion. Persistent non-dismissible disclaimer; credits footer.

**Engineering**
- FastAPI endpoints: health, schema, examples, predict, what-if, sensitivity, model-card, anatomy-map, education. Unified error shape.
- Zero-hardcoding guard + proof test.
- Tests: pytest (backend + anatomy), vitest, Playwright (incl. 3D colour == API ±1/255, PDF text, offline recovery), axe 0 serious, ~59 fps, Lighthouse.
- Deployment: Vercel (havoc-rho.vercel.app), Docker, `Start CardioLens.bat`, `scripts/dev.py`.

Then write `video/STORYBOARD.md`, mapping EVERY A-item to a scene, B-items to brief shots, and C-items to the montage or captions. Nothing in the inventory may be silently left out: each item gets a scene, a shot or a caption.

==========================================================================================
## 2. STRUCTURE (target ≈ 9:15; adjust within the limits)
==========================================================================================
| # | Chapter | Target | Content |
|---|---|---|---|
| 0 | Cold open | 0:00–0:15 | Neutral heart → load "High risk · multi-vessel" → the arteries take on risk colours. Title card "CardioLens — See where cardiac risk lives". No talking for the first 3 s, then one line. |
| 1 | The problem | 0:15–0:45 | CAD burden; angiography is invasive; the PS goal: predict CAD + per-vessel stenosis from routine data and show it spatially. Show the problem-statement → feature table from the README (zoomed, highlighted rows). |
| 2 | Data & ML | 0:45–2:15 | Dataset card; the leakage rule; feature-engineering list; validation-design diagram (animated boxes: hold-out → 5×5 CV → nested tuning → bootstrap CIs); model zoo AUC figure; vessel strategies A/B/C; calibration figure; thresholds + risk tiers; the results table with CIs; SHAP global figure; latency. Use the real figures from artifacts/figures. |
| 3 | From prediction to anatomy | 2:15–3:00 | anatomy_map as the single source of truth; scene_state diagram; the colour scale vs flag explanation; reliability badges; the whole-vessel rule; territories; body regions; the what-if caveat. Use the coronary schematic PNGs. |
| 4 | Building the 3D heart | 3:00–3:50 | Procedural v1 → the Sketchfab model (credit on screen); `compare_sketchfab_vs_ours.png`; the source views → aligned; the vessel tracing story (painted lines → traced tubes; LCX smoothing, LM 10 mm); the Realistic/Clinical renders; hit proxies + outlines (debug visual: show the proxy tubes semi-transparent); full vs lite; budgets; the validator output. |
| 5 | App walkthrough | 3:50–7:40 | The core. Real screen capture, in this order: opening + tour → sample patients menu (all 6 shown briefly) → patient panel tour → live change feedback (toggle HTN → toast; smoking → lungs chip; edema → "little effect" honestly) → What changed + revert → 3D hover/click/fly-to/two-way sync → view presets, look toggle, heartbeat, legend → body mode + x-ray + territories → Why? SHAP per target → breakdown + measurement table sort → what-if (LDL 70, BP 120, smoking off) + show on heart + hold-compare + sensitivity → model card → export PDF (open it briefly) + copy summary → educational overlay → light theme → tablet + mobile → offline banner + auto-recovery → shortcut sheet. |
| 6 | Engineering & quality | 7:40–8:45 | Architecture Mermaid (animated build-up); the API list; zero-hardcoding guard + proof test (show the test passing in a terminal clip); test counts; the 3D-colour == API test; a11y/fps/Lighthouse numbers; deployment (live URL, Docker, one-click .bat); reproducibility (one-command rebuilds). |
| 7 | Honesty & close | 8:45–9:15 | Limitations (single centre, n = 303, no external validation, no lesion location, RCA reliability Limited); the disclaimer; credits (dataset, Sketchfab CC BY, Poly Haven CC0); team HAVOC; repo + live links; end card (5 s). |

Use YouTube chapter timestamps matching these chapters (written to `video/youtube_description.md`).

==========================================================================================
## 3. CAPTURE (automated, deterministic, crisp)
==========================================================================================
**3.1 App setup**
- Production build (`python scripts/build.py`, then `python -m app.backend.main`) on :8000. Wait for /api/health.
- Fresh browser profile; the tour shown only when the script wants it.

**3.2 Driver: Playwright** (Chromium, headed), `video/capture/*.spec.ts`, one file per scene. Settings:
- viewport 1920×1080, deviceScaleFactor 1
- dark theme, unless the scene says light
- `prefers-reduced-motion`: no-preference (the app's motion should show)
- disable the dev FPS meter and the debug drawer, except where shown on purpose

**3.3 Recording:** capture the browser window with ffmpeg gdigrab at 60 fps, `-c:v libx264 -crf 14 -preset slow` (or Playwright recordVideo at 1920×1080 if gdigrab is impossible; then upscale nothing). One clip per scene, ~1 s handles at the start and end.

**3.4 Human-like interaction:**
- Inject a custom cursor overlay (soft white circle, 18 px, 70% opacity) with eased movement (bezier, 400–700 ms per move) and a subtle click ripple (200 ms).
- Type with 40–70 ms per key. Move sliders by dragging smoothly (≥ 600 ms per drag), not by jumping.
- Pause 1.2–2.0 s after each meaningful change so the viewer can read it.

**3.5 Deterministic data:** use the `?case=` sample ids and fixed what-if values; re-shoot if any toast or chip is cut off.

**3.6 Static assets:** export the figures (artifacts/figures/*.png), README tables, code snippets and terminal clips:
- pytest
- check_no_hardcoding
- check_glb
- the feature-response audit

Record terminals in a clean, large-font terminal (≥ 20 px, dark), or render them as typed-text animations in the editor.

**3.7** Save everything to `video/raw/` with a manifest (`video/raw/manifest.json`: scene id, file, duration, key timestamps).

==========================================================================================
## 4. EDIT (code-driven, reproducible)
==========================================================================================
**4.1 Editor:** Remotion (React + TypeScript), `video/editor/`. One composition per chapter + a master composition. Render with `npx remotion render`. (Fallback if Remotion is impossible: MoviePy + ffmpeg, same structure.)

**4.2 Visual language — match the app, calm and premium:**
- Background for cards and diagrams: the app's dark tokens (#0F1012 / #16181B), text #F2F0ED / #A7A39D, accent #5FB3A8 for UI. Risk colours only for risk data, from anatomy_map.
- Fonts: Inter (titles 56/40, body 28), JetBrains Mono for code and numbers. Tabular numerals.
- Title cards: 2.5 s, simple fade (300 ms). Chapter cards: 1.8 s, a small chapter number + title, left-aligned.
- Lower-thirds: a 1-line label (e.g. "Live prediction · 250 ms debounce") at the bottom-left, 3 s, fade in/out 250 ms.
- Callouts: thin 2 px accent rounded rectangles + a short label, appearing 200 ms before the action. Never more than 2 callouts on screen.
- Zooms: smooth push-ins ≤ 1.35×, 600–900 ms ease-in-out, held while text is being read, then eased back. No whip pans, no shake, no spins.
- Transitions: straight cuts within a chapter; 300 ms cross-dissolves between chapters. NO flashy wipes, glitches, zoom-blurs, emoji, stickers or sound effects.
- Diagrams (validation design, scene_state flow, architecture): draw them as clean animated SVG in Remotion — boxes appear one by one (150 ms stagger), arrows draw in (400 ms).
- Numbers: count up (400 ms) when first shown. Figures from artifacts: Ken Burns ≤ 1.1×, on a dark card with a caption.
- Keep 64 px safe margins. Nothing important in the bottom 120 px (that's reserved for captions).
- Progress: a thin 3 px chapter progress bar at the top (accent, 40% opacity).

**4.3 Narration**
- Write `video/NARRATION.md`: the full script, per scene, with target timings.
  - Spoken style: clear, confident, friendly, plain English, ~140–150 words per minute.
  - Total ≈ 1,250–1,350 words. No jargon without a one-phrase explanation.
  - Mention the PS requirements explicitly as they're met ("this satisfies requirement 2b…").
- Voice, choose in this order:
  1. **My own voice (preferred for authenticity):** generate `video/voice/record_here/` with one text file per scene + timing. Ask me to record one WAV per scene (phone or headset is fine), then clean it: denoise (`afftdn`), high-pass 80 Hz, de-ess, compress, loudness-normalise.
  2. **Neural TTS** if I say "use AI voice": a natural neural voice (e.g. edge-tts `en-IN-PrabhatNeural` or `en-US-AndrewNeural`), rate −5%, with SSML pauses at sentence ends.

  Build the cut so either voice can be dropped in: scene timing follows the narration length (the editor reads the audio durations).
- **Captions:** burned-in, subtle (Inter 30 px, white 92% on a 55% black rounded box, max 2 lines, max 42 characters/line), timed to the narration. Also export `video/out/cardiolens.srt` for YouTube.

**4.4 Audio**
- Music is optional and must be very quiet: one calm, royalty-free/CC0 ambient track (`video/assets/music/`, licence recorded), at −28 dB under the voice, with ducking −8 dB while speaking, 2 s fades. If none is available, use no music. NO sound effects.
- Final loudness: −14 LUFS integrated, true peak −1 dBTP (ffmpeg `loudnorm`, two-pass).

**4.5 Pacing rules**
- Every on-screen text is readable for ≥ 2 s per line.
- Max 1 new idea per 6–8 seconds.
- Never narrate over a cut mid-sentence.
- Don't show the same screen state for > 8 s without a change (cursor move, zoom, highlight).
- The app walkthrough (chapter 5) is ≥ 40% of the runtime.

==========================================================================================
## 5. OUTPUTS (`video/out/`)
==========================================================================================
- `cardiolens_demo_1080p.mp4` — H.264 High, 1920×1080, 30 or 60 fps (matching the capture), yuv420p, AAC 192 kbps, −14 LUFS, faststart
- `cardiolens.srt` (captions)
- `thumbnail.png` (1280×720): the realistic heart with coloured arteries on the dark background + the title "CardioLens" + the subtitle "3D cardiac risk from routine data". Clean, no clickbait.
- `youtube_description.md`:
  - title (≤ 70 characters)
  - description: what it is, PS track, features, tech stack, the repo + live links, chapter timestamps, credits/licences, disclaimer
  - tags
- `video/STORYBOARD.md`, `video/NARRATION.md`, `video/FEATURE_INVENTORY.md`, `video/COVERAGE.md` (inventory item → timestamp where it appears; every A/B item must have a timestamp)
- One-command re-render: `python video/make_video.py`. It captures (optional `--skip-capture`), edits, mixes and exports.

==========================================================================================
## 6. QUALITY GATES (all must pass)
==========================================================================================
1. Duration 8:30–9:45 (`ffprobe`).
2. `COVERAGE.md`: 100% of the A and B items have timestamps; the C items appear in the montage or captions.
3. Extract 1 frame every 10 s → `video/qa/frames/` → LOOK at every frame. Check:
   - no cut-off toasts or text
   - no debug UI unless intended
   - no personal info (bookmarks bar, other tabs, notifications, taskbar, username) — capture the browser in kiosk/app mode only
   - captions inside the safe area
   - consistent theme
4. The audio: loudness −14 ±1 LUFS; no clipping; no silence > 4 s except the cold open and the end card.
5. Every number shown on screen matches the repo (metrics.json, thresholds.json, test counts from actual runs, fps/Lighthouse from actual runs). Re-run the tests to get fresh numbers; don't invent any.
6. The disclaimer and credits are on screen in chapters 5 and 7; the Sketchfab CC BY credit appears whenever the heart is first introduced.
7. Watch-through check: generate a contact sheet (`video/qa/contact_sheet.png`, a 6×N grid) and review it for pacing (no long static stretches, no clutter).

==========================================================================================
## 7. NEVER
==========================================================================================
- Exceed 10:00.
- Use flashy effects, loud music, sound effects, meme edits, fast cuts < 1.5 s, or text that disappears before it can be read.
- Show fabricated results or numbers, or claim clinical validity, diagnosis or treatment effects.
- Show damage or lesion locations on the heart.
- Show anything private from my computer.
- Skip the honesty section (limitations + disclaimer).

==========================================================================================
## 8. FINAL REPORT (reply to me with)
==========================================================================================
- The final duration + file paths
- The chapter timestamps
- Coverage %
- Which voice was used — or exactly which WAV files I need to record (with their scripts)
- 6 representative frames (paths)
- Anything you couldn't capture, and why
