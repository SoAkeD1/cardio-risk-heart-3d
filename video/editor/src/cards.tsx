import React from "react";
import { Img, staticFile } from "remotion";
import data from "./data.gen.json";
import type { SceneT } from "./Master";
import { C, FONT, MONO, SAFE } from "./theme";
import { Arrow, Box, Chip, CountUp, Figure, Heading, Page, Panel, ramp, Reveal, Terminal, useT } from "./ui";
import term from "./term.gen.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D = data as any;
const T = term as Record<string, { cmd: string; lines: string[] }>;
type CardProps = { sc: SceneT };

/** visible between two times (fade in at a, out at b) */
const Phase: React.FC<{ a: number; b?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ a, b, children, style }) => {
  const t = useT();
  const k = ramp(t, a, 0.45) * (b === undefined ? 1 : 1 - ramp(t, b - 0.35, 0.35));
  if (k <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, opacity: k, ...style }}>{children}</div>;
};

const Big: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 50, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2, ...style }}>{children}</div>
);

const Lower: React.FC<{ text: string; at: number; dur?: number }> = ({ text, at, dur = 3.2 }) => (
  <Reveal at={at} until={at + dur} style={{ position: "absolute", left: SAFE, bottom: 168 }}>
    <div style={{ display: "inline-block", background: "rgba(22,24,27,0.94)", border: `2px solid ${C.line}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 10, padding: "10px 18px", fontSize: 24, color: C.t1 }}>{text}</div>
  </Reveal>
);

const pct = (x: number) => `${Math.round(x * 100)}%`;

// ------------------------------------------------------------------ 1 · problem
const Problem: React.FC<CardProps> = ({ sc }) => {
  const g = sc.cues.goal!, tb = sc.cues.table!;
  const rows = D.ps_table as { ref: string; req: string; where: string }[];
  const t = useT();
  return (
    <Page>
      <Phase a={0} b={g}>
        <div style={{ position: "absolute", left: 220, top: 300, width: 1480 }}>
          <Reveal at={0.3}><Big style={{ fontSize: 64 }}>Cardiovascular disease remains a leading cause of death globally.</Big></Reveal>
          <Reveal at={4.6}><div style={{ fontSize: 40, color: C.t2, marginTop: 40, lineHeight: 1.35 }}>A narrowed coronary artery is usually confirmed by <span style={{ color: C.t1 }}>angiography</span>, an invasive test.</div></Reveal>
          <Reveal at={0.8}><div style={{ fontSize: 22, color: C.t3, marginTop: 60, fontFamily: MONO }}>Context: Multimodal AI Hackathon 2026 · Track A problem statement</div></Reveal>
        </div>
      </Phase>
      <Phase a={g} b={tb}>
        <Heading over="Track A · the question" title="Can routine data show where the risk is?" at={g} />
        <div style={{ position: "absolute", left: 160, top: 420, display: "flex", alignItems: "center", gap: 40 }}>
          {[
            ["Routine clinical data", "age · BP · ECG · labs · echo"],
            ["Predict", "CAD + LAD / LCX / RCA stenosis"],
            ["Show it in 3D", "on an interactive heart model"],
          ].map(([a, b], i) => (
            <React.Fragment key={a}>
              {i > 0 && <Reveal at={g + 0.6 + i * 0.9}><div style={{ fontSize: 60, color: C.accent }}>→</div></Reveal>}
              <Reveal at={g + 0.4 + i * 0.9}>
                <Panel style={{ width: 440, padding: "34px 30px" }}>
                  <div style={{ fontSize: 36, fontWeight: 650 }}>{a}</div>
                  <div style={{ fontSize: 26, color: C.t2, marginTop: 12 }}>{b}</div>
                </Panel>
              </Reveal>
            </React.Fragment>
          ))}
        </div>
      </Phase>
      <Phase a={tb}>
        <Heading over="Problem statement → where it is met" title="Every requirement, mapped" at={tb} />
        <div style={{ position: "absolute", left: SAFE + 32, top: 250, right: SAFE + 32, transform: `scale(${1 + 0.04 * ramp(t, tb + 0.5, 3)})`, transformOrigin: "50% 0" }}>
          <Panel style={{ padding: "8px 0" }}>
            {rows.map((r, i) => {
              const hi = ramp(t, tb + 0.6 + i * 0.32, 0.3);
              return (
                <div key={r.ref + i} style={{ display: "grid", gridTemplateColumns: "110px 640px 1fr", gap: 20, padding: "12px 26px", fontSize: 23, borderTop: i ? `1px solid ${C.line}` : "none", background: `rgba(95,179,168,${0.10 * hi})`, opacity: 0.35 + 0.65 * hi }}>
                  <span style={{ fontFamily: MONO, color: C.accent }}>{r.ref}</span>
                  <span>{r.req}</span>
                  <span style={{ color: C.t2 }}>{r.where}</span>
                </div>
              );
            })}
          </Panel>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 2a · data
const DataCard: React.FC<CardProps> = ({ sc }) => {
  const au = sc.cues.audit!, lk = sc.cues.leak!;
  const ds = D.dataset;
  return (
    <Page>
      <Heading over="Chapter 2 · data" title={`${ds.name} · UCI id ${ds.uci}`} at={0} />
      <div style={{ position: "absolute", left: SAFE + 32, top: 260, display: "flex", gap: 26 }}>
        {[[ds.n, "patients"], [ds.features, "clinical features"], [4, "targets"]].map(([v, l], i) => (
          <Reveal key={l as string} at={0.4 + i * 0.25}>
            <Panel style={{ width: 300, padding: "26px 28px" }}>
              <div style={{ fontSize: 74, fontWeight: 700 }}><CountUp at={0.4 + i * 0.25} value={v as number} /></div>
              <div style={{ fontSize: 26, color: C.t2 }}>{l}</div>
            </Panel>
          </Reveal>
        ))}
      </div>
      <Reveal at={2.0} style={{ position: "absolute", left: SAFE + 32, top: 480, width: 960 }}>
        <Panel style={{ padding: "24px 30px" }}>
          <div style={{ fontSize: 24, color: C.t2, marginBottom: 12 }}>Positive in the dataset (n = {ds.n})</div>
          {ds.prevalence.map((p: { k: string; pos: number }, i: number) => (
            <div key={p.k} style={{ display: "grid", gridTemplateColumns: "100px 1fr 150px", alignItems: "center", gap: 16, height: 54 }}>
              <span style={{ fontSize: 26, fontWeight: 650 }}>{p.k}</span>
              <div style={{ height: 24, background: C.s3, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(p.pos / ds.n) * 100}%`, background: C.accent, opacity: 0.85, transformOrigin: "left", transform: `scaleX(${1})` }} />
              </div>
              <span style={{ fontSize: 24, fontFamily: MONO, color: C.t2 }}>{p.pos} · {pct(p.pos / ds.n)}</span>
            </div>
          ))}
        </Panel>
      </Reveal>
      <Phase a={au}>
        <div style={{ position: "absolute", left: 1080, top: 260, width: 780 }}>
          <Panel style={{ padding: "26px 30px" }}>
            <div style={{ fontFamily: MONO, fontSize: 22, color: C.accent, letterSpacing: "0.1em" }}>DATA AUDIT</div>
            {["No missing values, no duplicates", "Constant column “Exertional CP” dropped", "“Fmale” typo in Sex handled in code", "Label logic checked: every CAD patient has ≥ 1 stenotic vessel; nothing relabelled"].map((x, i) => (
              <Reveal key={x} at={au + 0.2 + i * 0.5}><div style={{ fontSize: 26, marginTop: 16, lineHeight: 1.3 }}><span style={{ color: C.accent }}>✓ </span>{x}</div></Reveal>
            ))}
          </Panel>
        </div>
      </Phase>
      <Phase a={lk}>
        <div style={{ position: "absolute", left: 1080, top: 640, width: 780 }}>
          <Panel style={{ padding: "26px 30px", borderColor: `${C.raise}88` }}>
            <div style={{ fontFamily: MONO, fontSize: 22, color: C.raise, letterSpacing: "0.1em" }}>LEAKAGE RULE · REQ. 1d</div>
            <div style={{ fontSize: 30, marginTop: 12, fontWeight: 600 }}>Cath · LAD · LCX · RCA are never model inputs</div>
            <div style={{ fontSize: 24, color: C.t2, marginTop: 10 }}>asserted before every fit · the API rejects them with HTTP 400</div>
          </Panel>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 2b · validation
const Validation: React.FC<CardProps> = ({ sc }) => {
  const ho = sc.cues.holdout!, cv = sc.cues.cv!, ci = sc.cues.ci!;
  const ds = D.dataset, v = D.validation;
  const feats = ["Diamond–Forrester pretest probability", "eGFR (CKD-EPI 2021)", "TG/HDL · LDL/HDL", "NLR · PLR · abs. lymphocytes", "risk-factor & ECG counts"];
  return (
    <Page>
      <Heading over="Feature engineering & validation" title="Engineered features, strict validation" at={0} />
      <div style={{ position: "absolute", left: SAFE + 32, top: 250, display: "flex", flexWrap: "wrap", gap: 14, width: 1760 }}>
        {feats.map((f, i) => <Reveal key={f} at={0.5 + i * 0.35}><Chip>{f}</Chip></Reveal>)}
      </div>
      <Box at={ho - 0.2} x={SAFE + 32} y={430} w={360} h={170} title={`${ds.n} patients`} sub={["stratified on CAD"]} />
      <Arrow at={ho} x1={460} y1={470} x2={560} y2={420} />
      <Arrow at={ho} x1={460} y1={560} x2={560} y2={640} />
      <Box at={ho} x={570} y={350} w={420} h={150} title={`${ds.train} training (80 %)`} sub={["all modelling happens here"]} />
      <Box at={ho + 0.15} x={570} y={590} w={420} h={170} title={`${ds.holdout} hold-out (20 %)`} sub={["used once, at the very end"]} dark />
      <Arrow at={cv} x1={995} y1={425} x2={1085} y2={425} />
      <Box at={cv} x={1095} y={330} w={720} h={210} title={`${v.outer_cv} CV`} sub={[`nested tuning: ${v.inner_cv}`, "all preprocessing fitted inside each fold"]} />
      <Arrow at={ci} x1={995} y1={675} x2={1085} y2={675} />
      <Box at={ci} x={1095} y={600} w={720} h={160} title={`${v.bootstrap} bootstrap resamples`} sub={["→ 95 % confidence intervals on the hold-out"]} />
    </Page>
  );
};

// ------------------------------------------------------------------ 2c · models
const Models: React.FC<CardProps> = ({ sc }) => {
  const st = sc.cues.strategy!, ca = sc.cues.calib!;
  const th = D.thresholds;
  return (
    <Page>
      <Heading over="Model selection" title="Nine families per target, nested CV" at={0} />
      <Phase a={0} b={st}>
        <Figure src="figs/model_zoo_auc.png" at={0.4} x={SAFE + 32} y={260} w={1760} h={420} caption="Nested-CV ROC-AUC (mean ± SD) per model family and target; red = selected." />
        <Lower at={2.4} dur={4.2} text={`TabPFN was attempted and skipped: ${D.tabpfn.replace(/\.$/, "")}`} />
      </Phase>
      <Phase a={st} b={ca}>
        <div style={{ position: "absolute", left: SAFE + 32, top: 290, display: "flex", gap: 28 }}>
          {D.strategies.map((s: { k: string; name: string; auc: number }, i: number) => (
            <Reveal key={s.k} at={st + 0.2 + i * 0.3}>
              <Panel style={{ width: 560, padding: "30px 32px", borderColor: s.k === "A" ? C.accent : C.line }}>
                <div style={{ fontFamily: MONO, fontSize: 24, color: C.accent }}>STRATEGY {s.k}{s.k === "A" ? " · KEPT" : ""}</div>
                <div style={{ fontSize: 34, fontWeight: 650, marginTop: 10, minHeight: 90 }}>{s.name}</div>
                <div style={{ fontSize: 24, color: C.t2, marginTop: 8 }}>mean vessel AUC (nested CV)</div>
                <div style={{ fontSize: 56, fontWeight: 700 }}><CountUp at={st + 0.3 + i * 0.3} value={s.auc} digits={3} /></div>
              </Panel>
            </Reveal>
          ))}
        </div>
        <Reveal at={st + 1.6} style={{ position: "absolute", left: SAFE + 32, top: 690, fontSize: 28, color: C.t2 }}>
          Differences are within noise → the simplest, independent models are kept.
        </Reveal>
      </Phase>
      <Phase a={ca}>
        <Figure src="figs/calibration_reliability.png" at={ca + 0.1} x={SAFE + 32} y={250} w={1760} h={380} caption="Out-of-fold reliability: predicted vs observed, before and after calibration (sigmoid kept)." />
        <div style={{ position: "absolute", left: SAFE + 32, top: 740, display: "flex", gap: 14, alignItems: "center" }}>
          <Reveal at={ca + 1.6}><span style={{ fontSize: 24, color: C.t2, marginRight: 8 }}>F1-optimal thresholds</span></Reveal>
          {(["cad", "lad", "lcx", "rca"] as const).map((k, i) => (
            <Reveal key={k} at={ca + 1.8 + i * 0.2}><Chip style={{ fontFamily: MONO }}>{k.toUpperCase()} {th[k]}</Chip></Reveal>
          ))}
          <Reveal at={ca + 3.0}><Chip color={C.warn} style={{ marginLeft: 24 }}>CAD tiers: Low &lt; {D.tiers.low} ≤ Moderate &lt; {D.tiers.high} ≤ High</Chip></Reveal>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 2d · results
const Results: React.FC<CardProps> = ({ sc }) => {
  const sh = sc.cues.shap!, la = sc.cues.latency!;
  const cols = ["Target", "Model", "Hold-out ROC-AUC [95 % CI]", "Accuracy", "Precision", "Recall", "F1"];
  return (
    <Page>
      <Heading over="Requirement 1e · hold-out results (n = 61, used once)" title="Results on unseen patients" at={0} />
      <Phase a={0} b={sh}>
        <div style={{ position: "absolute", left: SAFE + 32, top: 270, right: SAFE + 32 }}>
          <Panel style={{ padding: "10px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 360px 420px repeat(4, 1fr)", padding: "14px 28px", fontSize: 22, color: C.t2 }}>
              {cols.map((c) => <span key={c}>{c}</span>)}
            </div>
            {D.results.map((r: Record<string, number | string>, i: number) => (
              <Reveal key={r.key as string} at={0.6 + i * 0.5}>
                <div style={{ display: "grid", gridTemplateColumns: "140px 360px 420px repeat(4, 1fr)", alignItems: "baseline", padding: "18px 28px", borderTop: `1px solid ${C.line}`, fontSize: 28, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontWeight: 700 }}>{r.name}</span>
                  <span style={{ fontSize: 22, color: C.t2, fontFamily: MONO }}>{r.model}</span>
                  <span><b style={{ fontSize: 38 }}><CountUp at={0.6 + i * 0.5} value={r.auc as number} digits={3} /></b> <span style={{ color: C.t2, fontSize: 23 }}>[{(r.lo as number).toFixed(3)}, {(r.hi as number).toFixed(3)}]</span></span>
                  {(["acc", "prec", "rec", "f1"] as const).map((k) => <span key={k}>{(r[k] as number).toFixed(3)}</span>)}
                </div>
              </Reveal>
            ))}
          </Panel>
        </div>
      </Phase>
      <Phase a={sh} b={la}>
        <Figure src="figs/shap_global_cad.png" at={sh + 0.1} x={SAFE + 32} y={250} w={1300} h={480} caption="CAD: exact SHAP, in probability points, mapped back to raw clinical measurements." />
        <Reveal at={sh + 1.2} style={{ position: "absolute", left: 1450, top: 300, width: 400 }}>
          <Panel style={{ padding: "26px 28px" }}>
            <div style={{ fontSize: 24, color: C.t2 }}>LIME agrees with SHAP on</div>
            <div style={{ fontSize: 64, fontWeight: 700 }}>{D.lime_overlap} / 5</div>
            <div style={{ fontSize: 24, color: C.t2 }}>top-5 drivers (average)</div>
          </Panel>
        </Reveal>
      </Phase>
      <Phase a={la}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 360, textAlign: "center" }}>
          <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: "-0.03em" }}><CountUp at={la} value={D.latency_ms.mean} suffix=" ms" /></div>
          <div style={{ fontSize: 32, color: C.t2 }}>one full prediction with SHAP for all four targets, on CPU (p95 {D.latency_ms.p95} ms)</div>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 3a · mapping
const Mapping: React.FC<CardProps> = ({ sc }) => {
  const sc1 = sc.cues.scale!, fl = sc.cues.flag!;
  const stops = D.colour_stops as [number, string][];
  const grad = `linear-gradient(90deg, ${stops.map(([p, c]) => `${c} ${p * 100}%`).join(", ")})`;
  return (
    <Page>
      <Heading over="Chapter 3 · from prediction to anatomy" title="One source of truth, one pure function" at={0} />
      <Box at={0.6} x={SAFE + 32} y={290} w={380} h={170} title="anatomy_map.json" sub={["every mesh name, colour, label"]} mono />
      <Box at={1.4} x={530} y={290} w={380} h={170} title="prediction" sub={["CAD + LAD / LCX / RCA", "+ SHAP"]} />
      <Arrow at={2.2} x1={450} y1={470} x2={980} y2={560} />
      <Arrow at={2.2} x1={720} y1={465} x2={980} y2={560} />
      <Box at={2.4} x={990} y={490} w={420} h={150} title="scene_state()" sub={["pure · ≈0.3 ms · schema-checked"]} mono dark />
      <Arrow at={3.2} x1={1415} y1={565} x2={1500} y2={565} />
      <Box at={3.4} x={1510} y={490} w={330} h={150} title="3D heart" sub={["colours · flags · tooltips"]} />
      <Phase a={sc1}>
        <div style={{ position: "absolute", left: SAFE + 32, top: 720, width: 1100 }}>
          <div style={{ fontSize: 26, color: C.t2, marginBottom: 10 }}>Colour = calibrated probability of ≥ 50 % stenosis · one shared scale · CIELAB</div>
          <div style={{ height: 44, borderRadius: 8, background: grad }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 20, color: C.t2, marginTop: 6 }}><span>0 %</span><span>50 %</span><span>100 %</span></div>
        </div>
      </Phase>
      <Phase a={fl}>
        <div style={{ position: "absolute", left: 1260, top: 700, width: 600 }}>
          <Panel style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: 26 }}>Above threshold → <b>outline + pulse</b> + “Stenosis likely”</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {D.results.map((r: { name: string; auc: number }) => {
                const b = (D.reliability_rule as { badge: string; min_auc: number }[]).find((x) => r.auc >= x.min_auc)!.badge;
                return <Chip key={r.name} color={b === "High" ? C.accent : b === "Moderate" ? C.warn : C.raise} style={{ fontSize: 21 }}>{r.name} · {b}</Chip>;
              })}
            </div>
            <div style={{ fontSize: 20, color: C.t3, marginTop: 10 }}>reliability badge from hold-out AUC</div>
          </Panel>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 3b · rules
const Rules: React.FC<CardProps> = ({ sc }) => {
  const ov = sc.cues.overlays!, wi = sc.cues.whatif!;
  return (
    <Page>
      <Heading over="No anatomical over-claiming" title="Whole arteries, never lesion locations" at={0} />
      <Figure src="figs/coronary_schematic_high.png" at={0.4} until={ov} x={SAFE + 32} y={250} w={1150} h={684} />
      <Phase a={0} b={ov}>
        <div style={{ position: "absolute", left: 1290, top: 300, width: 560 }}>
          {["Labels: ≥ 50 % stenosis somewhere in the artery", "So the whole vessel is coloured uniformly", "Left main & side branches: neutral, “not modelled”", "No input ever chooses a vessel or a location (tested)"].map((x, i) => (
            <Reveal key={x} at={0.8 + i * 0.9}><div style={{ fontSize: 30, marginBottom: 26, lineHeight: 1.3 }}><span style={{ color: C.accent }}>• </span>{x}</div></Reveal>
          ))}
        </div>
      </Phase>
      <Figure src="figs/territories_demo.png" at={ov} until={wi} x={SAFE + 32} y={260} w={860} h={538} caption="AHA 17-segment territories, right-dominant (optional overlay)" bg="#222" />
      <Figure src="figs/body_front.png" at={ov + 0.6} until={wi} x={1000} y={260} w={860} h={538} caption="Body regions: location of a contributing risk factor, NOT of disease" bg="#222" />
      <Phase a={wi}>
        <div style={{ position: "absolute", left: 260, right: 260, top: 400, textAlign: "center" }}>
          <Big style={{ fontSize: 58 }}>What-if = model-estimated association</Big>
          <div style={{ fontSize: 36, color: C.t2, marginTop: 24 }}>correlational, not a treatment effect · only modifiable factors can be changed</div>
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 4a · heart source
const HeartSource: React.FC<CardProps> = ({ sc }) => {
  const sk = sc.cues.sketchfab!;
  const a = D.asset;
  return (
    <Page>
      <Heading over="Chapter 4 · building the 3D heart" title="From procedural to realistic" at={0} />
      <Figure src="assets/procedural_front.png" at={0.4} until={sk + 0.2} x={500} y={250} w={920} h={680} caption="v1: fully procedural CC0 heart, kept as a fallback (--heart-source procedural)" bg="#0d0d0e" kb={false} />
      <Phase a={sk}>
        <Figure src="figs/src_front.png" at={sk} x={SAFE + 32} y={250} w={620} h={620} bg="#777" />
        <Reveal at={sk + 0.4} style={{ position: "absolute", left: 760, top: 270, width: 1060 }}>
          <div style={{ fontSize: 40, fontWeight: 650 }}>“Realistic Human Heart” by neshallads</div>
          <div style={{ fontSize: 28, color: C.t2, marginTop: 10 }}>Sketchfab · licensed CC BY 4.0 · modified</div>
        </Reveal>
        {[`Headless Blender: aligned to the left-anterior-inferior long axis`, `Scaled to ${a.base_to_apex_cm} cm base-to-apex`, "Split into Heart_Myocardium + Aorta; descending aorta extended"].map((x, i) => (
          <Reveal key={x} at={sk + 2.2 + i * 1.6} style={{ position: "absolute", left: 760, top: 470 + i * 80, fontSize: 30 }}><span style={{ color: C.accent }}>✓ </span>{x}</Reveal>
        ))}
        <div style={{ position: "absolute", left: SAFE + 32, top: 900, fontSize: 20, color: C.t3, fontFamily: MONO, width: 1760 }}>{D.credits.heart}</div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 4b · heart build
const HeartBuild: React.FC<CardProps> = ({ sc }) => {
  const lo = sc.cues.looks!, li = sc.cues.lite!;
  const a = D.asset;
  return (
    <Page>
      <Heading over="Vessels, looks and budgets" title="Painted lines → real, pickable tubes" at={0} />
      <Phase a={0} b={lo}>
        <Figure src="figs/compare_sketchfab_vs_ours.png" at={0.3} x={SAFE + 32} y={250} w={1040} h={606} bg="#fff" />
        {["Traced along the grooves: minimum-cost paths on a cylindrical unwrap", "LCX smoothed with a degree-4 Chebyshev fit", `Left main ${a.lm_mm} mm; every bend ≤ 35°`, "Tubes 1.5–2 mm above the surface"].map((x, i) => (
          <Reveal key={x} at={0.8 + i * 1.3} style={{ position: "absolute", left: 1180, top: 300 + i * 130, width: 680, fontSize: 29, lineHeight: 1.3 }}><span style={{ color: C.accent }}>• </span>{x}</Reveal>
        ))}
      </Phase>
      <Phase a={lo} b={li}>
        <Figure src="figs/heart_front.png" at={lo} x={SAFE + 32} y={250} w={860} h={538} caption="Realistic (default)" bg="#222" />
        <Figure src="figs/heart_front_clinical.png" at={lo + 0.4} x={1000} y={250} w={860} h={538} caption="Clinical · same file (KHR_materials_variants)" bg="#222" />
        <Reveal at={lo + 2.0} style={{ position: "absolute", left: SAFE + 32, top: 880, fontSize: 26, color: C.t2 }}>+ invisible 6 mm picking proxies · outline shells for flags · camera anchors · view presets</Reveal>
      </Phase>
      <Phase a={li}>
        <Figure src="figs/lite_vs_full.png" at={li} x={SAFE + 32} y={250} w={900} h={302} bg="#222" />
        <div style={{ position: "absolute", left: 1010, top: 250, width: 850 }}>
          <Panel style={{ padding: "16px 26px", display: "flex", gap: 40 }}>
            {[["heart.glb", a.full_tris, a.full_mb, "≤ 150k · ≤ 10 MB"], ["heart_lite.glb", a.lite_tris, a.lite_mb, "≤ 60k · ≤ 4 MB"]].map(([n, tr, mb, b]) => (
              <div key={n as string}>
                <div style={{ fontFamily: MONO, fontSize: 26, color: C.accent }}>{n}</div>
                <div style={{ fontSize: 30, fontWeight: 650 }}>{(tr as number).toLocaleString("en-US")} triangles · {mb} MB</div>
                <div style={{ fontSize: 22, color: C.t2 }}>budget {b} · Draco + WebP</div>
              </div>
            ))}
          </Panel>
        </div>
        {T.check_glb && <Terminal at={li + 1.0} x={SAFE + 32} y={575} w={1790} h={380} cps={160} title={T.check_glb.cmd} lines={T.check_glb.lines.map((l) => ({ text: l, color: /fail|error/i.test(l) ? C.raise : /ok|pass/i.test(l) ? C.accent : C.t1 }))} />}
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 6a · architecture
const Architecture: React.FC<CardProps> = ({ sc }) => {
  const gd = sc.cues.guard!;
  const eps = (D.endpoints as string[]).map((e) => e.replace("/api/", ""));
  return (
    <Page>
      <Heading over="Chapter 6 · architecture" title="One-way data flow, nothing duplicated" at={0} />
      {[
        ["cardio_ml", ["frozen models", "SHAP → raw features"]],
        ["anatomy.py", ["scene_state()", "← anatomy_map.json"]],
        ["FastAPI", [`${eps.length} endpoints`, "one error shape"]],
        ["React", ["schema → form", "debounce + abort"]],
        ["R3F viewer", ["binds by mesh name", "colour tween"]],
      ].map(([t, s], i) => (
        <React.Fragment key={t as string}>
          <Box at={0.4 + i * 0.15} x={SAFE + 32 + i * 360} y={280} w={300} h={170} title={t as string} sub={s as string[]} mono={i < 2} dark={i === 4} />
          {i > 0 && <Arrow at={0.8 + i * 0.15} x1={SAFE + 32 + i * 360 - 58} y1={365} x2={SAFE + 32 + i * 360 - 6} y2={365} />}
        </React.Fragment>
      ))}
      <Reveal at={3.2} style={{ position: "absolute", left: SAFE + 32, top: 500, width: 1760 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {eps.map((e) => <Chip key={e} style={{ fontFamily: MONO, fontSize: 22 }}>/api/{e}</Chip>)}
        </div>
      </Reveal>
      <Phase a={gd}>
        {T.guard && <Terminal at={gd} x={SAFE + 32} y={640} w={1000} h={250} title={T.guard.cmd} lines={T.guard.lines.map((l) => ({ text: l, color: /OK/.test(l) ? C.accent : C.t1 }))} />}
        <Reveal at={gd + 1.2} style={{ position: "absolute", left: 1130, top: 650, width: 720 }}>
          <Panel style={{ padding: "22px 26px" }}>
            <div style={{ fontSize: 28, fontWeight: 650 }}>Proof test</div>
            <div style={{ fontSize: 24, color: C.t2, marginTop: 8, lineHeight: 1.35 }}>changes a colour, a threshold and a label in a temporary copy of the artifacts → the UI shows them with zero frontend changes</div>
          </Panel>
        </Reveal>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 6b · quality
const Quality: React.FC<CardProps> = ({ sc }) => {
  const nb = sc.cues.numbers!;
  const q = D.quality, ts = D.tests;
  return (
    <Page>
      <Heading over="Quality · re-run on this build" title="Tested end to end" at={0} />
      <div style={{ position: "absolute", left: SAFE + 32, top: 260, display: "flex", gap: 24 }}>
        {[[ts.pytest, "pytest", "ML · mapping · API"], [ts.vitest, "Vitest", "UI units"], [ts.playwright, "Playwright", "browser end-to-end"]].map(([n, a, b], i) => (
          <Reveal key={a as string} at={0.5 + i * 0.4}>
            <Panel style={{ width: 380, padding: "24px 28px" }}>
              <div style={{ fontSize: 70, fontWeight: 700 }}><CountUp at={0.5 + i * 0.4} value={n as number} /> <span style={{ fontSize: 30, color: C.accent }}>passed</span></div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{a}</div>
              <div style={{ fontSize: 22, color: C.t2 }}>{b}</div>
            </Panel>
          </Reveal>
        ))}
      </div>
      {T.e2e && <Terminal at={2.2} x={1300} y={260} w={560} h={250} title="playwright test" lines={T.e2e.lines.slice(-3).map((l) => ({ text: l, color: /passed/.test(l) ? C.accent : C.t2 }))} />}
      <Reveal at={4.0} style={{ position: "absolute", left: SAFE + 32, top: 520, width: 1760, fontSize: 28, color: C.t2 }}>
        incl. <span style={{ color: C.t1 }}>3D colour of every artery = API colour (± 1/255)</span>, PDF text, offline recovery, keyboard-only use
      </Reveal>
      <Reveal at={6.0} style={{ position: "absolute", left: SAFE + 32, top: 900, width: 1760, fontSize: 21, color: C.t3 }}>
        Also: 2D fallback when WebGL is unavailable · dev debug drawer (Ctrl+Shift+D) · reduced-motion &amp; screen-reader live region · API types generated from the schema · scene-state snapshot tests
      </Reveal>
      <Phase a={nb}>
        <div style={{ position: "absolute", left: SAFE + 32, top: 610, display: "flex", gap: 24 }}>
          {[[`${q.axe_serious}`, "serious axe issues"], [`${q.fps_full}`, "fps orbiting (full)"], [`${q.lighthouse.performance}`, "Lighthouse performance"], [`${q.lighthouse.accessibility}`, "Lighthouse accessibility"], [`${q.lighthouse["best-practices"]}`, "best practices"]].map(([v, l], i) => (
            <Reveal key={l} at={nb + i * 0.3}>
              <Panel style={{ width: 330, padding: "22px 24px" }}>
                <div style={{ fontSize: 60, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 22, color: C.t2 }}>{l}</div>
              </Panel>
            </Reveal>
          ))}
        </div>
      </Phase>
    </Page>
  );
};

// ------------------------------------------------------------------ 7 · close
const Close: React.FC<CardProps> = ({ sc }) => {
  const di = sc.cues.disc!, cr = sc.cues.credits!;
  const end = sc.lead + sc.voice + 0.6;
  return (
    <Page>
      <Phase a={0} b={di}>
        <Heading over="Chapter 7 · honesty" title="Known limits" at={0} />
        {["Single centre, 303 patients, high CAD prevalence (referral cohort)", "No external validation; a 61-patient hold-out gives wide intervals", "No lesion location: whole-vessel estimates only", "RCA reliability: Limited (hold-out AUC 0.741), and the app says so"].map((x, i) => (
          <Reveal key={x} at={0.5 + i * 1.6} style={{ position: "absolute", left: SAFE + 32, top: 290 + i * 110, fontSize: 36 }}><span style={{ color: C.warn }}>• </span>{x}</Reveal>
        ))}
      </Phase>
      <Phase a={di} b={cr}>
        <div style={{ position: "absolute", left: 200, right: 200, top: 360, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.accent, letterSpacing: "0.14em" }}>DISCLAIMER</div>
          <Big style={{ fontSize: 56, marginTop: 24 }}>{D.disclaimer}</Big>
        </div>
      </Phase>
      <Phase a={cr} b={end}>
        <Heading over="Credits" title="Thank you" at={cr} />
        {[D.credits.dataset, D.credits.heart, D.credits.hdri, "Libraries: scikit-learn · XGBoost · LightGBM · CatBoost · SHAP · LIME · Optuna · FastAPI · React · three.js · React Three Fiber"].map((x: string, i: number) => (
          <Reveal key={i} at={cr + 0.3 + i * 0.4} style={{ position: "absolute", left: SAFE + 32, top: 300 + i * 120, width: 1760, fontSize: 25, color: C.t2, lineHeight: 1.4 }}>{x}</Reveal>
        ))}
      </Phase>
      <Phase a={end}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <svg viewBox="0 0 32 32" width={110} height={110}><path d="M16 25s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 16 10.9a4.8 4.8 0 0 1 8.5 2.9C24.5 19.8 16 25 16 25z" fill="none" stroke={C.accent} strokeWidth={2} /><path d="M9.5 16h4l1.5-3 2 6 1.5-3h4" fill="none" stroke={C.t1} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: "-0.035em" }}>CardioLens</div>
          </div>
          <div style={{ fontSize: 40, color: C.t2, marginTop: 14 }}>See where cardiac risk lives.</div>
          <div style={{ fontSize: 34, marginTop: 60, fontWeight: 650 }}>Team HAVOC · Multimodal AI Hackathon 2026 · Track A</div>
          <div style={{ fontFamily: MONO, fontSize: 28, color: C.accent, marginTop: 22 }}>{D.live.replace("https://", "")}</div>
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.t2, marginTop: 10 }}>{D.repo.replace("https://", "")}</div>
        </div>
      </Phase>
    </Page>
  );
};

export const CARDS: Record<string, React.FC<CardProps>> = {
  problem: Problem, data: DataCard, validation: Validation, models: Models, results: Results,
  mapping: Mapping, rules: Rules, heart_source: HeartSource, heart_build: HeartBuild,
  architecture: Architecture, quality: Quality, close: Close,
};

export { FONT, Img, staticFile };
