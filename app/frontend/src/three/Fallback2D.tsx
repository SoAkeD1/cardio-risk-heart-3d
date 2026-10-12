import { useNames } from "../lib/anatomy";
import { pct } from "../lib/format";
import { useStore } from "../state/store";

/** No-WebGL fallback: the coronary schematic from anatomy_map.viewer.schematic_2d, coloured by the API scene
 * (unmodelled vessels neutral). */
export function Fallback2D() {
  const N = useNames((s) => s.names);
  const scene = useStore((s) => s.prediction?.scene);
  const select = useStore((s) => s.select);
  const sel = useStore((s) => s.selection.target);
  if (!N) return <div className="canvas-bg h-full w-full" data-testid="fallback-2d" />;
  const sch = N.map.viewer.schematic_2d;
  const outline = N.map.style.vessel.outline_color;
  const neutralOf = (k: string) => N.neutral.find((n) => n.key === k);
  const vesselKeys = new Set<string>(N.vesselKeys);
  const colour = (k: string) => (vesselKeys.has(k) ? scene?.vessels[k]?.color : neutralOf(k)?.color) ?? N.unmodelledCoronary[0]?.color ?? "transparent";
  // neutral first, vessels on top
  const order = Object.keys(sch.paths).sort((a, b) => Number(vesselKeys.has(a)) - Number(vesselKeys.has(b)));
  return (
    <div className="canvas-bg flex h-full w-full items-center justify-center p-4" data-testid="fallback-2d">
      <svg viewBox={sch.view_box.join(" ")} role="img" aria-label="2D coronary diagram coloured by predicted stenosis risk" className="h-full max-h-[560px] w-full max-w-[640px]">
        <path d={sch.heart_outline} fill="rgb(var(--text-1) / 0.08)" stroke="rgb(var(--text-1) / 0.25)" strokeWidth="2" />
        <path d={sch.aorta} fill="none" stroke="rgb(var(--text-1) / 0.35)" strokeWidth="14" strokeLinecap="round" />
        {order.map((k) => {
          const isV = vesselKeys.has(k);
          const flagged = isV && scene?.vessels[k]?.flagged;
          return (
            <g key={k}>
              {flagged && <path d={sch.paths[k]} fill="none" stroke={outline} strokeWidth={13} strokeLinecap="round" opacity={0.9} />}
              <path
                d={sch.paths[k]}
                fill="none"
                stroke={colour(k)}
                strokeWidth={isV ? 8 : 4}
                strokeLinecap="round"
                onClick={isV ? () => select(sel === k ? undefined : (k as never)) : undefined}
                style={{ cursor: isV ? "pointer" : "default" }}
              />
            </g>
          );
        })}
        {N.vessels.map((v) => {
          const l = sch.labels[v.key];
          if (!l) return null;
          return (
            <text key={v.key} x={l[0]} y={l[1]} fill="rgb(var(--text-1))" fontSize="13" fontWeight={sel === v.key ? 700 : 500} textAnchor={l[2]}>
              {v.short} {scene ? pct(scene.vessels[v.key]!.prob) : ""}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
