"""Inventory item -> where it appears: (scene id, time ref within the scene, how).

Time refs: a narration cue name, "mark:<capture mark>", or seconds into the scene.
`how`: "shown" (picture), "narrated", "lower-third", "caption" (on-screen text in a card).
"""
COVERAGE = {
    # ML
    "M1": ("s02a_data", 0.4, "shown + narrated"), "M2": ("s02a_data", 2.0, "shown"), "M3": ("s02a_data", "leak", "shown + narrated"),
    "M4": ("s02a_data", "audit", "shown + narrated"), "M5": ("s02a_data", "audit", "caption"), "M6": ("s02a_data", "audit", "caption"),
    "M7": ("s02b_validation", 0.5, "shown + narrated"), "M8": ("s02b_validation", "holdout", "animated diagram + narrated"),
    "M9": ("s02c_models", 0.4, "figure + narrated; TabPFN lower-third"), "M10": ("s02c_models", "strategy", "shown + narrated"),
    "M11": ("s02c_models", "calib", "figure + chips + narrated"), "M12": ("s02d_results", 0.6, "table + narrated"),
    "M13": ("s02c_models", "strategy", "caption (selection/ablation summary)"), "M14": ("s02d_results", "shap", "figure + narrated"),
    "M15": ("s02d_results", "latency", "count-up + narrated"),
    # mapping
    "P1": ("s03a_mapping", 0.6, "animated diagram + narrated"), "P2": ("s03a_mapping", "scale", "shown + narrated"),
    "P3": ("s03a_mapping", "flag", "chips + narrated"), "P4": ("s03b_rules", 0.4, "figure + narrated"),
    "P5": ("s03b_rules", "overlays", "figure + narrated"), "P6": ("s03b_rules", "overlays", "figure + narrated"),
    "P7": ("s03b_rules", "whatif", "shown + narrated"), "P8": ("s06b_quality", 6.0, "caption ('Also:' line)"),
    # 3D asset
    "H1": ("s04a_source", 0.4, "render + narrated"), "H2": ("s04a_source", "sketchfab", "figure + credit + narrated"),
    "H3": ("s04a_source", "sketchfab", "caption + narrated"), "H4": ("s04b_build", 0.3, "figure + caption + narrated"),
    "H5": ("s04b_build", "looks", "caption + narrated"), "H6": ("s04b_build", "looks", "figures + narrated"),
    "H7": ("s04b_build", "lite", "figure + table + narrated"), "H8": ("s04b_build", "lite", "validator terminal + caption"),
    "H9": ("s04b_build", 0.3, "figure"),
    # app
    "U1": ("s00_cold", 0.0, "shown"), "U2": ("s05a_open", "mark:tour", "shown + narrated"), "U3": ("s05b_samples", "mark:menu", "shown + narrated"),
    "U4": ("s05c_panel", 0.6, "shown + narrated"), "U5": ("s05c_panel", "field", "shown + narrated"), "U6": ("s05c_panel", "alt", "shown + narrated"),
    "U7": ("s05d_live", 0.5, "lower-third + narrated"), "U8": ("s05o_offline", "mark:banner", "shown + narrated"),
    "U9": ("s05d_live", "htn", "shown + narrated"), "U10": ("s05d_live", "smoke", "shown + narrated"), "U11": ("s05e_changed", 0.4, "shown + narrated"),
    "U12": ("s05f_3d", 0.7, "shown + narrated"), "U13": ("s05f_3d", "mark:hover_lad", "shown + narrated"), "U14": ("s05f_3d", "click", "shown + narrated"),
    "U15": ("s05f_3d", "lm", "shown + narrated"), "U16": ("s05g_views", 0.4, "shown + narrated"), "U17": ("s05g_views", "tools", "shown + narrated"),
    "U18": ("s05g_views", "legend", "shown + narrated"), "U19": ("s05h_body", "terr", "shown + narrated"), "U20": ("s05h_body", 0.4, "shown + narrated"),
    "U21": ("s00_cold", "colour", "shown (name tags on the multi-vessel case)"), "U22": ("s06b_quality", 6.0, "caption ('Also:' line)"),
    "U23": ("s05b_samples", "pick", "shown"), "U24": ("s00_cold", "colour", "shown"), "U25": ("s05i_why", 0.4, "shown + narrated"),
    "U26": ("s05i_why", "table", "shown + narrated"), "U27": ("s05j_whatif", 0.4, "shown + narrated"), "U28": ("s05k_modelcard", 0.4, "shown + narrated"),
    "U29": ("s05l_export", 0.4, "shown + PDF pages + narrated"), "U30": ("s05m_edu", 0.5, "shown + narrated"), "U31": ("s05m_edu", "light", "shown + narrated"),
    "U32": ("s05n_devices", 0.0, "shown + narrated"), "U33": ("s05o_offline", "keys", "shown + narrated"), "U34": ("s06b_quality", 6.0, "caption ('Also:' line)"),
    "U35": ("s06b_quality", 6.0, "caption ('Also:' line)"), "U36": ("s05b_samples", 0.0, "shown (always-on strip)"), "U37": ("s05c_panel", 0.6, "shown"),
    # engineering
    "E1": ("s06a_arch", 0.4, "diagram + endpoint chips + narrated"), "E2": ("s06a_arch", "guard", "terminal + narrated"),
    "E3": ("s06b_quality", 0.5, "count-up + narrated"), "E4": ("s06b_quality", 0.5, "caption + narrated"), "E5": ("s06b_quality", 4.0, "caption"),
    "E6": ("s06b_quality", "numbers", "tiles + narrated"), "E7": ("s06c_deploy", 0.6, "live capture + narrated"), "E8": ("s06c_deploy", "other", "cards + narrated"),
    "E9": ("s06b_quality", 6.0, "caption ('Also:' line)"), "E10": ("s05c_panel", "field", "shown (effect meter comes from the audit)"),
}

# What the viewer sees in each scene (STORYBOARD.md is generated from this + the timeline + COVERAGE).
VISUAL = {
    "s00_cold": "Real capture: the app's opening animation → neutral heart → Sample patients → 'High risk · multi-vessel'; arteries take on risk colours. No voice for 4.6 s.",
    "s01_problem": "Card: the burden statement (from the problem statement) → 3-box question (routine data → predict → 3D) → README requirement table, rows highlighted in turn.",
    "s02a_data": "Card: dataset counters (count-up), prevalence bars, data-audit checklist, leakage-rule panel (req. 1d).",
    "s02b_validation": "Card: engineered-feature chips, then an animated validation diagram: 303 → 242 / 61 hold-out → 5×5 nested CV → 1000 bootstrap CIs.",
    "s02c_models": "Card: model-zoo AUC figure (TabPFN lower-third) → strategies A/B/C with nested-CV AUC → calibration figure + threshold chips + tier cut-offs.",
    "s02d_results": "Card: hold-out results table with CIs (count-up) → SHAP global figure + LIME agreement → 149 ms latency.",
    "s03a_mapping": "Card: animated diagram anatomy_map.json + prediction → scene_state() → 3D; colour scale; flag cue + reliability badges.",
    "s03b_rules": "Card: whole-vessel schematic (LM not modelled) → territories + body-region renders → what-if caveat.",
    "s04a_source": "Card: procedural v1 render → Sketchfab source + CC BY credit + build steps.",
    "s04b_build": "Card: painted lines vs traced tubes → Realistic vs Clinical renders → full vs lite + budget table + validator terminal.",
    "s05a_open": "Capture: fresh visit; opening animation; 3-step tour (Next, Next, Done).",
    "s05b_samples": "Capture: Sample patients menu, each of the 6 hovered; the LAD case loads. Callout + shareable-link lower-third.",
    "s05c_panel": "Capture: patient dock opens; search 'chol'; Age help tooltip; effect meter (zoom 1.3×); Alt+click reset; Reset → Undo.",
    "s05d_live": "Capture: Hypertension off → change toast; Current smoker on → lungs chip; Systolic murmur → 'little effect'. Callouts on each.",
    "s05e_changed": "Capture: the 'What changed' panel; one change reverted.",
    "s05f_3d": "Capture: orbit, zoom, hover LAD tooltip, click → fly-to + card/Why sync, hover left main ('not modelled').",
    "s05g_views": "Capture: Left preset, Clinical look, Front, heartbeat, turntable, legend callout, reset/fullscreen/screenshot, display-quality menu.",
    "s05h_body": "Capture: body mode with region glows, x-ray slider dragged; back to heart with territories.",
    "s05i_why": "Capture: Why? waterfall for CAD → LAD → RCA; physiological breakdown; measurement table sorted.",
    "s05j_whatif": "Capture: what-if on; LDL 70, BP 120, smoking off; Δ table; Show on heart; hold to compare; sensitivity chart.",
    "s05k_modelcard": "Capture: model card scrolled section by section to the sample outcomes.",
    "s05l_export": "Capture: Export ▾ → PDF (pages shown full-screen), Copy summary, PNG.",
    "s05m_edu": "Capture: educational overlay (sourced, general) → light theme.",
    "s05n_devices": "Captures side by side in device frames: tablet 810×1080 (bottom sheet) and phone 390×844 (tabs).",
    "s05o_offline": "Capture: API unreachable → offline banner, last result kept → automatic recovery → shortcut sheet (?).",
    "s06a_arch": "Card: animated architecture boxes, the API endpoint chips (from /openapi.json), guard terminal + proof-test note.",
    "s06b_quality": "Card: test counts (count-up) + Playwright terminal, colour==API note, axe / fps / Lighthouse tiles.",
    "s06c_deploy": "Capture of the live site in a browser frame (URL shown) → Docker / .bat / dev.py / rebuild cards.",
    "s07_close": "Card: limitations → disclaimer → credits → end card (CardioLens, Team HAVOC, live + repo links).",
}
