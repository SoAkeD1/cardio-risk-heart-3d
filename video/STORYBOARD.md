# Storyboard (generated from the render timeline)

Chapters match `video/NARRATION.md`; the narration text lives there.

| Time | Scene | Visual | Inventory items |
|---|---|---|---|
| 0:00–0:14 | s00_cold · Cold open | Real capture: the app's opening animation → neutral heart → Sample patients → 'High risk · multi-vessel'; arteries take on risk colours. No voice for 4.6 s. | U1(B) U21(B) U24(A) |
| 0:15–0:43 | s01_problem · The problem | Card: the burden statement (from the problem statement) → 3-box question (routine data → predict → 3D) → README requirement table, rows highlighted in turn. |  |
| 0:44–1:06 | s02a_data · Dataset and leakage rule | Card: dataset counters (count-up), prevalence bars, data-audit checklist, leakage-rule panel (req. 1d). | M1(A) M2(A) M3(A) M4(B) M5(C) M6(B) |
| 1:06–1:24 | s02b_validation · Features and validation | Card: engineered-feature chips, then an animated validation diagram: 303 → 242 / 61 hold-out → 5×5 nested CV → 1000 bootstrap CIs. | M7(A) M8(A) |
| 1:24–1:45 | s02c_models · Models, strategies, calibration | Card: model-zoo AUC figure (TabPFN lower-third) → strategies A/B/C with nested-CV AUC → calibration figure + threshold chips + tier cut-offs. | M9(A) M10(A) M11(A) M13(C) |
| 1:45–2:04 | s02d_results · Results and explanations | Card: hold-out results table with CIs (count-up) → SHAP global figure + LIME agreement → 149 ms latency. | M12(A) M14(A) M15(B) |
| 2:05–2:28 | s03a_mapping · From probability to picture | Card: animated diagram anatomy_map.json + prediction → scene_state() → 3D; colour scale; flag cue + reliability badges. | P1(A) P2(A) P3(A) |
| 2:28–2:48 | s03b_rules · No over-claiming | Card: whole-vessel schematic (LM not modelled) → territories + body-region renders → what-if caveat. | P4(A) P5(B) P6(B) P7(A) |
| 2:49–3:09 | s04a_source · The heart model | Card: procedural v1 render → Sketchfab source + CC BY credit + build steps. | H1(B) H2(A) H3(B) |
| 3:09–3:30 | s04b_build · Vessels and budgets | Card: painted lines vs traced tubes → Realistic vs Clinical renders → full vs lite + budget table + validator terminal. | H4(A) H5(B) H6(A) H7(B) H8(C) H9(B) |
| 3:32–3:45 | s05a_open · Opening and tour | Capture: fresh visit; opening animation; 3-step tour (Next, Next, Done). | U2(B) |
| 3:45–3:59 | s05b_samples · Sample patients | Capture: Sample patients menu, each of the 6 hovered; the LAD case loads. Callout + shareable-link lower-third. | U3(A) U23(A) U36(A) |
| 3:59–4:21 | s05c_panel · Patient input | Capture: patient dock opens; search 'chol'; Age help tooltip; effect meter (zoom 1.3×); Alt+click reset; Reset → Undo. | U4(A) U5(B) U6(B) U37(B) E10(C) |
| 4:21–4:40 | s05d_live · Live change feedback | Capture: Hypertension off → change toast; Current smoker on → lungs chip; Systolic murmur → 'little effect'. Callouts on each. | U7(A) U9(A) U10(A) |
| 4:40–4:47 | s05e_changed · What changed | Capture: the 'What changed' panel; one change reverted. | U11(B) |
| 4:47–5:06 | s05f_3d · 3D interaction | Capture: orbit, zoom, hover LAD tooltip, click → fly-to + card/Why sync, hover left main ('not modelled'). | U12(A) U13(A) U14(A) U15(B) |
| 5:06–5:24 | s05g_views · Views and looks | Capture: Left preset, Clinical look, Front, heartbeat, turntable, legend callout, reset/fullscreen/screenshot, display-quality menu. | U16(A) U17(B) U18(B) |
| 5:24–5:36 | s05h_body · Body mode and territories | Capture: body mode with region glows, x-ray slider dragged; back to heart with territories. | U19(A) U20(A) |
| 5:36–5:53 | s05i_why · Why? | Capture: Why? waterfall for CAD → LAD → RCA; physiological breakdown; measurement table sorted. | U25(A) U26(A) |
| 5:53–6:13 | s05j_whatif · What-if | Capture: what-if on; LDL 70, BP 120, smoking off; Δ table; Show on heart; hold to compare; sensitivity chart. | U27(A) |
| 6:13–6:27 | s05k_modelcard · Model card | Capture: model card scrolled section by section to the sample outcomes. | U28(A) |
| 6:27–6:37 | s05l_export · Export | Capture: Export ▾ → PDF (pages shown full-screen), Copy summary, PNG. | U29(A) |
| 6:37–6:48 | s05m_edu · Education and theme | Capture: educational overlay (sourced, general) → light theme. | U30(B) U31(B) |
| 6:48–6:57 | s05n_devices · Tablet and phone | Captures side by side in device frames: tablet 810×1080 (bottom sheet) and phone 390×844 (tabs). | U32(B) |
| 6:57–7:08 | s05o_offline · Offline and shortcuts | Capture: API unreachable → offline banner, last result kept → automatic recovery → shortcut sheet (?). | U8(B) U33(B) |
| 7:09–7:28 | s06a_arch · Architecture | Card: animated architecture boxes, the API endpoint chips (from /openapi.json), guard terminal + proof-test note. | E1(A) E2(A) |
| 7:28–7:49 | s06b_quality · Quality | Card: test counts (count-up) + Playwright terminal, colour==API note, axe / fps / Lighthouse tiles. | P8(C) U22(C) U34(C) U35(C) E3(A) E4(A) E5(C) E6(A) E9(C) |
| 7:49–7:59 | s06c_deploy · Deployment | Capture of the live site in a browser frame (URL shown) → Docker / .bat / dev.py / rebuild cards. | E7(A) E8(B) |
| 8:01–8:31 | s07_close · Limits and close | Card: limitations → disclaimer → credits → end card (CardioLens, Team HAVOC, live + repo links). |  |
