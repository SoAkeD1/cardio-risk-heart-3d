import { Html } from "@react-three/drei";
import { ArrowDown, ArrowUp, Droplet } from "lucide-react";
import { useStore } from "../state/store";
import { worldPos } from "./geom";

/** Body mode: floating ↑/↓ chips at the top-3 contributing regions' anchors (+ the "Blood tests" HUD chip). */
export function RegionChips() {
  const mode = useStore((s) => s.view.mode);
  const regions = useStore((s) => s.prediction?.scene.regions);
  if (mode !== "body" || !regions) return null;
  return (
    <>
      {regions.map((r) => {
        const p = worldPos(r.camera_anchor);
        if (!p) return null;
        const blood = r.camera_anchor === "Anchor_Blood";
        return (
          <Html key={r.region} position={p} center zIndexRange={[15, 10]} style={{ pointerEvents: "none" }}>
            <div
              className="flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-soft"
              style={{ background: "rgba(22,24,27,0.88)", borderColor: r.color, color: "#F2F0ED" }}
            >
              {blood && <Droplet aria-hidden className="h-3 w-3" />}
              {r.direction === "raises" ? (
                <ArrowUp aria-hidden className="h-3 w-3" style={{ color: r.color }} />
              ) : (
                <ArrowDown aria-hidden className="h-3 w-3" style={{ color: r.color }} />
              )}
              {blood ? "Blood tests" : r.display_name}
              <span className="sr-only">{r.direction} risk</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
