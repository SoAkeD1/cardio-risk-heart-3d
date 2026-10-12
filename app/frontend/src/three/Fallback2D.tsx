import { useAnatomyMap } from "../api/hooks";
import type { Vessel } from "../api/types";
import { pct } from "../lib/format";
import { useStore } from "../state/store";

// Schematic anterior view of the coronary tree, drawn in code. Vessel names come from anatomy_map,
// colours from the API scene (neutral before a prediction). LM / branches always neutral.
const PATHS: Record<Vessel | "lm" | "branches", string> = {
  lm: "M200 92 C 206 100, 214 104, 226 108",
  lad: "M226 108 C 236 150, 246 210, 250 270 C 252 300, 246 322, 236 336",
  lcx: "M226 108 C 258 104, 292 112, 312 136 C 326 156, 330 186, 324 212",
  rca: "M184 98 C 158 110, 130 140, 124 178 C 120 214, 138 252, 170 280 C 186 292, 204 300, 218 302",
  branches: "M240 170 C 262 186, 276 204, 284 226 M246 222 C 262 238, 270 256, 274 274 M296 128 C 304 150, 304 172, 298 192 M136 210 C 152 224, 168 236, 184 242",
};

export function Fallback2D() {
  const { data: map } = useAnatomyMap();
  const scene = useStore((s) => s.prediction?.scene);
  const select = useStore((s) => s.select);
  const sel = useStore((s) => s.selection.target);
  const neutral = map?.neutral_structures.find((n) => n.mesh_names.includes("Coronary_LM"))?.color ?? "#C9C2B8";
  const color = (k: string) => (k === "lm" || k === "branches" ? neutral : scene?.vessels[k]?.color ?? neutral);
  const label = (v: Vessel) => map?.vessels.find((x) => x.key === v)?.display_name ?? v.toUpperCase();
  const pos: Record<Vessel, [number, number]> = { lad: [256, 250], lcx: [334, 170], rca: [70, 196] };
  return (
    <div className="canvas-bg flex h-full w-full items-center justify-center p-4" data-testid="fallback-2d">
      <svg viewBox="0 0 440 380" role="img" aria-label="2D coronary diagram coloured by predicted stenosis risk" className="h-full max-h-[560px] w-full max-w-[640px]">
        <path d="M220 66 C 150 60, 96 120, 100 196 C 104 270, 170 336, 236 352 C 300 336, 350 270, 352 196 C 354 120, 290 62, 220 66 Z" fill="rgba(226,184,168,0.18)" stroke="rgba(242,240,237,0.25)" strokeWidth="2" />
        <path d="M188 70 C 186 40, 214 26, 240 34 C 262 40, 266 60, 262 74" fill="none" stroke="rgba(242,240,237,0.35)" strokeWidth="14" strokeLinecap="round" />
        {(["branches", "lm", "rca", "lcx", "lad"] as const).map((k) => {
          const isV = k === "lad" || k === "lcx" || k === "rca";
          const flagged = isV && scene?.vessels[k]?.flagged;
          return (
            <g key={k}>
              {flagged && <path d={PATHS[k]} fill="none" stroke="#FFFFFF" strokeWidth={13} strokeLinecap="round" opacity={0.9} />}
              <path
                d={PATHS[k]}
                fill="none"
                stroke={color(k)}
                strokeWidth={isV ? 8 : 4}
                strokeLinecap="round"
                onClick={isV ? () => select(sel === k ? undefined : (k as Vessel)) : undefined}
                style={{ cursor: isV ? "pointer" : "default" }}
              />
            </g>
          );
        })}
        {(["lad", "lcx", "rca"] as Vessel[]).map((v) => (
          <text key={v} x={pos[v][0]} y={pos[v][1]} fill="rgb(var(--text-1))" fontSize="13" fontWeight={sel === v ? 700 : 500} textAnchor={v === "rca" ? "end" : "start"}>
            {label(v).replace(/\s*\(.*\)/, "")} {scene ? pct(scene.vessels[v]!.prob) : ""}
          </text>
        ))}
      </svg>
    </div>
  );
}
