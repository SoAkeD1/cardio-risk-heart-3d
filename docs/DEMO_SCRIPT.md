# CardioLens: demo video script (about 6 minutes)

Setup: production build (`python scripts/build.py`, then `python -m app.backend.main`), Chrome full-screen at
1440×900, dark theme, the tour already dismissed. Start on <http://localhost:8000>.

| # | Time | Shot | Narration |
|---|---|---|---|
| 1 | 0:00–0:20 | Title card, then the empty app with a neutral heart | "Coronary artery disease is diagnosed with invasive angiography. Could routine clinical data tell us *where* the risk is likely to be, and why?" |
| 2 | 0:20–1:00 | **Sample patients** → "High risk · multi-vessel". The arteries turn from neutral to red; the summary counts up | "One click loads a de-identified hold-out patient. The model estimates a 99% probability of CAD. Each artery is coloured by its own calibrated probability of a 50% or greater narrowing; a white outline means above the decision threshold." |
| 3 | 1:00–2:00 | Orbit and zoom. Hover the LAD to show the tooltip, click it: the camera flies, the LAD card highlights, the Why tab switches. Press 1/2/3 for the views; toggle Realistic/Clinical | "Hovering an artery shows its probability, threshold and reliability. These are whole-vessel estimates, because the dataset has no lesion location. Clicking selects it everywhere: the 3D view, the cards and the explanation stay in sync." |
| 4 | 2:00–3:00 | Scroll to **Why?**: the SHAP waterfall for LAD, then CAD. Show the group breakdown and sort the measurement table by contribution | "Why? Each bar shows how much a measurement pushed this patient's estimate up or down, in probability points: from the base rate to this patient. The breakdown groups the reasons into demographics, risk factors, symptoms, ECG, labs and echo, next to typical ranges." |
| 5 | 3:00–3:45 | **What-if**: lower LDL to 70, BP to 120, turn smoking off. The delta table updates; switch on **Show on heart** and hold to compare | "What-if lets you change only modifiable factors. Deltas are model-estimated associations, not treatment effects, and the app says so. Show on heart previews the colours; hold to compare with the original." |
| 6 | 3:45–4:15 | Press B for body mode (region chips, x-ray slider), then T for territories | "Body mode shows where the contributing factors live: lungs, kidneys, blood tests. This is not where the disease is. Territories show the typical perfusion areas, assuming right dominance." |
| 7 | 4:15–5:00 | **Model card**: the metrics table with CIs, the calibration figure, the limitations, the "Model uncertainty example" | "We're honest about performance. Hold-out metrics with bootstrap confidence intervals, calibration, a reliability badge per artery, and the limitations: a single centre, 303 patients, no external validation." |
| 8 | 5:00–5:45 | Architecture diagram (README), then the PDF export and the lite/mobile view | "Under the hood: a FastAPI service around the frozen ML package returns a render-ready scene state; React Three Fiber binds it to a Draco-compressed CC BY heart. Every name, colour and tooltip comes from one anatomy map, and tests check that the 3D colours equal the API. The lite model runs on integrated graphics and phones." |
| 9 | 5:45–6:00 | The disclaimer strip, then the closing card | "CardioLens is for decision support and education only: not a substitute for diagnostic imaging or clinical judgement. Thank you." |

**Ideas for the 6-page documentation:**
1. Problem and users
2. Data and models (Steps 1–4 numbers)
3. Explainability and anatomy mapping (scene state, colour scale, no lesion location)
4. App design (screens, interaction, accessibility)
5. Architecture and performance (this repo's `ARCHITECTURE.md`)
6. Validation, limitations and safety

Reuse the `app_*.png` screenshots and the metrics table.
