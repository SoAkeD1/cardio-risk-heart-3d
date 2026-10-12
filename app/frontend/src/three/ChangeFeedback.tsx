// Visible, honest feedback for every input change (all numbers from the API responses, all names from the schema
// and anatomy_map):
//  * change toast (top-centre, 2.5 s): "<label> → <value>: CAD +3 pts · LAD +5 · …" or "little effect …"
//  * tier-change chip when the CAD risk tier changes
//  * body-region link: the changed feature's region from anatomy_map.body_regions (direction from the API)
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnatomyMap, useFeatureIndex, useTargets } from "../api/hooks";
import { regionsOfFeature } from "../lib/anatomy";
import { featureValue } from "../lib/format";
import { prefersReducedMotion } from "../lib/device";
import { useStore, type ChangeEvent } from "../state/store";

export const TOAST_MS = 2500;
export const LITTLE_EFFECT_PTS = 0.5;

/** "+3", "−5", "<1", "0": magnitude in probability points (the arrow carries the direction). */
const fmtPts = (d: number) => {
  const v = d * 100;
  if (v === 0) return "0";
  if (Math.abs(v) < 0.5) return "<1";
  return `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v))}`;
};
const unit = (d: number) => (Math.round(Math.abs(d * 100)) > 1 ? " pts" : " pt");

export function useActiveChange(ms: number): ChangeEvent | undefined {
  const ev = useStore((s) => s.changeEvent);
  const [active, setActive] = useState<ChangeEvent | undefined>();
  useEffect(() => {
    if (!ev) return;
    setActive(ev);
    const t = setTimeout(() => setActive(undefined), ms);
    return () => clearTimeout(t);
  }, [ev, ms]);
  return active;
}

/** Region chip data for a change: map lookup (feature -> body region) + API direction. */
export function regionLinks(ev: ChangeEvent) {
  const st = useStore.getState();
  const scene = st.prediction?.scene;
  const contrib = st.prediction?.contributions[st.explainTarget] ?? st.prediction?.contributions.cad ?? [];
  const out: { region: string; display: string; direction: "raises" | "lowers" | "neutral"; meshes: string[] }[] = [];
  for (const f of ev.features)
    for (const r of regionsOfFeature(f.name)) {
      if (out.some((o) => o.region === r.region)) continue;
      const api = scene?.regions.find((x) => x.region === r.region);
      const c = contrib.find((x) => x.feature === f.name);
      const direction = api?.direction ?? (c ? (c.shap > 0 ? "raises" : c.shap < 0 ? "lowers" : "neutral") : "neutral");
      out.push({ region: r.region, display: r.display_name, direction, meshes: r.mesh_names });
    }
  return out;
}

export function ChangeFeedback() {
  const ev = useActiveChange(TOAST_MS);
  const fx = useFeatureIndex();
  const targets = useTargets();
  const { data: map } = useAnatomyMap();
  const mode = useStore((s) => s.view.mode);
  if (!ev || !map) return null;
  const f = ev.features[0]!;
  const spec = fx[f.name];
  const label = spec?.label ?? f.name;
  const more = ev.features.length > 1 ? ` (+${ev.features.length - 1} derived)` : "";
  const little = targets.every((t) => Math.abs(ev.deltas[t.key] ?? 0) * 100 < LITTLE_EFFECT_PTS);
  const tierChanged = ev.tierFrom && ev.tierTo && ev.tierFrom !== ev.tierTo;
  const regions = regionLinks(ev);
  const raise = map.style.regions.raises_color;
  const lower = map.style.regions.lowers_color;
  const anim = prefersReducedMotion() ? "" : "animate-[toastIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]";
  const regionTip = (display: string, dir: string) =>
    map.region_tooltip
      .replace("{display_name}", display)
      .replace("{target}", targets.find((t) => t.key === useStore.getState().explainTarget)?.label ?? "")
      .replace("{direction}", `${dir} risk`)
      .replace("{features}", label);
  return (
    <div className="pointer-events-none absolute left-1/2 top-[60px] z-20 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 flex-col items-center gap-1.5" aria-live="polite">
      <div key={ev.id} data-testid="change-toast" className={`pointer-events-auto rounded-lg border border-line bg-s1/95 px-3.5 py-2 text-[13px] text-t1 shadow-soft backdrop-blur ${anim}`}>
        <span className="font-semibold">
          {label} → {featureValue(f.new, spec)}
          {more}
        </span>
        <span className="text-t2">: </span>
        {little ? (
          <span className="text-t2" data-testid="toast-little">
            little effect on this model&rsquo;s estimate (see Model card → feature effects).
          </span>
        ) : (
          <span className="num">
            {targets.map((t, i) => {
              const d = ev.deltas[t.key] ?? 0;
              return (
                <span key={t.key} data-delta={t.key} data-value={d}>
                  {i > 0 && <span className="text-t3"> · </span>}
                  {t.label}{" "}
                  {d > 0.0005 ? (
                    <ArrowUp aria-label="up" className="inline h-3 w-3" style={{ color: raise }} />
                  ) : d < -0.0005 ? (
                    <ArrowDown aria-label="down" className="inline h-3 w-3" style={{ color: lower }} />
                  ) : (
                    <Minus aria-label="no change" className="inline h-3 w-3 text-t3" />
                  )}
                  {fmtPts(d)}
                  {i === 0 ? unit(d) : ""}
                </span>
              );
            })}
          </span>
        )}
      </div>
      {tierChanged && (
        <div data-testid="tier-chip" className={`rounded-full border border-line bg-s1/95 px-3 py-1 text-xs font-semibold text-t1 shadow-soft ${anim}`}>
          Risk tier: {ev.tierFrom} → {ev.tierTo}
        </div>
      )}
      {mode === "heart" &&
        regions.map((r) => (
          <div
            key={r.region}
            data-testid={`region-chip-${r.region}`}
            title={regionTip(r.display, r.direction)}
            className={`pointer-events-auto flex items-center gap-1 rounded-full border bg-s1/95 px-2.5 py-1 text-xs text-t1 shadow-soft ${anim}`}
            style={{ borderColor: r.direction === "raises" ? raise : r.direction === "lowers" ? lower : undefined }}
          >
            {r.direction === "raises" ? (
              <ArrowUp aria-label="raises risk" className="h-3.5 w-3.5" style={{ color: raise }} />
            ) : r.direction === "lowers" ? (
              <ArrowDown aria-label="lowers risk" className="h-3.5 w-3.5" style={{ color: lower }} />
            ) : null}
            <span>
              <span className="font-semibold">{r.display}</span>
              <span className="text-t2">: contributing risk factor (not the location of disease)</span>
            </span>
          </div>
        ))}
    </div>
  );
}
