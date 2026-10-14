// scene_state -> materials. Mesh names, colours and flags come ONLY from the API scene + anatomy_map.
// * each mesh gets its own material clone (never mutate shared materials)
// * colour / emissive tween over 400 ms (easeOutCubic) inside useFrame
// * flagged vessels: the vessel's outline shell (anatomy_map.viewer.vessel_helpers) visible + emissive pulse e(t) = base * (0.6 + 0.4 sin(2*pi*f*t))
// * only LAD / LCX / RCA carry risk colours; LM and branches keep their neutral map colours
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AnatomyMap, Scene } from "../api/types";
import { prefersReducedMotion } from "../lib/device";
import { useStore, type Look } from "../state/store";
import { reg } from "./registry";
import { names } from "../lib/anatomy";

const TWEEN_MS = 400;
const TIER_TWEEN_MS = 600; // myocardium tint cross-fade when the CAD risk tier changes
const FLASH_MS = 300; // vessel flash when its probability changed >= 1 pt
const REGION_PULSE_MS = 1000; // body-mode organ pulse for the changed feature's region
const FLASH_MIN_DELTA = 0.01;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const TEXTURED_TINT = 0.5; // textured surfaces (heart, aorta) take the scene tint at 50 % so the texture stays legible
const WHITE = new THREE.Color(1, 1, 1);
const REALISTIC_VESSEL_LIFT = 0.16;

type Std = THREE.MeshStandardMaterial;
type Binding = {
  mesh: THREE.Mesh;
  textured: boolean;
  variants: Partial<Record<Look, Std>>;
  color: { from: THREE.Color; to: THREE.Color; cur: THREE.Color; start: number; dur?: number };
  flash?: { start: number; dur: number; color?: string };
  emissive: { from: number; to: number; cur: number; start: number };
  pulseHz: number;
  flagged: boolean;
  target?: string | null;
  edges?: THREE.LineSegments; // territory outline (child of the mesh, so it follows its visibility)
};

/** Outline of an open surface patch: the edges used by exactly one triangle. Vertices are welded by position
 *  first, so UV / normal seams inside the patch don't show up as false borders. */
function boundaryEdges(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  const key = (i: number) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
  const weld = new Map<string, number>();
  const id = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!weld.has(k)) weld.set(k, i);
    id[i] = weld.get(k)!;
  }
  const idx = geo.getIndex();
  const tri = idx ? idx.count : pos.count;
  const vert = (n: number) => id[idx ? idx.getX(n) : n]!;
  const count = new Map<string, [number, number, number]>();
  for (let t = 0; t < tri; t += 3) {
    const v = [vert(t), vert(t + 1), vert(t + 2)];
    for (let e = 0; e < 3; e++) {
      const a = v[e]!, b = v[(e + 1) % 3]!;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const c = count.get(k);
      if (c) c[2]++;
      else count.set(k, [a, b, 1]);
    }
  }
  const out: number[] = [];
  for (const [a, b, n] of count.values())
    if (n === 1) out.push(pos.getX(a), pos.getY(a), pos.getZ(a), pos.getX(b), pos.getY(b), pos.getZ(b));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return g;
}

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
    const N = names();
    const neutral = N?.unmodelledCoronary[0]?.color ?? map.neutral_structures[0]!.color;
    const setTarget = (b: Binding, color: string, emissive: number, pulse: number, flagged: boolean) => {
      const c = new THREE.Color(color);
      b.color.from.copy(b.color.cur);
      b.color.to.copy(c);
      b.color.start = reduced ? now - TWEEN_MS : now;
      b.color.dur = undefined; // a tier change (change-feedback effect below) lengthens this to TIER_TWEEN_MS
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
        setTarget(b, "#" + WHITE.getHexString(), 0, 0, false); // untinted texture
      }
    }
    animUntil.current = now + TWEEN_MS + 50;
    invalidate();
  }, [bindings, map, scene, reduced, invalidate]);

  // change feedback: flash changed vessels, cross-fade the myocardium on tier change, pulse the linked organ
  const changeEvent = useStore((s) => s.changeEvent);
  useEffect(() => {
    if (!bindings || !changeEvent) return;
    const N = names();
    if (!N) return;
    const now = performance.now();
    for (const v of N.vessels) {
      if (Math.abs(changeEvent.deltas[v.key] ?? 0) < FLASH_MIN_DELTA) continue;
      const b = bindings.get(v.mesh);
      if (b) b.flash = { start: now, dur: FLASH_MS };
    }
    if (changeEvent.tierFrom !== changeEvent.tierTo)
      for (const m of N.heartMeshes) {
        const b = bindings.get(m);
        if (b) b.color.dur = TIER_TWEEN_MS;
      }
    if (useStore.getState().view.mode === "body")
      for (const f of changeEvent.features)
        for (const r of N.regions.filter((x) => x.features.includes(f.name)))
          for (const m of r.mesh_names) {
            const b = bindings.get(m);
            if (b) b.flash = { start: now, dur: REGION_PULSE_MS };
          }
    animUntil.current = now + REGION_PULSE_MS + 50;
    invalidate();
  }, [bindings, changeEvent, invalidate]);

  // static per-frame-independent material setup (visibility, transparency, outlines, helpers)
  useEffect(() => {
    if (!bindings || !map) return;
    const terr = map.style.territory;
    for (const [name, b] of bindings) {
      const m = b.mesh.material as Std;
      const N = names();
      if (!N) continue;
      const outlineOf = N.vessels.find((v) => v.outline === name);
      if (N.vessels.some((v) => v.hit === name)) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        m.colorWrite = false;
      } else if (outlineOf) {
        const v = outlineOf.key;
        const sv = scene?.vessels[v];
        if (!(b.mesh.material instanceof THREE.MeshBasicMaterial)) {
          // inverted normals are baked into the outline shell -> FrontSide renders the hull behind the vessel
          b.mesh.material = new THREE.MeshBasicMaterial({ color: map.style.vessel.outline_color, transparent: true, opacity: 0.9, side: THREE.FrontSide, depthWrite: false });
        }
        const om = b.mesh.material as THREE.MeshBasicMaterial;
        om.color.set(scene?.meshes[outlineOf.mesh]?.outline_color ?? map.style.vessel.outline_color);
        b.mesh.visible = !!sv?.flagged;
        b.mesh.renderOrder = 1;
      } else if (N.territoryMeshes.includes(name)) {
        b.mesh.visible = view.territories;
        for (const mm of Object.values(b.variants)) {
          if (!mm) continue;
          mm.transparent = true;
          mm.opacity = terr.opacity;
          mm.depthWrite = false;
          mm.polygonOffset = true;
          mm.polygonOffsetFactor = -2;
        }
        b.mesh.renderOrder = 2;
        // a light outline per territory: the regions stay readable even when their risk colours are close to
        // each other or to the heart's own colour (colour still = the artery's probability)
        if (!b.edges) {
          b.edges = new THREE.LineSegments(
            boundaryEdges(b.mesh.geometry),
            new THREE.LineBasicMaterial({ color: terr.edge_color, transparent: true, opacity: terr.edge_opacity, depthWrite: false }),
          );
          b.edges.name = `${name}:outline`;
          b.edges.renderOrder = 3;
          b.edges.raycast = () => {}; // never pickable
          b.mesh.add(b.edges);
        }
      } else if (name === N.bodyShell) {
        m.transparent = true;
        m.opacity = view.xray;
        m.depthWrite = false;
        b.mesh.renderOrder = 3;
      }
    }
    const body = reg.nodes.get(names()?.groups.body ?? "");
    if (body) body.visible = view.mode === "body";
    invalidate();
  }, [bindings, map, scene, view.territories, view.mode, view.xray, invalidate]);

  // per frame: tweens, pulses, hover lift, region glow (body mode)
  useFrame(({ clock }) => {
    if (!bindings) return;
    const N = names();
    const helpers = new Set(N?.vessels.flatMap((v) => [v.hit, v.outline]) ?? []);
    const coronary = new Set([...(N?.vessels.map((v) => v.mesh) ?? []), ...(N?.unmodelledCoronary.flatMap((n) => n.mesh_names) ?? [])]);
    const territories = new Set(N?.territoryMeshes ?? []);
    const now = performance.now();
    const t = clock.getElapsedTime();
    const regions = view.mode === "body" ? (scene?.regions ?? []) : [];
    const glow = new Map<string, { color: string; k: number }>();
    for (const r of regions) {
      if (r.mesh_names.some((m) => N?.heartMeshes.includes(m))) continue; // the heart carries the tier pulse
      for (const n of r.mesh_names) glow.set(n, { color: r.color, k: r.intensity });
    }
    let animating = now < animUntil.current;
    for (const [name, b] of bindings) {
      if (helpers.has(name)) continue;
      const m = b.mesh.material as Std;
      if (!m.color) continue;
      const w = easeOutCubic(Math.min(1, Math.max(0, (now - b.color.start) / (b.color.dur ?? TWEEN_MS))));
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
      if (b.flash) {
        const k = (now - b.flash.start) / b.flash.dur;
        if (k >= 1) b.flash = undefined;
        else {
          e += (reduced ? 0.35 : 0.9) * (1 - k);
          animating = true;
        }
      }
      const g = glow.get(name);
      if (territories.has(name)) {
        // territories glow softly in their own (probability) colour so they read on top of the textured heart
        m.emissive.copy(b.color.cur);
        m.emissiveIntensity = map?.style.territory.glow ?? 0;
      } else if (g) {
        m.emissive.set(g.color);
        m.emissiveIntensity = g.k * (reduced ? 0.7 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t)));
        animating = !reduced || animating;
      } else if (look === "realistic" && coronary.has(name)) {
        // realistic look: the red-textured myocardium can swallow red vessels. Lift vessel lightness slightly with a
        // light emissive tint (material.color stays EXACTLY the API colour)
        m.emissive.copy(b.color.cur).lerp(WHITE, 0.55);
        m.emissiveIntensity = e + REALISTIC_VESSEL_LIFT;
      } else {
        m.emissive.copy(b.color.cur);
        m.emissiveIntensity = e;
      }
    }
    if (animating) invalidate();
  });
}
