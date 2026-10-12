import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Vessel } from "../api/types";
import { useStore } from "../state/store";
import { reg, useHoverTip } from "./registry";

const HIT: Record<string, Vessel> = { Extra_Hit_LAD: "lad", Extra_Hit_LCX: "lcx", Extra_Hit_RCA: "rca" };
const BASE = ["Extra_Hit_LAD", "Extra_Hit_LCX", "Extra_Hit_RCA", "Heart_Myocardium", "Aorta", "Coronary_LM", "Coronary_Branches"];

function visibleInWorld(o: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible && !n.name.startsWith("Extra_Hit_")) return false;
  return true;
}

/** key for a mesh: 'lad' | 'lcx' | 'rca' | 'myocardium' | 'aorta' | 'lm' | 'branches' | 'organ' */
export function keyFor(name: string): string {
  if (name in HIT) return HIT[name]!;
  if (name === "Heart_Myocardium") return "myocardium";
  if (name === "Aorta") return "aorta";
  if (name === "Coronary_LM") return "lm";
  if (name === "Coronary_Branches") return "branches";
  return "organ";
}

/** Raycast hit proxies + myocardium + neutral structures (+ organs in body mode); the nearest hit wins. */
export function pickAt(ndc: THREE.Vector2, camera: THREE.Camera): { name: string; key: string; point: THREE.Vector3 } | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const body = useStore.getState().view.mode === "body";
  const names = body ? [...BASE, ...[...reg.meshes.keys()].filter((n) => n.startsWith("Organ_"))] : BASE;
  const targets = names.map((n) => reg.meshes.get(n)).filter((m): m is THREE.Mesh => !!m && visibleInWorld(m));
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return null;
  return { name: hit.object.name, key: keyFor(hit.object.name), point: hit.point };
}

export function Picking() {
  const { camera, gl, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const setTip = useHoverTip((s) => s.set);
  const raf = useRef(0);
  const down = useRef<{ x: number; y: number; t: number; touch: boolean } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const ndc = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const hoverAt = (e: PointerEvent) => {
      const h = pickAt(ndc(e), camera);
      const r = el.getBoundingClientRect();
      const st = useStore.getState();
      if (h) {
        setTip({ x: e.clientX - r.left, y: e.clientY - r.top, key: h.key, mesh: h.name });
        el.style.cursor = ["lad", "lcx", "rca"].includes(h.key) ? "pointer" : "grab";
        st.hover(h.key);
      } else {
        setTip(null);
        el.style.cursor = "grab";
        st.hover(undefined);
      }
      invalidate();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.buttons) return;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => hoverAt(e)); // throttle to rAF
    };
    const onDown = (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType === "touch" };
    };
    const onUp = (e: PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // a drag, not a click
      const h = pickAt(ndc(e), camera);
      const st = useStore.getState();
      if (d.touch) hoverAt(e); // tap = hover + select (long press keeps the tooltip)
      if (h && ["lad", "lcx", "rca"].includes(h.key)) {
        const v = h.key as Vessel;
        st.select(v);
        const anchor = st.prediction?.scene.vessels[v]?.camera_anchor ?? `Anchor_${v.toUpperCase()}`;
        st.requestFly({ anchor });
        document.getElementById(`vessel-card-${v}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (!h) {
        st.select(undefined);
        if (!d.touch) setTip(null);
      }
    };
    const onDbl = (e: MouseEvent) => {
      const h = pickAt(ndc(e), camera);
      if (h && controls) {
        controls.target.copy(h.point); // double-click: orbit around that point
        controls.update();
        invalidate();
      }
    };
    const onLeave = () => {
      setTip(null);
      useStore.getState().hover(undefined);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf.current);
    };
  }, [camera, gl, invalidate, setTip, controls]);
  return null;
}
