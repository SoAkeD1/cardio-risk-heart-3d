import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { prefersReducedMotion } from "../lib/device";
import { useStore, type Preset } from "../state/store";
import { reg, viewTarget, worldPos, useModelStatus } from "./registry";

const FLY_MS = 600;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const VIEW_NODE: Record<Preset, string> = {
  front: "Extra_View_Front",
  left: "Extra_View_Left",
  posterior: "Extra_View_Posterior",
  body: "Extra_View_Body",
};

const REF_ASPECT = 1.6; // Extra_View_* presets are framed for a 16:10 frame (35 deg vertical FOV)

/** Preset pose from the Extra_View_* node; pulled back on narrower canvases so the subject still fits. */
export function presetPose(p: Preset, aspect = REF_ASPECT): { pos: THREE.Vector3; target: THREE.Vector3 } | null {
  const n = reg.nodes.get(VIEW_NODE[p]);
  if (!n) return null;
  n.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
  const target = viewTarget(n);
  // presets come from 16:10 renders; in app panels the subject gets a little air + width-limited canvases pull back
  const k = (p === "body" ? 1.05 : 1.25) * Math.max(1, 1 / Math.max(aspect, 0.3));
  return { pos: target.clone().add(pos.sub(target).multiplyScalar(k)), target };
}

/** Camera pose that frames an anchor (a point ~3 cm outside its structure). */
export function anchorPose(anchor: string, mode: "heart" | "body") {
  const a = worldPos(anchor);
  if (!a) return null;
  const heartCentre = new THREE.Vector3(0, 0, 0);
  const target = mode === "heart" ? a.clone().lerp(heartCentre, 0.45) : a.clone();
  const dir = a.clone().sub(mode === "heart" ? heartCentre : new THREE.Vector3(a.x, a.y, a.z - 1)).normalize();
  if (mode === "body") dir.set(0.15, 0.1, 1).normalize();
  return { pos: target.clone().add(dir.multiplyScalar(mode === "heart" ? 0.3 : 0.75)), target };
}

export function CameraRig() {
  const controls = useRef<OrbitImpl>(null);
  const { camera, invalidate } = useThree();
  const mode = useStore((s) => s.view.mode);
  const turntable = useStore((s) => s.view.turntable);
  const fly = useStore((s) => s.flyTo);
  const loaded = useModelStatus((s) => s.loaded);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const aspect = () => (camera as THREE.PerspectiveCamera).aspect || REF_ASPECT;
  const anim = useRef<{ p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number } | null>(null);

  const go = (pose: { pos: THREE.Vector3; target: THREE.Vector3 } | null, instant = false) => {
    const c = controls.current;
    if (!pose || !c) return;
    if (instant || reduced) {
      camera.position.copy(pose.pos);
      c.target.copy(pose.target);
      c.update();
      invalidate();
      return;
    }
    anim.current = { p0: camera.position.clone(), t0: c.target.clone(), p1: pose.pos, t1: pose.target, start: performance.now() };
    invalidate();
  };

  // initial pose when the model arrives
  useEffect(() => {
    if (!loaded) return;
    const v = useStore.getState().view;
    go(presetPose(v.mode === "body" ? "body" : v.preset === "body" ? "front" : v.preset, aspect()), true);
    reg.camera = camera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // fly-to requests (presets, vessel anchors, region anchors)
  useEffect(() => {
    if (!fly || !loaded) return;
    if (fly.preset) go(presetPose(fly.preset, aspect()));
    else if (fly.anchor) go(anchorPose(fly.anchor, useStore.getState().view.mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.nonce, loaded]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const a = anim.current;
    if (a) {
      const k = easeInOutCubic(Math.min(1, (performance.now() - a.start) / FLY_MS));
      camera.position.lerpVectors(a.p0, a.p1, k);
      c.target.lerpVectors(a.t0, a.t1, k);
      c.update();
      if (k >= 1) anim.current = null;
      invalidate();
    }
    // keep panning inside the scene bounds
    const lim = mode === "heart" ? 0.08 : 0.9;
    const t = c.target;
    const clamped = t.clone().clamp(new THREE.Vector3(-lim, mode === "heart" ? -lim : -1.0, -lim), new THREE.Vector3(lim, lim, lim));
    if (!clamped.equals(t)) {
      t.copy(clamped);
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minDistance={mode === "heart" ? 0.18 : 0.6}
      maxDistance={mode === "heart" ? 0.9 : 3.5}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI - 0.12}
      autoRotate={turntable && !reduced}
      autoRotateSpeed={1}
    />
  );
}
