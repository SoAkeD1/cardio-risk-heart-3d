// Screen-space overlays laid out WITHOUT collisions:
//  * body-mode region chips (top contributing regions): at each region's organ centre (whole body -> chest centre),
//    kept inside the projected body silhouette and never overlapping each other;
//  * vessel name tags (LAD / LCX / RCA) when 2+ vessels are flagged: on the most camera-facing, unoccluded point of
//    each vessel's centreline.
// The in-canvas <OverlayLayout/> recomputes positions only when the camera / canvas / data change (throttled);
// <OverlayLabels/> renders plain DOM chips over the canvas.
import { useFrame, useThree } from "@react-three/fiber";
import { ArrowDown, ArrowUp, Droplet } from "lucide-react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { create } from "zustand";
import type { Scene } from "../api/types";
import { useStore } from "../state/store";
import { worldPos } from "./geom";
import { reg, useModelStatus } from "./registry";

type Chip = {
  key: string;
  x: number;
  y: number;
  w: number;
  label: string;
  color: string;
  dir: "raises" | "lowers";
  blood: boolean;
};
type Tag = {
  key: string;
  x: number;
  y: number;
  px: number;
  py: number;
  label: string;
  color: string;
  flagged: boolean;
};
export const useOverlay = create<{ chips: Chip[]; tags: Tag[]; set: (p: { chips?: Chip[]; tags?: Tag[] }) => void }>(
  (set) => ({
    chips: [],
    tags: [],
    set: (p) => set(p),
  }),
);

const CHIP_H = 22;
const GRID = 8; // silhouette mask cell (px)

function displayedScene(): Scene | undefined {
  const s = useStore.getState();
  return s.whatIf.showOnHeart && s.whatIf.result && !s.whatIf.peek ? s.whatIf.result.scene_after : s.prediction?.scene;
}

function worldBox(names: string[]): THREE.Box3 | null {
  const box = new THREE.Box3();
  let any = false;
  for (const n of names) {
    const m = reg.meshes.get(n);
    if (!m) continue;
    m.updateWorldMatrix(true, false);
    box.union(new THREE.Box3().setFromObject(m));
    any = true;
  }
  return any ? box : null;
}

/** 3D point where a region's chip belongs. */
function regionPoint(region: string, meshNames: string[], anchor: string): THREE.Vector3 | null {
  if (region === "whole_body" || meshNames.includes("Torso_Shell")) {
    const torso = worldBox(["Torso_Shell"]);
    const lungs = worldBox(["Organ_Lungs"]);
    if (!torso) return worldPos(anchor);
    const c = torso.getCenter(new THREE.Vector3());
    c.y = lungs
      ? lungs.getCenter(new THREE.Vector3()).y + (lungs.max.y - lungs.min.y) * 0.25
      : torso.min.y + 0.72 * (torso.max.y - torso.min.y);
    return c; // chest centre
  }
  const b = worldBox(meshNames);
  return b ? b.getCenter(new THREE.Vector3()) : worldPos(anchor);
}

const estW = (label: string, icon = 1) => Math.round(label.length * 6.3 + 22 + icon * 12);

export function OverlayLayout() {
  const { camera, size, gl } = useThree();
  const loaded = useModelStatus((s) => s.loaded);
  const mode = useStore((s) => s.view.mode);
  const pred = useStore((s) => s.prediction);
  const whatIf = useStore((s) => s.whatIf);
  const setOverlay = useOverlay((s) => s.set);
  const last = useRef({ key: "", t: 0 });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const bestIdx = useRef<Record<string, number>>({});

  const project = (p: THREE.Vector3) => {
    tmp.copy(p).project(camera);
    return { x: ((tmp.x + 1) / 2) * size.width, y: ((1 - tmp.y) / 2) * size.height, z: tmp.z };
  };

  useFrame(() => {
    if (!loaded) return;
    const now = performance.now();
    const key =
      camera.matrixWorld.elements.map((v) => v.toFixed(4)).join(",") +
      `|${size.width}x${size.height}|${mode}|${pred?.latency_ms}|${whatIf.showOnHeart}|${whatIf.peek}|${whatIf.result?.latency_ms}`;
    if (key === last.current.key || now - last.current.t < 60) return;
    last.current = { key, t: now };
    const scene = displayedScene();
    void gl;

    // ---------------------------------------------------------------- body-mode region chips
    let chips: Chip[] = [];
    if (mode === "body" && scene?.regions.length) {
      // silhouette mask from projected Torso_Shell vertices (dilated by one cell)
      const shell = reg.meshes.get("Torso_Shell");
      const cols = Math.ceil(size.width / GRID),
        rows = Math.ceil(size.height / GRID);
      const mask = new Uint8Array(cols * rows);
      if (shell) {
        shell.updateWorldMatrix(true, false);
        const pos = shell.geometry.attributes.position!;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld);
          const s = project(v);
          const cx = Math.floor(s.x / GRID),
            cy = Math.floor(s.y / GRID);
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
              const x = cx + dx,
                y = cy + dy;
              if (x >= 0 && y >= 0 && x < cols && y < rows) mask[y * cols + x] = 1;
            }
        }
      }
      // close small horizontal gaps between projected vertices (point cloud -> solid), but not the wide space
      // between an arm and the torso
      for (let y = 0; y < rows; y++) {
        let prevOcc = -1;
        for (let x = 0; x < cols; x++) {
          if (!mask[y * cols + x]) continue;
          if (prevOcc >= 0 && x - prevOcc - 1 <= 6) for (let k = prevOcc + 1; k < x; k++) mask[y * cols + k] = 1;
          prevOcc = x;
        }
      }
      const inside = (x: number, y: number) => {
        const cx = Math.floor(x / GRID),
          cy = Math.floor(y / GRID);
        return cx >= 0 && cy >= 0 && cx < cols && cy < rows && mask[cy * cols + cx] === 1;
      };
      const fits = (x: number, y: number, w: number) =>
        [x - w / 2 + 4, x, x + w / 2 - 4].every(
          (sx) => inside(sx, y - CHIP_H / 2 + 4) && inside(sx, y + CHIP_H / 2 - 4),
        );
      const chest = regionPoint("whole_body", ["Torso_Shell"], "Anchor_WholeBody");
      const chestS = chest ? project(chest) : { x: size.width / 2, y: size.height / 2 };
      const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
      const free = (x: number, y: number, w: number) =>
        !placed.some(
          (b) => x - w / 2 < b.x1 + 4 && b.x0 < x + w / 2 + 4 && y - CHIP_H / 2 < b.y1 + 3 && b.y0 < y + CHIP_H / 2 + 3,
        );
      const items = scene.regions
        .map((r) => {
          const blood = r.camera_anchor === "Anchor_Blood";
          const label = blood ? "Blood tests" : r.display_name;
          const p = regionPoint(r.region, r.mesh_names, r.camera_anchor);
          return p ? { r, blood, label, s: project(p), w: estW(label, blood ? 2 : 1) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.s.y - b.s.y);
      for (const it of items) {
        let best: { x: number; y: number } | null = null;
        // candidates: spiral around the target, then pulled toward the chest centre
        for (let k = 0; k <= 14 && !best; k++) {
          const t = k / 14;
          const bx = it.s.x + (chestS.x - it.s.x) * t,
            by = it.s.y + (chestS.y - it.s.y) * t;
          for (const dy of [0, 26, -26, 52, -52]) {
            for (const dx of [0, 12, -12]) {
              const x = bx + dx,
                y = by + dy;
              if (fits(x, y, it.w) && free(x, y, it.w)) {
                best = { x, y };
                break;
              }
            }
            if (best) break;
          }
        }
        if (!best) continue; // never draw a chip outside the body
        placed.push({ x0: best.x - it.w / 2, x1: best.x + it.w / 2, y0: best.y - CHIP_H / 2, y1: best.y + CHIP_H / 2 });
        chips.push({
          key: it.r.region,
          x: best.x,
          y: best.y,
          w: it.w,
          label: it.label,
          color: it.r.color,
          dir: it.r.direction,
          blood: it.blood,
        });
      }
    } else chips = [];

    // ---------------------------------------------------------------- vessel tags (2+ flagged)
    let tags: Tag[] = [];
    const vessels = scene ? Object.entries(scene.vessels) : [];
    if (mode === "heart" && vessels.filter(([, v]) => v.flagged).length >= 2) {
      const occluders = ["Heart_Myocardium", "Aorta"].map((n) => reg.meshes.get(n)).filter((m): m is THREE.Mesh => !!m);
      const camPos = camera.getWorldPosition(new THREE.Vector3());
      const centre = new THREE.Vector3(0, 0, 0);
      const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
      for (const [k, v] of vessels) {
        const mesh = reg.nodes.get(`Coronary_${k.toUpperCase()}`);
        const raw = mesh?.userData?.centerlines_gltf as string | undefined;
        if (!mesh || !raw) continue;
        const parent = mesh.parent;
        parent?.updateWorldMatrix(true, false);
        const line = (JSON.parse(raw) as number[][][])[0] ?? [];
        const pts = line.map((p) =>
          new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(parent ? parent.matrixWorld : new THREE.Matrix4()),
        );
        // candidates: most camera-facing points first (excluding the first/last 15 % of the vessel)
        const lo = Math.floor(pts.length * 0.15),
          hi = Math.ceil(pts.length * 0.85);
        const toCam = camPos.clone().sub(centre).normalize();
        const scored = pts
          .map((p, i) => ({ p, i, f: p.clone().sub(centre).normalize().dot(toCam) }))
          .filter((c) => c.i >= lo && c.i < hi && c.f > 0.15)
          .sort((a, b) => b.f - a.f);
        // stickiness: keep the previous point if it is still good (no jitter while orbiting)
        const prev = bestIdx.current[k];
        if (prev !== undefined) {
          const pc = scored.find((c) => c.i === prev);
          if (pc && pc.f > (scored[0]?.f ?? 0) - 0.12) scored.unshift(pc);
        }
        let chosen: { p: THREE.Vector3; i: number } | null = null;
        for (const c of scored.slice(0, 24)) {
          const dir = c.p.clone().sub(camPos);
          const dist = dir.length();
          ray.set(camPos, dir.normalize());
          const hit = ray.intersectObjects(occluders, false)[0];
          if (!hit || hit.distance > dist - 0.004) {
            chosen = c;
            break;
          }
        }
        if (!chosen) continue;
        bestIdx.current[k] = chosen.i;
        const s = project(chosen.p);
        if (s.z > 1) continue;
        const label = k.toUpperCase();
        const w = estW(label, 0);
        // tag sits above the point with a short leader; push up/sideways to avoid other tags
        const tx = s.x;
        let ty = s.y - 24;
        for (let n = 0; n < 8; n++) {
          const clash = boxes.some(
            (b) => tx - w / 2 < b.x1 + 4 && b.x0 < tx + w / 2 + 4 && ty - 10 < b.y1 + 3 && b.y0 < ty + 10 + 3,
          );
          if (!clash) break;
          ty -= 22;
        }
        boxes.push({ x0: tx - w / 2, x1: tx + w / 2, y0: ty - 10, y1: ty + 10 });
        tags.push({ key: k, x: tx, y: ty, px: s.x, py: s.y, label, color: v.color, flagged: v.flagged });
      }
    } else tags = [];
    setOverlay({ chips, tags });
  });
  return null;
}

export function OverlayLabels() {
  const { chips, tags } = useOverlay();
  const mode = useStore((s) => s.view.mode);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      {mode === "body" &&
        chips.map((c) => (
          <div
            key={c.key}
            data-chip={c.key}
            className="absolute flex items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium shadow-soft"
            style={{
              left: c.x - c.w / 2,
              top: c.y - CHIP_H / 2,
              height: CHIP_H,
              width: c.w,
              justifyContent: "center",
              background: "rgba(22,24,27,0.9)",
              borderColor: c.color,
              color: "#F2F0ED",
            }}
          >
            {c.blood && <Droplet className="h-3 w-3 shrink-0" />}
            {c.dir === "raises" ? (
              <ArrowUp className="h-3 w-3 shrink-0" style={{ color: c.color }} />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0" style={{ color: c.color }} />
            )}
            {c.label}
          </div>
        ))}
      {mode === "heart" && tags.length > 0 && (
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {tags.map((t) => (
            <g key={t.key}>
              <line
                x1={t.px}
                y1={t.py}
                x2={t.x}
                y2={t.y + 10}
                stroke="#FFFFFF"
                strokeOpacity={0.85}
                strokeWidth={1.2}
              />
              <circle cx={t.px} cy={t.py} r={2.4} fill="#FFFFFF" />
            </g>
          ))}
        </svg>
      )}
      {mode === "heart" &&
        tags.map((t) => (
          <div
            key={t.key}
            data-vessel-tag={t.key}
            className="absolute flex h-5 items-center gap-1 rounded-full border border-white/80 px-1.5 text-[11px] font-semibold tracking-wide text-white shadow-soft"
            style={{ left: t.x, top: t.y - 10, transform: "translateX(-50%)", background: "rgba(15,16,18,0.88)" }}
          >
            <span className="h-2 w-2 rounded-full border border-white/70" style={{ background: t.color }} />
            {t.label}
          </div>
        ))}
    </div>
  );
}
