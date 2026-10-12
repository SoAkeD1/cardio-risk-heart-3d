// A4 PDF report (jsPDF, loaded lazily). Disclaimer in the footer of EVERY page. Text only uses glyphs available
// in the built-in Helvetica font (">=" instead of a math sign, "-" instead of minus).
import type { AnatomyMap, FeatureSpec, PredictOut, SchemaResponse, Target, WhatIfOut } from "../../api/types";
import { byImpact, featureValue, pct } from "../../lib/format";

const T_LABEL: Record<Target, string> = { cad: "CAD", lad: "LAD", lcx: "LCX", rca: "RCA" };
const ascii = (s: string) =>
  s.replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, "-").replace(/×/g, "x").replace(/µ/g, "u").replace(/²/g, "2").replace(/³/g, "3");
const ptsA = (d: number) => {
  const v = Math.round(d * 100);
  return v === 0 ? (d === 0 ? "0 pts" : (d > 0 ? "+" : "-") + "<1 pt") : `${v > 0 ? "+" : "-"}${Math.abs(v)} pts`;
};

export async function buildReportPdf(opts: {
  prediction: PredictOut;
  schema: SchemaResponse;
  map?: AnatomyMap;
  patient: Record<string, string | number>;
  changed: string[];
  snapshot?: string | null;
  whatIf?: WhatIfOut | null;
  whatIfChanges?: Record<string, number>;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16, CW = W - 2 * M;
  const p = opts.prediction;
  const fx: Record<string, FeatureSpec> = Object.fromEntries(opts.schema.features.map((f) => [f.name, f]));
  const disclaimer = ascii(p.disclaimer);
  let y = 0;

  const header = () => {
    doc.setFillColor(22, 24, 27);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(242, 240, 237);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CardioLens", M, 11.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Cardiac risk report - model estimate (decision support)", M + 31, 11.5);
    doc.text(new Date().toLocaleString("en-GB"), W - M, 11.5, { align: "right" });
    doc.setTextColor(27, 28, 30);
    y = 26;
  };
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(200);
      doc.line(M, 279, W - M, 279);
      doc.setFontSize(8);
      doc.setTextColor(60);
      doc.text(doc.splitTextToSize(disclaimer, CW - 20), M, 283);
      doc.setTextColor(120);
      doc.text(
        ascii("3D heart: 'Realistic Human Heart' by neshallads (Sketchfab), CC BY 4.0, modified. Data: Z-Alizadeh Sani (UCI)."),
        M,
        292,
      );
      doc.text(`${i} / ${n}`, W - M, 292, { align: "right" });
    }
  };
  const need = (h: number) => {
    if (y + h > 274) {
      doc.addPage();
      header();
    }
  };
  const h2 = (s: string) => {
    need(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(27, 28, 30);
    doc.text(s, M, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };
  const para = (s: string, color = 60) => {
    const lines = doc.splitTextToSize(ascii(s), CW);
    need(lines.length * 4.2 + 1);
    doc.setTextColor(color);
    doc.text(lines, M, y);
    y += lines.length * 4.2 + 1.5;
  };
  const table = (head: string[], rows: string[][], widths: number[]) => {
    need(6 + rows.length * 5);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(93, 90, 85);
    let x = M;
    head.forEach((h, i) => {
      doc.text(h, x, y);
      x += widths[i]!;
    });
    y += 1.5;
    doc.setDrawColor(220);
    doc.line(M, y, M + CW, y);
    y += 3.6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(27, 28, 30);
    for (const r of rows) {
      need(5);
      x = M;
      r.forEach((c, i) => {
        doc.text(doc.splitTextToSize(ascii(c), widths[i]! - 2)[0] ?? "", x, y);
        x += widths[i]!;
      });
      y += 4.6;
    }
    y += 2;
  };

  header();
  // --- summary
  const h = p.scene.heart;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(pct(h.cad_prob), M, y + 8);
  doc.setFontSize(11);
  doc.text(`${h.cad_prob >= h.threshold ? "CAD likely" : "CAD unlikely"} - ${h.risk_tier} risk tier`, M + 30, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(
    `Expected stenotic vessels: ${h.expected_stenotic_vessels.toFixed(1)} of 3 - Model reliability: ${h.reliability} (hold-out AUC ${h.holdout_auc.toFixed(2)})`,
    M + 30,
    y + 8.5,
  );
  y += 15;
  para(p.summary_text, 27);

  // --- 3D snapshot (front preset, 2x)
  if (opts.snapshot) {
    const img = new Image();
    img.src = opts.snapshot;
    await img.decode().catch(() => undefined);
    const ratio = img.height && img.width ? img.height / img.width : 0.6;
    const iw = CW * 0.62, ih = iw * ratio;
    need(ih + 4);
    doc.addImage(opts.snapshot, opts.snapshot.startsWith("data:image/jpeg") ? "JPEG" : "PNG", M, y, iw, ih);
    // vessel table beside the image
    let ty = y + 4;
    const tx = M + iw + 5;
    doc.setFontSize(9);
    for (const v of ["lad", "lcx", "rca"] as const) {
      const s = p.scene.vessels[v]!;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(27, 28, 30);
      doc.text(`${v.toUpperCase()}  ${pct(s.prob)}`, tx, ty);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text(doc.splitTextToSize(`${s.flagged ? "Stenosis likely" : "Below threshold"} (threshold ${pct(s.threshold)}). Reliability: ${s.reliability}.`, W - M - tx), tx, ty + 4.2);
      ty += 15;
    }
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize("Colour = calibrated probability of >=50% stenosis; outline = at/above threshold. Whole-vessel estimates: no lesion location.", W - M - tx), tx, ty + 2);
    y += ih + 5;
  } else {
    h2("Arteries");
    table(
      ["Artery", "Probability", "Threshold", "Flag", "Reliability"],
      (["lad", "lcx", "rca"] as const).map((v) => {
        const s = p.scene.vessels[v]!;
        return [s.display_name, pct(s.prob), pct(s.threshold), s.flagged ? "Stenosis likely" : "-", s.reliability];
      }),
      [64, 26, 24, 34, 30],
    );
  }

  // --- patient summary
  h2("Patient summary (changed and key fields)");
  const key = ["age", "sex", "bmi", "bp", "fbs", "ldl", "hdl", "tg", "dm", "htn", "current_smoker", "typical_chest_pain", "ef_tte"];
  const names = [...new Set([...opts.changed, ...key])].filter((n) => fx[n]);
  const cells = names.map((n) => [ascii(fx[n]!.label), ascii(featureValue(opts.patient[n], fx[n]))]);
  const half = Math.ceil(cells.length / 2);
  table(
    ["Measurement", "Value", "Measurement", "Value"],
    cells.slice(0, half).map((c, i) => [...c, ...(cells[half + i] ?? ["", ""])]),
    [52, 37, 52, 37],
  );

  // --- drivers
  h2("Top-5 drivers per estimate (SHAP, probability points)");
  for (const t of ["cad", "lad", "lcx", "rca"] as Target[]) {
    const rows = byImpact(p.contributions[t] ?? []).slice(0, 5);
    para(`${T_LABEL[t]} (${pct(t === "cad" ? p.prediction.cad.prob : p.prediction[t].prob)}): ${rows
      .map((r) => `${fx[r.feature]?.label ?? r.label} = ${featureValue(r.value, fx[r.feature])} ${ptsA(r.shap)}`)
      .join("; ")}`);
  }

  // --- groups
  h2("Physiological breakdown (share of the CAD explanation)");
  const g = p.prediction.group_contributions.cad ?? {};
  para(opts.schema.groups.map((x) => `${x.label} ${Math.round(g[x.key] ?? 0)}%`).join(" - "));

  // --- what-if
  if (opts.whatIf && opts.whatIfChanges && Object.keys(opts.whatIfChanges).length) {
    h2("What-if exploration");
    para(`Changes: ${Object.entries(opts.whatIfChanges).map(([k, v]) => `${fx[k]?.label ?? k} -> ${featureValue(v, fx[k])}`).join("; ")}`);
    table(
      ["Target", "Before", "After", "Change"],
      (["cad", "lad", "lcx", "rca"] as Target[]).map((t) => [T_LABEL[t], pct(opts.whatIf!.before[t].prob), pct(opts.whatIf!.after[t].prob), ptsA(opts.whatIf!.delta[t] ?? 0)]),
      [40, 30, 30, 30],
    );
    para("Model-estimated change only - correlational, not a treatment effect.", 27);
  }

  footer();
  return doc.output("blob");
}
