import { ChevronsDown, ChevronsUp, Minus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnatomyMap } from "../../api/hooks";
import { gradientCss, inkOn } from "../../lib/color";
import { prefersReducedMotion } from "../../lib/device";
import { pct } from "../../lib/format";

/** Count-up (300 ms) between successive values; instant with reduced motion. */
export function useCountUp(target: number | undefined, ms = 300): number | undefined {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target === undefined) return;
    if (from.current === undefined || prefersReducedMotion()) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return v;
}

/** Track = the shared colour scale; marker at the probability; tick at the threshold. */
export function ProbabilityBar({ prob, threshold, label }: { prob: number; threshold: number; label: string }) {
  const { data: map } = useAnatomyMap();
  const stops = map?.style.color_scale.stops.map(([p, color]) => ({ p, color })) ?? [];
  return (
    <div className="relative mt-2" role="img" aria-label={`${label}: ${pct(prob)}, decision threshold ${pct(threshold)}`}>
      <div className="h-2 rounded-full opacity-90" style={{ background: stops.length ? gradientCss(stops) : "rgb(var(--surface-3))" }} />
      <span
        aria-hidden
        className="absolute -top-1 h-4 w-0.5 rounded bg-[rgb(var(--text-1))] opacity-70"
        style={{ left: `calc(${threshold * 100}% - 1px)` }}
        title={`Decision threshold ${pct(threshold)}`}
      />
      <span
        aria-hidden
        className="absolute -top-[5px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-[rgb(var(--surface-1))] shadow-soft transition-[left] duration-300 ease-out"
        style={{ left: `${prob * 100}%`, background: "rgb(var(--text-1))" }}
      />
    </div>
  );
}

const TIER_ICON = { Low: ChevronsDown, Moderate: Minus, High: ChevronsUp } as const;

/** Tier chip: icon + text + tier tint from anatomy_map.style.heart_tiers. */
export function RiskTierChip({ tier }: { tier: "Low" | "Moderate" | "High" }) {
  const { data: map } = useAnatomyMap();
  const bg = map?.style.heart_tiers[tier]?.color;
  if (!bg) return null;
  const Icon = TIER_ICON[tier];
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold"
      style={{ background: bg, color: inkOn(bg) }}
      data-testid="tier-chip"
    >
      <Icon aria-hidden className="h-4 w-4" />
      {tier} risk tier
    </span>
  );
}

export function SectionHeader({ id, title, aside }: { id?: string; title: string; aside?: React.ReactNode }) {
  return (
    <div id={id} className="sticky top-0 z-[3] flex h-10 items-center justify-between border-b border-line bg-s1/95 px-4 backdrop-blur">
      <h3 className="section-title">{title}</h3>
      {aside}
    </div>
  );
}
