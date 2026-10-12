import { ExternalLink } from "lucide-react";
import { useExamples, useModelCard } from "../../api/hooks";
import type { TargetCard } from "../../api/types";
import { Dialog } from "../../ui/Dialog";
import { Skeleton } from "../../ui/Skeleton";

const METRICS: [string, string][] = [
  ["accuracy", "Accuracy"],
  ["precision", "Precision"],
  ["recall", "Recall"],
  ["f1", "F1"],
  ["auc", "ROC-AUC"],
  ["pr_auc", "PR-AUC"],
  ["brier", "Brier"],
];

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 flex items-baseline gap-2 text-base font-semibold first:mt-0">
      <span className="num text-xs font-medium text-t3">{n}.</span>
      {children}
    </h3>
  );
}

function MetricsTable({ targets }: { targets: TargetCard[] }) {
  return (
    <div className="scroll-y overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[720px] text-xs" data-testid="metrics-table">
        <caption className="sr-only">Hold-out metrics with 95% bootstrap confidence intervals</caption>
        <thead className="bg-s2 text-left text-t2">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Target · model</th>
            {METRICS.map(([, l]) => (
              <th key={l} scope="col" className="px-2 py-2 text-right font-medium">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.key} className="border-t border-line align-top">
              <th scope="row" className="px-3 py-2 text-left font-medium text-t1">
                {t.label}
                <div className="font-normal text-t3">
                  {t.model}
                  {t.strategy ? ` · strategy ${t.strategy}` : ""}
                </div>
              </th>
              {METRICS.map(([k]) => {
                const m = t.holdout[k];
                return (
                  <td key={k} className="whitespace-nowrap px-2 py-2 text-right">
                    {m ? (
                      <>
                        <span className="text-t1">{m.value.toFixed(2)}</span>
                        <div className="text-[10px] text-t3">
                          [{m.ci_low.toFixed(2)}, {m.ci_high.toFixed(2)}]
                        </div>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModelCardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: c } = useModelCard();
  const { data: ex } = useExamples();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Model card" description="How the estimates were built, how well they perform, and their limits." wide>
      {!c ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="text-sm leading-relaxed text-t2" data-testid="model-card">
          <H n={1}>Dataset</H>
          <p>
            {c.dataset_citation} · n = {c.n_patients} patients, {c.single_centre ? "single centre" : "multi-centre"}.
          </p>

          <H n={2}>Validation</H>
          <p>
            Nested cross-validation ({String(c.validation.outer_cv)}, inner {String(c.validation.inner_cv)}) on 80% of the data and a
            stratified 20% hold-out (n = {c.n_holdout}) used once. Confidence intervals: {String(c.validation.bootstrap)} bootstrap resamples.
          </p>

          <H n={3}>Hold-out metrics [95% CI]</H>
          <MetricsTable targets={c.targets} />
          <p className="mt-2 text-xs">
            Nested-CV ROC-AUC (mean ± SD):{" "}
            {c.targets.map((t) => `${t.label} ${t.nested_cv.auc_mean?.toFixed(3) ?? "–"} ± ${t.nested_cv.auc_std?.toFixed(3) ?? "–"}`).join(" · ")}
          </p>

          <H n={4}>Thresholds and risk tiers</H>
          <ul className="list-inside list-disc space-y-1">
            {c.targets.map((t) => (
              <li key={t.key}>
                <span className="text-t1">{t.label}</span>: decision threshold {Math.round(t.threshold * 100)}% ({t.threshold_rule})
              </li>
            ))}
          </ul>
          <p className="mt-2">{String(c.risk_tiers.rule)}</p>

          <H n={5}>Calibration and ROC</H>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.figures.slice(0, 6).map((f) => (
              <figure key={f.path} className="overflow-hidden rounded-md border border-line bg-white">
                <img src={f.path} alt={f.title} loading="lazy" className="w-full" />
                <figcaption className="bg-s2 px-2 py-1 text-xs text-t2">{f.title}</figcaption>
              </figure>
            ))}
          </div>

          <H n={6}>Reliability badges</H>
          <p>
            Each estimate carries a badge from its hold-out ROC-AUC:{" "}
            {Object.entries(c.reliability_cutoffs)
              .map(([b, v]) => (v > 0 ? `${b} ≥ ${v.toFixed(2)}` : `${b} below that`))
              .join(", ")}
            . Current badges: {c.targets.map((t) => `${t.label} ${t.reliability_badge}`).join(" · ")}. &ldquo;Limited&rdquo; means: interpret with caution.
          </p>

          <H n={7}>Limitations</H>
          <ul className="list-inside list-disc space-y-1">
            {c.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>

          <H n={8}>Attributions</H>
          <ul className="space-y-1.5">
            {c.attributions.map((a) => (
              <li key={a.text}>
                <span className="text-t1">{a.what}:</span> {a.text}{" "}
                <span className="text-t3">({a.license})</span>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-info underline-offset-2 hover:underline">
                    link <ExternalLink aria-hidden className="ml-0.5 h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>

          {ex && (
            <>
              <H n={9}>Sample case outcomes (for evaluation transparency)</H>
              <p className="mb-2 text-xs">True catheterisation labels of the sample patients. They are never shown in the main view.</p>
              <table className="w-full text-xs">
                <thead className="text-left text-t2">
                  <tr>
                    <th scope="col" className="py-1 font-medium">Sample</th>
                    {c.targets.map(({ key: h, label }) => (
                      <th key={h} scope="col" className="py-1 text-center font-medium">
                        {label.replace(/\s*\([^)]*\)\s*$/, "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ex.examples.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="py-1.5 text-t1">
                        {e.title} <span className="text-t3">· {e.subtitle}</span>
                      </td>
                      {c.targets.map(({ key: k, positive_label, negative_label }) => (
                        <td key={k} className="py-1.5 text-center">
                          {e.true_labels[k] ? positive_label : negative_label}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="mt-6 rounded-md border border-line bg-s2 p-3 text-xs text-t1">{c.disclaimer}</p>
        </div>
      )}
    </Dialog>
  );
}
