# Step 5: Prediction → anatomy mapping

**What it does.** `cardio_ml.anatomy.scene_state(predict_patient(...))` turns model output into a deterministic,
render-ready scene state for the 3D heart and torso. It is a pure function, takes about 0.3 ms, and is validated
against `scene_state.schema.json`. Every mesh name, text and visual constant lives in `anatomy_map.json`.
Adding a structure or region, or restyling, means editing JSON, not code. `ASSET_SPEC.md` (generated from the map)
and `validate_glb_names()` define the Step 6 asset contract.

**Mapping logic.** Prediction keys `lad`, `lcx` and `rca` map one-to-one onto the meshes `Coronary_LAD`,
`Coronary_LCX` and `Coronary_RCA`. These are the only risk-coloured vessels. Each is coloured **uniformly along its
whole length**, because the dataset records only "≥ 50% stenosis somewhere in the vessel", not proximal, mid or
distal location. The left main, diagonals and other branches have no labels, so they are rendered neutral
("not modelled — no label in dataset"). **No clinical feature is ever used to pick a vessel or a location.**
Region RWMA in particular is an echo input to the models, not a lesion map. This is tested
(`test_no_feature_chooses_a_vessel_or_location`). The myocardium is tinted by the CAD risk tier
(Low < 0.077 ≤ Moderate < 0.82 ≤ High). `expected_stenotic_vessels` is shown as a number only.

**Colour vs. flag.** *Colour* is the calibrated probability on **one shared sequential scale** for every vessel:
#E8E2D8 → #F2B45A → #E4572E → #8E1B1B, interpolated in CIELAB. Lightness falls monotonically
(L* 90 → 31, which is tested), so it reads correctly in greyscale and with colour-vision deficiency, and there is
no red/green pairing. Equal colours therefore mean equal risk. The *flag* is the decision rule: prob ≥ that
vessel's own F1-optimal threshold (LAD 0.465, LCX 0.29, RCA 0.275). Because the thresholds differ, a 35% LCX is
flagged while a 35% LAD is not. Folding the threshold into the colour would make colours non-comparable across
vessels. A flag is therefore a separate, **non-colour** cue: a "Stenosis likely" badge, an outline and a pulse
whose rate grows with the distance above the threshold. Each vessel also carries a **reliability badge** from its
hold-out AUC: LAD 0.83 and LCX 0.77 are Moderate, RCA 0.74 is Limited, and CAD 0.90 is High. This keeps weak
vessel models from being over-trusted.

**Territory assumption.** The optional overlay (off by default) shades the standard AHA 17-segment perfusion
territories (Cerqueira et al., *Circulation* 2002;105:539–42), assuming right-dominant circulation:
LAD 1, 2, 7, 8, 13, 14, 17; RCA 3, 4, 9, 10, 15; LCX 5, 6, 11, 12, 16. The territory colour is the vessel's colour
at 35% opacity. It is derived from the vessel prediction, never from RWMA. Its tooltip states that individual
anatomy varies.

**Region layer semantics.** Each of the 55 raw features maps to exactly one body region (heart, vessels, lungs,
kidneys, pancreas, thyroid, brain, blood, legs, whole body). For the focused target, signed SHAP contributions are
summed per region. The top 3 regions glow with intensity |sum| normalised to the strongest region. Warm means the
factor raises risk and cool means it lowers risk, and an arrow icon is always shown too, so colour is never the
only cue. Every region tooltip says: *location of a contributing risk factor, NOT the location of disease.*

**What-if caveat.** `what_if()` and `sensitivity_curve()` change only modifiable factors (BP, LDL, HDL, TG, FBS,
smoking, weight/BMI, DM, HTN, DLP). Weight and BMI stay consistent through the patient's height, Obesity is
re-derived, and quitting smoking makes the patient an ex-smoker. Age, sex, ECG and echo findings are rejected.
Outputs are labelled **model-estimated change**. The models are correlational, so a lower predicted risk is not a
treatment effect. Some vessel models never see some factors (for example RCA uses 10 selected features), so their
curves can be flat by design.

**Limitations.** Vessel-level performance is moderate to limited (AUC 0.74–0.83, n = 303, single centre), and the
probabilities come from a high-prevalence referral cohort. Territories are textbook averages, not
patient-specific. Region glows aggregate attributions and are not causal. LCX's top drivers include Height and
platelets, which are likely spurious correlations at n = 303. For decision support and educational purposes only.
Not a substitute for formal diagnostic imaging or clinical judgement.
