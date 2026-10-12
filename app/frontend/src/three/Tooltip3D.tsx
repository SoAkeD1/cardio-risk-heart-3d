import { ArrowDown, ArrowUp, Flag } from "lucide-react";
import { useNames } from "../lib/anatomy";
import { pct } from "../lib/format";
import { useStore } from "../state/store";
import { useHoverTip } from "./registry";

/** Pointer-anchored tooltip. Every name and text comes from scene_state (API) or anatomy_map. */
export function Tooltip3D() {
  const tip = useHoverTip((s) => s.tip);
  const scene = useStore((s) => s.prediction?.scene);
  const N = useNames((s) => s.names);
  if (!tip || !N) return null;
  let body: JSX.Element | null = null;
  const vessel = N.vessels.find((v) => v.key === tip.key);
  if (vessel) {
    const v = scene?.vessels[vessel.key];
    body = (
      <>
        <div className="font-semibold text-t1">{v?.display_name ?? vessel.display}</div>
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
  } else if (tip.key.startsWith("neutral:")) {
    const ns = N.neutral.find((n) => `neutral:${n.key}` === tip.key);
    body = (
      <>
        <div className="font-semibold text-t1">{ns?.display_name}</div>
        <div className="mt-1 text-t2">{scene?.meshes[tip.mesh]?.tooltip ?? ns?.tooltip}</div>
      </>
    );
  } else if (tip.key === "heart") {
    const h = scene?.heart;
    body = (
      <>
        <div className="font-semibold text-t1">{N.map.heart.display_name}</div>
        {h ? (
          <div className="num mt-1 text-t2">
            CAD {pct(h.cad_prob)} · {h.risk_tier} tier · {h.cad_prob >= h.threshold ? "CAD likely" : "CAD unlikely"}
            <br />
            Expected stenotic vessels: {h.expected_stenotic_vessels.toFixed(1)} of {N.vessels.length}
          </div>
        ) : (
          <div className="mt-1 text-t2">Load a sample patient to see the CAD estimate.</div>
        )}
      </>
    );
  } else {
    const r = scene?.regions.find((x) => x.mesh_names.includes(tip.mesh));
    const region = N.regions.find((x) => x.mesh_names.includes(tip.mesh));
    body = (
      <>
        <div className="flex items-center gap-1 font-semibold text-t1">
          {r && (r.direction === "raises" ? <ArrowUp aria-hidden className="h-3.5 w-3.5" /> : <ArrowDown aria-hidden className="h-3.5 w-3.5" />)}
          {r?.display_name ?? region?.display_name ?? tip.mesh}
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
