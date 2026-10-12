import { useSensitivity, useTargets } from "../../api/hooks";
import { num } from "../../lib/format";
import { Skeleton } from "../../ui/Skeleton";

// Target lines are distinguished by dash pattern + direct labels (not by colour alone); neutral greys.
// line styles by target ORDER (model-card order: overall estimate first, drawn heavier)
const STYLES = [
  { dash: "", w: 2.4, o: 0.95 },
  { dash: "6 3", w: 1.6, o: 0.6 },
  { dash: "2 3", w: 1.6, o: 0.6 },
  { dash: "8 3 2 3", w: 1.6, o: 0.6 },
];

/** Probability of each target as the focused feature sweeps its training range (other inputs fixed). */
export function SensitivityChart({ feature, current }: { feature: string; current?: number }) {
  const { data, isFetching, isError } = useSensitivity(feature, true);
  const LINES = useTargets().map((t, i) => ({ key: t.key, label: t.label, ...STYLES[i % STYLES.length]! }));
  if (isError) return <p className="text-xs text-warn">Sensitivity curve unavailable.</p>;
  if (!data) return <Skeleton className="h-[172px]" />;
  const W = 320,
    H = 150,
    L = 34,
    R = 12,
    T = 8,
    B = 22;
  const xs = data.points.map((p) => p.value);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs);
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (p: number) => T + (1 - p) * (H - T - B);
  const cur = current ?? data.current_value;
  return (
    <figure className="relative" aria-busy={isFetching}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Sensitivity of each estimate to ${data.label}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={Y(p)} y2={Y(p)} stroke="var(--border)" />
            <text x={L - 4} y={Y(p) + 3} fontSize="9" textAnchor="end" fill="rgb(var(--text-3))">
              {p * 100}%
            </text>
          </g>
        ))}
        {LINES.map((l) => {
          const d = data.points
            .map((p, i) => `${i ? "L" : "M"}${X(p.value).toFixed(1)},${Y(p[l.key]).toFixed(1)}`)
            .join(" ");
          return (
            <g key={l.key}>
              <path
                d={d}
                fill="none"
                stroke="rgb(var(--text-1))"
                strokeOpacity={l.o}
                strokeWidth={l.w}
                strokeDasharray={l.dash}
              />
            </g>
          );
        })}
        <line x1={X(cur)} x2={X(cur)} y1={T} y2={H - B} stroke="rgb(var(--accent))" strokeWidth="1.5" />
        <text x={X(cur)} y={H - 6} fontSize="9" textAnchor="middle" fill="rgb(var(--accent))">
          {num(cur, 0.1)}
        </text>
        {Math.abs(X(cur) - L) > 26 && (
          <text x={L} y={H - 6} fontSize="9" fill="rgb(var(--text-3))">
            {num(x0, 0.1)}
          </text>
        )}
        {Math.abs(X(cur) - (W - R)) > 48 && (
          <text x={W - R} y={H - 6} fontSize="9" textAnchor="end" fill="rgb(var(--text-3))">
            {num(x1, 0.1)} {data.unit}
          </text>
        )}
      </svg>
      <ul
        className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-t2"
        aria-label="Line key"
        data-testid="sens-legend"
      >
        {LINES.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line
                x1="0"
                x2="22"
                y1="3"
                y2="3"
                stroke="rgb(var(--text-1))"
                strokeOpacity={l.o}
                strokeWidth={l.w}
                strokeDasharray={l.dash}
              />
            </svg>
            {l.label}
          </li>
        ))}
      </ul>
      <figcaption className="mt-1 text-[11px] text-t3">
        {data.label}{data.unit ? ` (${data.unit})` : ""}: estimate across the training range, all other inputs unchanged. Marker = current what-if value.
      </figcaption>
    </figure>
  );
}
