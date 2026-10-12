import { useSensitivity } from "../../api/hooks";
import { num } from "../../lib/format";
import { Skeleton } from "../../ui/Skeleton";

// Target lines are distinguished by dash pattern + direct labels (not by colour alone); neutral greys.
const LINES = [
  { key: "cad", label: "CAD", dash: "", w: 2.4 },
  { key: "lad", label: "LAD", dash: "6 3", w: 1.6 },
  { key: "lcx", label: "LCX", dash: "2 3", w: 1.6 },
  { key: "rca", label: "RCA", dash: "8 3 2 3", w: 1.6 },
] as const;

/** Probability of each target as the focused feature sweeps its training range (other inputs fixed). */
export function SensitivityChart({ feature, current }: { feature: string; current?: number }) {
  const { data, isFetching, isError } = useSensitivity(feature, true);
  if (isError) return <p className="text-xs text-warn">Sensitivity curve unavailable.</p>;
  if (!data) return <Skeleton className="h-[172px]" />;
  const W = 320, H = 150, L = 34, R = 34, T = 8, B = 22;
  const xs = data.points.map((p) => p.value);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (p: number) => T + (1 - p) * (H - T - B);
  const cur = current ?? data.current_value;
  // end-of-line labels, pushed apart so they never overlap (>= 10 px)
  const last = data.points[data.points.length - 1]!;
  const order = [...LINES].sort((a, b) => Y(last[a.key]) - Y(last[b.key]));
  const labelY: Record<string, number> = {};
  let prev = -Infinity;
  for (const l of order) {
    const y = Math.max(Y(last[l.key]) + 3, prev + 10);
    labelY[l.key] = y;
    prev = y;
  }
  const overflow = prev - (H - B + 3);
  if (overflow > 0) for (const k of Object.keys(labelY)) labelY[k] = labelY[k]! - overflow;
  return (
    <figure className="relative" aria-busy={isFetching}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Sensitivity of each estimate to ${data.label}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={Y(p)} y2={Y(p)} stroke="var(--border)" />
            <text x={L - 4} y={Y(p) + 3} fontSize="9" textAnchor="end" fill="rgb(var(--text-3))">
              {p * 100}%
            </text>
          </g>
        ))}
        {LINES.map((l) => {
          const d = data.points.map((p, i) => `${i ? "L" : "M"}${X(p.value).toFixed(1)},${Y(p[l.key]).toFixed(1)}`).join(" ");
          return (
            <g key={l.key}>
              <path d={d} fill="none" stroke="rgb(var(--text-1))" strokeOpacity={l.key === "cad" ? 0.95 : 0.6} strokeWidth={l.w} strokeDasharray={l.dash} />
              <text x={W - R + 3} y={labelY[l.key]} fontSize="9" fill="rgb(var(--text-2))">
                {l.label}
              </text>
            </g>
          );
        })}
        <line x1={X(cur)} x2={X(cur)} y1={T} y2={H - B} stroke="rgb(var(--accent))" strokeWidth="1.5" />
        <text x={X(cur)} y={H - 6} fontSize="9" textAnchor="middle" fill="rgb(var(--accent))">
          {num(cur, 0.1)}
        </text>
        <text x={L} y={H - 6} fontSize="9" fill="rgb(var(--text-3))">
          {num(x0, 0.1)}
        </text>
        <text x={W - R} y={H - 6} fontSize="9" textAnchor="end" fill="rgb(var(--text-3))">
          {num(x1, 0.1)} {data.unit}
        </text>
      </svg>
      <figcaption className="text-[11px] text-t3">
        {data.label}: estimate across the training range, all other inputs unchanged. Marker = current what-if value.
      </figcaption>
    </figure>
  );
}
