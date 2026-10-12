import { ArrowDown, ArrowUp, Flag, ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnatomyMap, useFeatureIndex } from "../../api/hooks";
import { VESSELS, type Vessel } from "../../api/types";
import { byImpact, featureValue, pct, pts, shortLabel } from "../../lib/format";
import { useStore } from "../../state/store";
import { Badge } from "../../ui/Badge";
import { cx } from "../../ui/cx";
import { ProbabilityBar } from "./parts";

const REL_ICON = { High: ShieldCheck, Moderate: ShieldHalf, Limited: ShieldAlert } as const;

export function VesselCard({ v }: { v: Vessel }) {
  const p = useStore((s) => s.prediction);
  const sel = useStore((s) => s.selection.target);
  const hover = useStore((s) => s.selection.hover);
  const { data: map } = useAnatomyMap();
  const fx = useFeatureIndex();
  const ref = useRef<HTMLButtonElement>(null);
  const [pulse, setPulse] = useState(false);
  const sv = p?.scene.vessels[v];
  const meta = map?.vessels.find((x) => x.key === v);
  const selected = sel === v;

  useEffect(() => {
    if (!selected) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(t);
  }, [selected]);

  if (!sv) return null;
  const drivers = byImpact(p!.prediction.explanations[v] ?? []).slice(0, 3);
  const rel = sv.reliability as keyof typeof REL_ICON;
  const RelIcon = REL_ICON[rel] ?? ShieldHalf;
  const toggle = () => {
    const st = useStore.getState();
    const next = selected ? undefined : v;
    st.select(next);
    if (next) st.requestFly({ anchor: sv.camera_anchor });
  };
  return (
    <button
      ref={ref}
      id={`vessel-card-${v}`}
      data-testid={`vessel-card-${v}`}
      aria-pressed={selected}
      onClick={toggle}
      onMouseEnter={() => useStore.getState().hover(v)}
      onMouseLeave={() => useStore.getState().hover(undefined)}
      onFocus={() => useStore.getState().hover(v)}
      onBlur={() => useStore.getState().hover(undefined)}
      className={cx(
        "block w-full rounded-md border bg-s2 p-3 text-left transition-[border-color,box-shadow,background] duration-200 ease-out hover:bg-s3",
        selected ? "border-[rgb(var(--accent))] shadow-[0_0_0_1px_rgb(var(--accent))]" : hover === v ? "border-[var(--border-strong)]" : "border-line",
        pulse && "ring-4 ring-[rgb(var(--accent)/0.25)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: sv.color }} aria-hidden />
            <span className="truncate text-sm font-semibold">{sv.display_name}</span>
          </div>
          <div className="mt-0.5 text-xs leading-snug text-t2">{meta?.short_description}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-xl font-semibold leading-none">{pct(sv.prob)}</div>
          <div className="num mt-1 text-[11px] text-t3">threshold {pct(sv.threshold)}</div>
        </div>
      </div>
      <ProbabilityBar prob={sv.prob} threshold={sv.threshold} label={`${v.toUpperCase()} stenosis probability`} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sv.flagged ? (
          <Badge icon={<Flag aria-hidden />} className="border-[var(--border-strong)] bg-s1">
            {sv.badge}
          </Badge>
        ) : (
          <Badge className="text-t2">Below threshold</Badge>
        )}
        <Badge icon={<RelIcon aria-hidden />} className={rel === "Limited" ? "text-warn" : "text-t2"}>
          Reliability: {rel}
        </Badge>
      </div>
      <ul className="mt-2.5 space-y-1" aria-label={`Top drivers for ${v.toUpperCase()}`}>
        {drivers.map((d) => (
          <li key={d.feature} className="flex items-center gap-1.5 text-xs">
            {d.shap > 0 ? (
              <ArrowUp aria-label="raises" className="h-3.5 w-3.5 shrink-0" style={{ color: map?.style.regions.raises_color }} />
            ) : (
              <ArrowDown aria-label="lowers" className="h-3.5 w-3.5 shrink-0" style={{ color: map?.style.regions.lowers_color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-t1">
              {shortLabel(fx[d.feature]?.label ?? d.label)} <span className="text-t2">({featureValue(d.value, fx[d.feature])})</span>
            </span>
            <span className="num shrink-0 text-t2">{pts(d.shap)}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function VesselCards() {
  return (
    <div className="space-y-2 px-4 py-3" data-testid="vessel-cards">
      {VESSELS.map((v) => (
        <VesselCard key={v} v={v} />
      ))}
      <p className="pt-1 text-xs text-t3">Whole-vessel estimates: the dataset records no lesion location within an artery.</p>
    </div>
  );
}
