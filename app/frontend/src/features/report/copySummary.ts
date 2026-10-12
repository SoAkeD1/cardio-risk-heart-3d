import type { FeatureSpec, PredictOut } from "../../api/types";
import { byImpact, featureValue, pct, pts } from "../../lib/format";

/** Plain-text clinical summary for the clipboard. */
export function summaryText(p: PredictOut, fx: Record<string, FeatureSpec>): string {
  const h = p.scene.heart;
  const lines = [
    `CardioLens model estimate (${new Date().toLocaleString("en-GB")})`,
    `CAD: ${pct(h.cad_prob)} - ${h.cad_prob >= h.threshold ? "CAD likely" : "CAD unlikely"}, ${h.risk_tier} risk tier; expected stenotic vessels ${h.expected_stenotic_vessels.toFixed(1)} of 3 (reliability ${h.reliability}).`,
    ...(["lad", "lcx", "rca"] as const).map((v) => {
      const s = p.scene.vessels[v]!;
      return `${s.display_name}: ${pct(s.prob)} (threshold ${pct(s.threshold)})${s.flagged ? " - stenosis likely" : ""}; reliability ${s.reliability}.`;
    }),
    `Main CAD drivers: ${byImpact(p.contributions.cad ?? [])
      .slice(0, 5)
      .map((r) => `${fx[r.feature]?.label ?? r.label} ${featureValue(r.value, fx[r.feature])} (${pts(r.shap)})`)
      .join("; ")}.`,
    p.summary_text,
    p.disclaimer,
  ];
  return lines.join("\n");
}
