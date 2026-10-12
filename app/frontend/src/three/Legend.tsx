import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useAnatomyMap, useModelCard } from "../api/hooks";
import { VESSELS } from "../api/types";
import { gradientCss, type Stop } from "../lib/color";
import { pct } from "../lib/format";
import { useStore } from "../state/store";

/** Colour scale (CIELAB, from anatomy_map), threshold ticks (from the API), meaning + neutral swatch. */
export function Legend({ compact = false }: { compact?: boolean }) {
  const { data: map } = useAnatomyMap();
  const { data: card } = useModelCard();
  const scene = useStore((s) => s.prediction?.scene);
  const pref = useStore((s) => s.ui.legendOpen);
  const [compactOpen, setCompactOpen] = useState(false);
  const open = compact ? compactOpen : pref;
  const setUi = useStore((s) => s.setUi);
  if (!map) return null;
  const stops: Stop[] = scene?.legend.stops ?? map.style.color_scale.stops.map(([p, color]) => ({ p, color }));
  const thr: Record<string, number> =
    scene?.legend.threshold_markers ??
    Object.fromEntries((card?.targets ?? []).filter((t) => t.key !== "cad").map((t) => [t.key, t.threshold]));
  const neutral = map.neutral_structures.find((n) => n.mesh_names.includes("Coronary_LM"))?.color ?? "#C9C2B8";
  return (
    <div
      data-testid="legend"
      className={`pointer-events-auto absolute bottom-3 left-3 z-10 rounded-md border border-line bg-s1/90 text-xs text-t2 shadow-soft backdrop-blur ${
        open ? "z-20 w-[min(320px,calc(100%-24px))] p-3" : compact ? "w-auto px-2.5 py-2" : "w-[min(320px,calc(100%-24px))] p-3"
      }`}
    >
      <button
        className="flex w-full items-center justify-between gap-2 text-left font-semibold text-t1"
        aria-expanded={open}
        onClick={() => (compact ? setCompactOpen(!open) : setUi({ legendOpen: !open }))}
      >
        {compact && !open ? "Colour key" : "Artery colour = stenosis risk"}
        {open ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronUp aria-hidden className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div className="relative mt-2 h-3 rounded-sm" style={{ background: gradientCss(stops) }} aria-hidden />
          <div className="relative h-11" aria-label="Decision thresholds">
            {VESSELS.filter((v) => thr[v] !== undefined)
              .sort((a, b) => thr[a]! - thr[b]!)
              .map((v, i) => (
                <span
                  key={v}
                  className="num absolute flex -translate-x-px items-start gap-1 whitespace-nowrap text-[11px] leading-none text-t1"
                  style={{ left: `${thr[v]! * 100}%`, top: 0 }}
                >
                  <span className="block w-px bg-[rgb(var(--text-1)/0.8)]" style={{ height: 6 + i * 12 }} />
                  <span style={{ marginTop: i * 12 }}>
                    {v.toUpperCase()} {pct(thr[v])}
                  </span>
                </span>
              ))}
          </div>
          <div className="num flex justify-between text-[11px] text-t3">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <p className="mt-2 leading-snug">
            Colour = calibrated probability of ≥50% stenosis · Outline = above decision threshold
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-3 w-5 rounded-sm border border-line" style={{ background: neutral }} aria-hidden />
            Not modelled (left main, branches)
          </div>
        </>
      )}
    </div>
  );
}
