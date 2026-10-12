// scene_state -> materials. Mesh names, colours and flags come ONLY from the API scene + anatomy_map.
// * each mesh gets its own material clone (never mutate shared materials)
// * colour / emissive tween over 400 ms (easeOutCubic) inside useFrame
// * flagged vessels: Extra_Outline_<V> shell visible + emissive pulse e(t) = base * (0.6 + 0.4 sin(2*pi*f*t))
// * only LAD / LCX / RCA carry risk colours; LM and branches keep their neutral map colours
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AnatomyMap, Scene } from "../api/types";
import { prefersReducedMotion } from "../lib/device";
import { useStore, type Look } from "../state/store";
import { reg } from "./registry";

const TWEEN_MS = 400;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const TEXTURED_TINT = 0.5; // textured surfaces (heart, aorta) take the scene tint at 50 % so the texture stays legible
const WHITE = new THREE.Color(1, 1, 1);

type Std = THREE.MeshStandardMaterial;
type Binding = {
  mesh: THREE.Mesh;
  textured: boolean;
  variants: Partial<Record<Look, Std>>;
  color: { from: THREE.Color; to: THREE.Color; cur: THREE.Color; start: number };
  emissive: { from: number; to: number; cur: number; start: number };
  pulseHz: number;
  flagged: boolean;
  target?: string | null;
};

const variantIndex = (json: { extensions?: Record<string, unknown> }, name: Look): number => {
  const v = (json.extensions?.KHR_materials_variants as { variants?: { name: string }[] } | undefined)?.variants ?? [];
  return v.findIndex((x) => x.name === name);
};

/** Build per-mesh bindings once per loaded glTF (clones materials; resolves KHR_materials_variants). */
export async function buildBindings(root: THREE.Object3D, parser: unknown): Promise<Map<string, Binding>> {
  const p = parser as {
    json: { meshes: { primitives: { extensions?: Record<string, { mappings?: { material: number; variants: number[] }[] }> }[] }[]; extensions?: Record<string, unknown> };
    associations: Map<THREE.Object3D, { meshes?: number; primitives?: number }>;
    getDependency: (t: "material", i: number) => Promise<THREE.Material>;
  };
  const out = new Map<string, Binding>();
  const jobs: Promise<void>[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.name) return;
    const base = (mesh.material as Std).clone();
    mesh.material = base;
    const b: Binding = {
      mesh,
      textured: !!base.map,
      variants: { realistic: base },
      color: { from: base.color.clone(), to: base.color.clone(), cur: base.color.clone(), start: 0 },
      emissive: { from: 0, to: 0, cur: 0, start: 0 },
      pulseHz: 0,
      flagged: false,
    };
    out.set(mesh.name, b);
    const a = p.associations?.get(mesh);
    if (a?.meshes === undefined) return;
    const prim = p.json.meshes[a.meshes]?.primitives[a.primitives ?? 0];
    const maps = prim?.extensions?.KHR_materials_variants?.mappings ?? [];
    for (const look of ["realistic", "clinical"] as Look[]) {
      const vi = variantIndex(p.json, look);
      const m = maps.find((mp) => mp.variants.includes(vi));
      if (m)
        jobs.push(
          p.getDependency("material", m.material).then((mat) => {
            b.variants[look] = (mat as Std).clone();
          }),
        );
    }
  });
  await Promise.all(jobs);
  for (const b of out.values()) if (b.variants.realistic) b.mesh.material = b.variants.realistic;
  return out;
}

/** Mesh names expected by anatomy_map that are missing from the loaded file. */
export function missingMeshes(map: AnatomyMap, names: Set<string>): string[] {
  const want = [
    ...map.vessels.flatMap((v) => v.mesh_names),
    ...map.neutral_structures.flatMap((n) => n.mesh_names),
    ...map.heart.mesh_names,
    ...map.territories.entries.flatMap((t) => t.mesh_names),
  ];
  return want.filter((n) => !names.has(n));
}

export function useSceneBinding(bindings: Map<string, Binding> | null, map: AnatomyMap | undefined) {
  const prediction = useStore((s) => s.prediction);
  const whatIf = useStore((s) => s.whatIf);
  const look = useStore((s) => s.view.look);
  const view = useStore((s) => s.view);
  const hover = useStore((s) => s.selection.hover);
  const selected = useStore((s) => s.selection.target);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const animUntil = useRef(0);

  const scene: Scene | undefined =
    whatIf.showOnHeart && whatIf.result && !whatIf.peek ? whatIf.result.scene_after : prediction?.scene;

  // variants (realistic <-> clinical): swap the per-mesh clone, carry over the current tint
  useEffect(() => {
    if (!bindings) return;
    for (const b of bindings.values()) {
      const m = b.variants[look] ?? b.variants.realistic;
      if (m && b.mesh.material !== m) b.mesh.material = m;
    }
    invalidate();
  }, [bindings, look, invalidate]);

  // scene -> tween targets
  useEffect(() => {
    if (!bindings || !map) return;
    const now = performance.now();
    const neutral = map.neutral_structures.find((n) => n.mesh_names.includes("Coronary_LM"))?.color ?? "#C9C2B8";
    const setTarget = (b: Binding, color: string, emissive: number, pulse: number, flagged: boolean) => {
      const c = new THREE.Color(color);
      b.color.from.copy(b.color.cur);
      b.color.to.copy(c);
      b.color.start = reduced ? now - TWEEN_MS : now;
      b.emissive.from = b.emissive.cur;
      b.emissive.to = emissive;
      b.emissive.start = b.color.start;
      b.pulseHz = pulse;
      b.flagged = flagged;
    };
    for (const [name, b] of bindings) {
      const sm = scene?.meshes[name];
      if (sm) {
        setTarget(b, sm.color, sm.emissive, sm.pulse_hz, sm.flagged);
        b.target = sm.target;
      } else if (!scene && map.vessels.some((v) => v.mesh_names.includes(name))) {
        setTarget(b, neutral, 0, 0, false); // before any prediction: vessels neutral
      } else if (!scene && map.heart.mesh_names.includes(name)) {
        setTarget(b, "#FFFFFF", 0, 0, false);
      }
    }
    animUntil.current = now + TWEEN_MS + 50;
    invalidate();
  }, [bindings, map, scene, reduced, invalidate]);

  // static per-frame-independent material setup (visibility, transparency, outlines, helpers)
  useEffect(() => {
    if (!bindings || !map) return;
    const terrOpacity = map.style.territory.opacity;
    for (const [name, b] of bindings) {
      const m = b.mesh.material as Std;
      if (name.startsWith("Extra_Hit_")) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        m.colorWrite = false;
      } else if (name.startsWith("Extra_Outline_")) {
        const v = name.replace("Extra_Outline_", "").toLowerCase();
        const sv = scene?.vessels[v];
        if (!(b.mesh.material instanceof THREE.MeshBasicMaterial)) {
          // inverted normals are baked into the outline shell -> FrontSide renders the hull behind the vessel
          b.mesh.material = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9, side: THREE.FrontSide, depthWrite: false });
        }
        const om = b.mesh.material as THREE.MeshBasicMaterial;
        om.color.set(scene?.meshes[`Coronary_${v.toUpperCase()}`]?.outline_color ?? "#FFFFFF");
        b.mesh.visible = !!sv?.flagged;
        b.mesh.renderOrder = 1;
      } else if (name.startsWith("Territory_")) {
        b.mesh.visible = view.territories;
        for (const mm of Object.values(b.variants)) {
          if (!mm) continue;
          mm.transparent = true;
          mm.opacity = terrOpacity;
          mm.depthWrite = false;
          mm.polygonOffset = true;
          mm.polygonOffsetFactor = -2;
        }
        b.mesh.renderOrder = 2;
      } else if (name === "Torso_Shell") {
        m.transparent = true;
        m.opacity = view.xray;
        m.depthWrite = false;
        b.mesh.renderOrder = 3;
      }
    }
    const body = reg.nodes.get("Body");
    if (body) body.visible = view.mode === "body";
    invalidate();
  }, [bindings, map, scene, view.territories, view.mode, view.xray, invalidate]);

  // per frame: tweens, pulses, hover lift, region glow (body mode)
  useFrame(({ clock }) => {
    if (!bindings) return;
    const now = performance.now();
    const t = clock.getElapsedTime();
    const regions = view.mode === "body" ? (scene?.regions ?? []) : [];
    const glow = new Map<string, { color: string; k: number }>();
    for (const r of regions) {
      if (r.region === "heart") continue; // the heart carries the tier pulse
      for (const n of r.mesh_names) glow.set(n, { color: r.color, k: r.intensity });
    }
    let animating = now < animUntil.current;
    for (const [name, b] of bindings) {
      if (name.startsWith("Extra_")) continue;
      const m = b.mesh.material as Std;
      if (!m.color) continue;
      const w = easeOutCubic(Math.min(1, Math.max(0, (now - b.color.start) / TWEEN_MS)));
      b.color.cur.copy(b.color.from).lerp(b.color.to, w);
      b.emissive.cur = b.emissive.from + (b.emissive.to - b.emissive.from) * w;
      if (b.textured) m.color.copy(WHITE).lerp(b.color.cur, TEXTURED_TINT);
      else m.color.copy(b.color.cur);
      if (!m.emissive) continue;
      let e = b.emissive.cur * (b.textured ? TEXTURED_TINT : 1);
      if (b.pulseHz > 0 && !reduced) {
        e *= 0.6 + 0.4 * Math.sin(2 * Math.PI * b.pulseHz * t);
        animating = true;
      }
      const vesselKey = b.target && b.target !== "cad" ? b.target : undefined;
      if (vesselKey && (hover === vesselKey || selected === vesselKey)) e += 0.15;
      const g = glow.get(name);
      if (g) {
        m.emissive.set(g.color);
        m.emissiveIntensity = g.k * (reduced ? 0.7 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t)));
        animating = !reduced || animating;
      } else {
        m.emissive.copy(b.color.cur);
        m.emissiveIntensity = e;
      }
    }
    if (animating) invalidate();
  });
}
