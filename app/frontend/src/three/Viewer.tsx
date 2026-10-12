import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useViewerLook } from "../api/hooks";

import { isLowEndDevice, prefersReducedMotion } from "../lib/device";
import { pct } from "../lib/format";
import { useStore } from "../state/store";
import { registerTestHook } from "../test/hooks";
import { toast } from "../ui/Toast";
import { CameraRig, presetPose } from "./CameraRig";
import { CanvasToolbar } from "./CanvasToolbar";
import { SceneEnvironment } from "./Environment";
import { HeartModel, MODEL_URL } from "./HeartModel";
import { Legend } from "./Legend";
import { Picking } from "./Picking";
import { OverlayLabels, OverlayLayout } from "./Overlays";
import { ChangeFeedback } from "./ChangeFeedback";
import { EducationCard } from "../features/onboarding/EducationCard";
import { firstView, useNames } from "../lib/anatomy";
import { reg, useModelStatus } from "./registry";
import { worldPos } from "./geom";
import { Tooltip3D } from "./Tooltip3D";

class ModelBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("[CardioLens] 3D model failed to load", e);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Snapshot + projection + FPS hooks that need the R3F context. */
function ViewerApis() {
  const { gl, scene, camera, size } = useThree();
  const get = useThree((s) => s.get);
  useEffect(() => {
    registerTestHook("getFrameloop", () => get().frameloop);
  }, [get]);
  const frames = useRef<number[]>([]);
  useEffect(() => {
    reg.canvas = gl.domElement;
    reg.snapshot = async (opts) => {
      const cam = camera as THREE.PerspectiveCamera;
      const prev = { pos: cam.position.clone(), quat: cam.quaternion.clone(), dpr: gl.getPixelRatio() };
      if (opts?.front) {
        const pose = presetPose(firstView("heart"), (cam as THREE.PerspectiveCamera).aspect);
        if (pose) {
          cam.position.copy(pose.pos);
          cam.lookAt(pose.target);
        }
      }
      if (opts?.scale) gl.setPixelRatio(opts.scale);
      gl.render(scene, cam);
      const url = gl.domElement.toDataURL("image/png");
      if (opts?.scale) gl.setPixelRatio(prev.dpr);
      cam.position.copy(prev.pos);
      cam.quaternion.copy(prev.quat);
      gl.render(scene, cam);
      return url;
    };
    registerTestHook("projectAnchor", (n: string) => {
      const p = worldPos(n);
      if (!p) return null;
      p.project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    });
    // frames rendered during the last second, evaluated at query time (an idle demand loop reports ~0)
    registerTestHook("getFps", () => frames.current.filter((t) => performance.now() - t < 1000).length);
  }, [gl, scene, camera, size]);
  useFrame(() => {
    const now = performance.now();
    const f = frames.current;
    f.push(now);
    while (f.length && now - f[0]! > 1000) f.shift();
    reg.fps = f.length;
  });
  return null;
}

function ProgressOverlay() {
  const { progress, active } = useProgress();
  const loaded = useModelStatus((s) => s.loaded);
  if (loaded && !active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" aria-live="polite">
      <svg viewBox="0 0 64 64" className="h-20 w-20 opacity-20" aria-hidden>
        <path d="M32 54S12 41 12 26a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 15-20 28-20 28z" fill="rgb(var(--text-1))" />
      </svg>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-s3">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(4, progress)}%` }} />
      </div>
      <span className="num text-xs text-t2">Loading 3D heart… {Math.round(progress)}%</span>
    </div>
  );
}

function WhatIfChip() {
  const w = useStore((s) => s.whatIf);
  const setWhatIf = useStore((s) => s.setWhatIf);
  if (!(w.showOnHeart && w.result)) return null;
  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
      <span className="rounded-full border border-[rgb(var(--info)/0.6)] bg-s1/90 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-info">
        {w.peek ? "ORIGINAL" : "WHAT-IF PREVIEW"}
      </span>
      <button
        className="rounded-full border border-line bg-s1/90 px-2.5 py-1 text-[11px] font-medium text-t1 hover:bg-s2"
        onPointerDown={() => setWhatIf({ peek: true })}
        onPointerUp={() => setWhatIf({ peek: false })}
        onPointerLeave={() => setWhatIf({ peek: false })}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setWhatIf({ peek: true })}
        onKeyUp={() => setWhatIf({ peek: false })}
      >
        Hold to compare
      </button>
    </div>
  );
}

/** Focusable mirrors of the 3D vessels (keyboard path + screen readers). */
function VesselButtons({ compact }: { compact: boolean }) {
  const scene = useStore((s) =>
    s.whatIf.showOnHeart && s.whatIf.result && !s.whatIf.peek ? s.whatIf.result.scene_after : s.prediction?.scene,
  );
  const sel = useStore((s) => s.selection.target);
  const select = useStore((s) => s.select);
  const fly = useStore((s) => s.requestFly);
  const vessels = useNames((s) => s.names?.vessels) ?? [];
  return (
    <div role="group" aria-label="Select an artery" className="pointer-events-auto absolute bottom-3 right-3 z-10 flex gap-1 rounded-md border border-line bg-s1/90 p-1 shadow-soft backdrop-blur">
      {vessels.map(({ key: v, short, anchor }) => {
        const sv = scene?.vessels[v];
        return (
          <button
            key={v}
            data-testid={`vessel-btn-${v}`}
            aria-pressed={sel === v}
            aria-label={sv ? `${sv.display_name}: ${pct(sv.prob)}${sv.flagged ? ", stenosis likely" : ""}` : short}
            onClick={() => {
              const next = sel === v ? undefined : v;
              select(next);
              if (next) fly({ anchor: sv?.camera_anchor ?? anchor });
              if (next) document.getElementById(`vessel-card-${v}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
            className="flex h-8 items-center gap-1.5 rounded-[5px] px-2 text-xs font-semibold text-t1 hover:bg-s2 aria-pressed:bg-s3 aria-pressed:ring-1 aria-pressed:ring-[rgb(var(--accent)/0.7)]"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: sv?.color ?? "transparent" }} aria-hidden />
            {short}
            {sv && !compact && <span className="num font-normal text-t2">{pct(sv.prob)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Viewer({ onModelError, onModelLoaded }: { onModelError: () => void; onModelLoaded: () => void }) {
  const { data: look } = useViewerLook();
  const view = useStore((s) => s.view);
  const liteActive = useStore((s) => s.liteActive);
  const setLiteActive = useStore((s) => s.setLiteActive);
  const scene = useStore((s) => s.prediction?.scene);
  const loaded = useModelStatus((s) => s.loaded);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const N = useNames((s) => s.names);
  const declined = useRef(false);
  const [size, setSize] = useState(() => ({ w: typeof window === "undefined" ? 1000 : window.innerWidth, h: 800 }));
  const ro = useRef<ResizeObserver | null>(null);
  const root = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.current.observe(el);
  }, []);
  const compact = size.w < 640 || size.h < 440; // narrow or short canvas: collapsed legend, overflow menu

  // lite when the user chose it, or (auto) on low-memory / touch / mobile devices
  useEffect(() => {
    if (view.performance === "lite") setLiteActive(true);
    else if (view.performance === "quality") setLiteActive(false);
    else setLiteActive(isLowEndDevice());
  }, [view.performance, setLiteActive]);
  useEffect(() => {
    if (loaded) onModelLoaded();
  }, [loaded, onModelLoaded]);

  const lite = liteActive;
  const [dpr, setDpr] = useState<[number, number]>(lite ? [1, 1.25] : [1, 1.75]);
  useEffect(() => setDpr(lite ? [1, 1.25] : [1, 1.75]), [lite]);

  const anyFlag = !!scene && Object.values(scene.vessels).some((v) => v.flagged);
  const animating = !reduced && (view.heartbeat || view.turntable || anyFlag || (view.mode === "body" && !!scene?.regions.length));

  const aria = scene
    ? (N?.vessels ?? [])
        .map(({ key, short }) => {
          const s = scene.vessels[key]!;
          return `${short} ${pct(s.prob)}${s.flagged ? " stenosis likely" : ""}`;
        })
        .join("; ") + `. CAD ${pct(scene.heart.cad_prob)}, ${scene.heart.risk_tier} tier.`
    : "3D heart with the three main coronary arteries shown in a neutral colour. Load a sample patient to see risk.";

  if (!look) return <div className="canvas-bg h-full w-full" />;
  return (
    <div ref={root} className="canvas-bg relative h-full w-full overflow-hidden">
      <div role="img" aria-label={aria} className="absolute inset-0">
        <Canvas
          dpr={dpr}
          frameloop={animating ? "always" : "demand"}
          camera={{ fov: look.camera.vfov_deg, near: look.camera.near, far: look.camera.far, position: [0, 0.05, 0.45] }}
          gl={{ antialias: true, powerPreference: "high-performance", alpha: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = look.renderer.exposure;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setClearColor(0x000000, 0);
          }}
        >
          <ModelBoundary onError={onModelError}>
            <Suspense fallback={null}>
              <HeartModel url={lite ? MODEL_URL.lite : MODEL_URL.full} />
            </Suspense>
            {/* HDRI decode + PMREM in its own boundary, after the model is on screen (splits the long tasks) */}
            {loaded && (
              <Suspense fallback={<hemisphereLight args={["#f6f2ee", "#3a3a3a", 1.2]} />}>
                <SceneEnvironment look={look} />
              </Suspense>
            )}
          </ModelBoundary>
          <CameraRig />
          <OverlayLayout />
          <Picking />
          <ViewerApis />
          {animating && view.performance === "auto" && !lite && (
            <PerformanceMonitor
              bounds={() => [40, 60]}
              flipflops={1}
              onDecline={() => {
                if (declined.current) return;
                declined.current = true;
                setLiteActive(true);
                setDpr([1, 1]);
                toast({
                  title: "Switched to performance mode",
                  description: "Lighter 3D model and lower resolution to keep things smooth.",
                  action: {
                    label: "Undo",
                    run: () => {
                      useStore.getState().setView({ performance: "quality" });
                      setLiteActive(false);
                    },
                  },
                });
              }}
            />
          )}
        </Canvas>
      </div>
      <ProgressOverlay />
      <OverlayLabels />
      <ChangeFeedback />
      <EducationCard />
      <WhatIfChip />
      <CanvasToolbar compact={compact} />
      <Legend compact={compact} />
      <VesselButtons compact={compact} />
      <Tooltip3D />
    </div>
  );
}
