// Per-scene editorial overlays for the captured app scenes.
// Time refs: a narration cue name ("htn"), "mark:<name>" (an action recorded by the capture), or seconds.
// Lower-thirds = 1 line, 3 s. Callouts = 2 px accent rectangles around a recorded element (max 2 at once),
// shown 200 ms before the action. Zooms <= 1.35x, eased 700 ms, held, eased back.
export type Ref = string | number;
export type Overlay = {
  lower?: { at: Ref; text: string; dur?: number }[];
  callouts?: { mark: string; label?: string; dur?: number; lead?: number }[];
  zooms?: { at: Ref; dur: number; scale: number; focus: Ref | { x: number; y: number } }[];
  layout?: "devices" | "browser" | "export";
};

export const OVERLAYS: Record<string, Overlay> = {
  s00_cold: {
    lower: [{ at: 1.0, text: "The app's own opening animation" , dur: 2.6 }],
  },
  s05a_open: {
    lower: [{ at: "mark:tour", text: "First visit: a 3-step tour · skippable, remembered" }],
  },
  s05b_samples: {
    callouts: [{ mark: "menu", label: "6 de-identified hold-out patients", dur: 4.5 }],
    lower: [{ at: "pick", text: "Shareable link: /?case=lad  ·  every sample has one", dur: 3.4 }],
  },
  s05c_panel: {
    callouts: [
      { mark: "search", label: "search", dur: 2.6 },
      { mark: "help", label: "help · typical range", dur: 2.8 },
      { mark: "meter", label: "effect meter", dur: 2.6 },
      { mark: "undo", label: "Reset → Undo", dur: 2.4 },
    ],
    lower: [{ at: 0.8, text: "Form generated from /api/schema · no field is hardcoded" }],
    zooms: [{ at: "field", dur: 5.4, scale: 1.3, focus: { x: 330, y: 330 } }],
  },
  s05d_live: {
    lower: [{ at: 0.5, text: "Live prediction · 250 ms debounce · stale requests cancelled" }],
    callouts: [
      { mark: "toast_htn", label: "per-target change", dur: 3.4 },
      { mark: "chip", label: "region link: lungs", dur: 3.0 },
      { mark: "little", label: "honest: little effect", dur: 3.0 },
    ],
  },
  s05e_changed: {
    callouts: [{ mark: "panel", label: "What changed · click to revert", dur: 5.5 }],
  },
  s05f_3d: {
    lower: [
      { at: 0.7, text: "Orbit · zoom · damping (requirement 2c)" },
      { at: "click", text: "Two-way selection: 3D ↔ card ↔ Why tab" },
      { at: "lm", text: "Left main & branches: not modelled, no label in the dataset" },
    ],
  },
  s05g_views: {
    lower: [{ at: "look", text: "Realistic ↔ Clinical: KHR_materials_variants, one file" }],
    callouts: [{ mark: "legend", label: "thresholds on the scale · collision-free ticks", dur: 3.0 }],
  },
  s05h_body: {
    lower: [
      { at: 0.6, text: "Body regions = where a contributing factor lives, NOT disease" },
      { at: "terr", text: "AHA 17-segment territories · right-dominant assumption" },
    ],
  },
  s05i_why: {
    lower: [{ at: 0.6, text: "SHAP in probability points: base rate → this patient (3b)" }],
    callouts: [{ mark: "table", label: "value · typical range · contribution (3c)", dur: 4.0 }],
  },
  s05j_whatif: {
    callouts: [{ mark: "delta", label: "before · after · Δ", dur: 3.6 }, { mark: "hold", label: "hold to compare", dur: 2.4 }],
    lower: [{ at: 0.5, text: "Modifiable factors only · model-estimated, not a treatment effect" }],
  },
  s05k_modelcard: {
    lower: [{ at: 0.6, text: "Metrics with 95 % CIs · validation · thresholds · limitations" }],
  },
  s05l_export: { layout: "export", lower: [{ at: "mark:pdf", text: "PDF: the disclaimer is on every page", dur: 3.4 }] },
  s05m_edu: {
    callouts: [{ mark: "edu", label: "general facts with sources · not this model", dur: 4.0 }],
  },
  s05n_devices: { layout: "devices" },
  s05o_offline: {
    callouts: [{ mark: "banner", label: "offline banner · last result kept", dur: 3.6 }],
    lower: [{ at: "mark:recovered", text: "Reconnected automatically (health check every 3 s)", dur: 2.8 }],
  },
  s06c_deploy: { layout: "browser" },
};
