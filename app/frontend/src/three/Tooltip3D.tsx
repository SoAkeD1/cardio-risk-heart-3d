import { ArrowDown, ArrowUp, Flag } from "lucide-react";
import { useAnatomyMap } from "../api/hooks";
import type { Vessel } from "../api/types";
import { pct } from "../lib/format";
import { useStore } from "../state/store";
import { useHoverTip } from "./registry";

const NEUTRAL_NAMES: Record<string, string> = { lm: "Left main (LM)", branches: "Coronary branches", aorta: "Aorta" };

/** Pointer-anchored tooltip; content from scene_state + anatomy_map (no hardcoded clinical text beyond labels). */
export function Tooltip3D() {
  const tip = useHoverTip((s) => s.tip);
  const scene = useStore((s) => s.prediction?.scene);
  const { data: map } = useAnatomyMap();
  if (!tip) return null;
  let body: JSX.Element | null = null;
  if (tip.key === "lad" || tip.key === "lcx" || tip.key === "rca") {
    const v = scene?.vessels[tip.key as Vessel];
    const name = v?.display_name ?? map?.vessels.find((x) => x.key === tip.key)?.display_name ?? tip.key.toUpperCase();
    body = (
      <>
        <div className="font-semibold text-t1">{name}</div>
        {v ? (
          <>
            <div className="num mt-1 text-t1">
              Stenosis probability {pct(v.prob)} · threshold {pct(v.threshold)}
            </div>
            {v.flagged && (
              <div className="mt-1 inline-flex items-center gap-1 font-medium text-t1">
                <Flag aria-hidden className="h-3.5 w-3.5" /> {v.badge}
              </div>
            )}
            <div className="mt-1 text-t2">
              Reliability: {v.reliability} (hold-out AUC {v.holdout_auc.toFixed(2)})
            </div>
            <div className="mt-1 text-t3">Whole-vessel estimate — dataset has no lesion location</div>
          </>
        ) : (
          <div className="mt-1 text-t2">Load a patient to see this artery&rsquo;s risk.</div>
        )}
      </>
    );
  } else if (tip.key in NEUTRAL_NAMES) {
    const ns = map?.neutral_structures.find((n) => n.mesh_names.includes(tip.mesh));
    body = (
      <>
        <div className="font-semibold text-t1">{NEUTRAL_NAMES[tip.key]}</div>
        <div className="mt-1 text-t2">{tip.key === "aorta" ? ns?.tooltip : "Not modelled — no label in dataset"}</div>
      </>
    );
  } else if (tip.key === "myocardium") {
    const h = scene?.heart;
    body = (
      <>
        <div className="font-semibold text-t1">Heart</div>
        {h ? (
          <div className="num mt-1 text-t2">
            CAD {pct(h.cad_prob)} · {h.risk_tier} tier · {h.label === "CAD" ? "CAD likely" : "CAD unlikely"}
            <br />
            Expected stenotic vessels: {h.expected_stenotic_vessels.toFixed(1)} of 3
          </div>
        ) : (
          <div className="mt-1 text-t2">Load a sample patient to see the CAD estimate.</div>
        )}
      </>
    );
  } else {
    const r = scene?.regions.find((x) => x.mesh_names.includes(tip.mesh));
    const reg = map?.body_regions.find((x) => x.mesh_names.includes(tip.mesh));
    body = (
      <>
        <div className="flex items-center gap-1 font-semibold text-t1">
          {r && (r.direction === "raises" ? <ArrowUp aria-hidden className="h-3.5 w-3.5" /> : <ArrowDown aria-hidden className="h-3.5 w-3.5" />)}
          {r?.display_name ?? reg?.display_name ?? tip.mesh.replace("Organ_", "")}
        </div>
        <div className="mt-1 text-t2">{r ? r.tooltip : "Not among the top contributing regions for this estimate."}</div>
      </>
    );
  }
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 max-w-[300px] rounded-md border border-line bg-s1/95 px-3 py-2 text-xs leading-snug shadow-soft backdrop-blur"
      style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320), top: tip.y + 14 }}
    >
      {body}
    </div>
  );
}
