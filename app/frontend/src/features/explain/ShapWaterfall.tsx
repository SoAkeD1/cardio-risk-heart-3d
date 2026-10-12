import { ArrowDown, ArrowUp } from "lucide-react";
import type { Contribution, FeatureSpec } from "../../api/types";
import { byImpact, featureValue, pct, pts, shortLabel } from "../../lib/format";

/** Waterfall in probability points: base value -> top-k contributions (sorted by |SHAP|) -> final probability. */
export function ShapWaterfall({
  rows,
  prob,
  k,
  fx,
  raises,
  lowers,
}: {
  rows: Contribution[];
  prob: number;
  k: number;
  fx: Record<string, FeatureSpec>;
  raises: string;
  lowers: string;
}) {
  const sorted = byImpact(rows);
  const total = sorted.reduce((a, r) => a + r.shap, 0);
  const base = prob - total;
  const shown = sorted.slice(0, k);
  const rest = sorted.slice(k);
  const restSum = rest.reduce((a, r) => a + r.shap, 0);
  const items = [
    ...shown.map((r) => ({
      key: r.feature,
      label: `${shortLabel(fx[r.feature]?.label ?? r.label)} = ${featureValue(r.value, fx[r.feature])}`,
      shap: r.shap,
    })),
  ];
  if (rest.length) items.push({ key: "__rest", label: `${rest.length} other features`, shap: restSum });

  // cumulative positions on a 0..1 probability axis
  let acc = base;
  const segs = items.map((it) => {
    const a = acc;
    acc += it.shap;
    return { ...it, from: Math.min(a, acc), to: Math.max(a, acc) };
  });
  const lo = Math.max(0, Math.min(base, prob, ...segs.map((s) => s.from)) - 0.02);
  const hi = Math.min(1, Math.max(base, prob, ...segs.map((s) => s.to)) + 0.02);
  const x = (p: number) => `${((p - lo) / (hi - lo || 1)) * 100}%`;
  const w = (a: number, b: number) => `max(2px, ${((b - a) / (hi - lo || 1)) * 100}%)`;

  return (
    <div role="table" aria-label="Feature contributions (SHAP)" className="text-xs">
      <Row label="Base value (average patient)" value={pct(base)}>
        <span className="absolute inset-y-1 w-0.5 bg-[rgb(var(--text-3))]" style={{ left: x(base) }} />
      </Row>
      {segs.map((s) => (
        <Row
          key={s.key}
          label={s.label}
          value={pts(s.shap)}
          icon={
            s.shap > 0 ? (
              <ArrowUp aria-label="raises" className="h-3.5 w-3.5 shrink-0" style={{ color: raises }} />
            ) : (
              <ArrowDown aria-label="lowers" className="h-3.5 w-3.5 shrink-0" style={{ color: lowers }} />
            )
          }
          muted={s.key === "__rest"}
        >
          <span
            className="absolute inset-y-1.5 rounded-sm"
            style={{ left: x(s.from), width: w(s.from, s.to), background: s.shap > 0 ? raises : lowers, opacity: s.key === "__rest" ? 0.45 : 0.9 }}
          />
        </Row>
      ))}
      <Row label="This patient" value={pct(prob)} strong>
        <span className="absolute inset-y-1 w-0.5 bg-[rgb(var(--text-1))]" style={{ left: x(prob) }} />
      </Row>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  children,
  muted,
  strong,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div role="row" className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_46px] items-center gap-2 py-[3px]">
      <div role="cell" className={`flex min-w-0 items-center gap-1 ${muted ? "text-t3" : "text-t1"} ${strong ? "font-semibold" : ""}`}>
        {icon}
        <span className="truncate" title={label}>
          {label}
        </span>
      </div>
      <div role="cell" className="relative h-5 rounded-sm bg-s2">
        {children}
      </div>
      <div role="cell" className={`num text-right ${strong ? "font-semibold text-t1" : "text-t2"}`}>
        {value}
      </div>
    </div>
  );
}
