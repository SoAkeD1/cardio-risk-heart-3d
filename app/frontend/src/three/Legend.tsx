import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { layoutTicks, type Tick } from "../lib/tickLayout";
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
        open
          ? "z-20 w-[min(320px,calc(100%-24px))] p-3"
          : compact
            ? "w-auto px-2.5 py-2"
            : "w-[min(320px,calc(100%-24px))] p-3"
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
          <ThresholdTicks
            ticks={VESSELS.filter((v) => thr[v] !== undefined).map((v) => ({
              key: v,
              label: `${v.toUpperCase()} ${pct(thr[v])}`,
              p: thr[v]!,
            }))}
          />
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

const ROW_H = 13;

/** Threshold ticks under the scale; close ticks stack their labels with elbow leader lines (no overlap). */
export function ThresholdTicks({ ticks }: { ticks: Tick[] }) {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.current.observe(el);
  }, []);
  const { placed, rows } = w ? layoutTicks(ticks, w) : { placed: [], rows: ticks.length };
  const h = 8 + rows * ROW_H;
  return (
    <div
      ref={ref}
      className="relative"
      style={{ height: h }}
      role="list"
      aria-label="Decision thresholds"
      data-testid="legend-ticks"
    >
      <svg width="100%" height={h} className="absolute inset-0 overflow-visible" aria-hidden>
        {placed.map((t) => {
          const y = 6 + t.row * ROW_H + 4;
          const elbow = t.align === "left" ? t.textX - 2 : t.textX + 2;
          return (
            <g key={t.key} stroke="rgb(var(--text-1))" strokeOpacity={0.75} strokeWidth={1} fill="none">
              <path d={`M${t.x + 0.5},-3 V${y} H${elbow}`} />
            </g>
          );
        })}
      </svg>
      {placed.map((t) => (
        <span
          key={t.key}
          role="listitem"
          data-tick={t.key}
          className="num absolute whitespace-nowrap text-[11px] leading-none text-t1"
          style={{
            top: 6 + t.row * ROW_H - 1,
            ...(t.align === "left" ? { left: t.textX } : { right: w - t.textX }),
          }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
