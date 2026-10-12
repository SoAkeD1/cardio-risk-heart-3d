import { useStore } from "../../state/store";
import { Skeleton } from "../../ui/Skeleton";
import { RiskTierChip, useCountUp } from "./parts";

export function RiskSummary() {
  const p = useStore((s) => s.prediction);
  const pending = useStore((s) => s.pending);
  const heart = p?.scene.heart;
  const cad = useCountUp(heart ? heart.cad_prob * 100 : undefined);
  const exp = useCountUp(heart?.expected_stenotic_vessels);
  if (!p || !heart) return <Skeleton className="m-4 h-[168px]" />;
  const likely = heart.cad_prob >= heart.threshold;
  return (
    <section aria-labelledby="risk-summary-h" className="px-4 pb-4 pt-3">
      <h2 id="risk-summary-h" className="sr-only">
        CAD risk summary
      </h2>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-t2">Probability of coronary artery disease</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-hero font-semibold" data-testid="cad-prob" style={{ opacity: pending ? 0.75 : 1 }}>
              {Math.round(cad ?? 0)}%
            </span>
            <span className="text-sm font-medium text-t1">{likely ? "CAD likely" : "CAD unlikely"}</span>
          </div>
        </div>
        <RiskTierChip tier={heart.risk_tier} />
      </div>
      <div className="num mt-1 text-xs text-t2">
        Expected stenotic vessels: <span className="text-t1">{(exp ?? 0).toFixed(1)} of 3</span> · Model reliability:{" "}
        <span className="text-t1">{heart.reliability}</span> (hold-out AUC {heart.holdout_auc.toFixed(2)})
      </div>
      <p className="mt-3 min-h-[66px] text-[15px] leading-relaxed text-t1" data-testid="summary-text">
        {p.summary_text}
      </p>
    </section>
  );
}
