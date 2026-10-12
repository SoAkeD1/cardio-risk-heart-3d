import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { KTX2Loader } from "three-stdlib";
import { useAnatomyMap } from "../api/hooks";
import { prefersReducedMotion } from "../lib/device";
import { useStore } from "../state/store";
import { toast } from "../ui/Toast";
import { reg, useModelStatus } from "./registry";
import { buildBindings, missingMeshes, useSceneBinding } from "./useSceneBinding";
import { registerTestHook } from "../test/hooks";

export const MODEL_URL = { full: "/models/heart.glb", lite: "/models/heart_lite.glb" } as const;
const DRACO = "/decoders/draco/";

let ktx2: KTX2Loader | null = null;

/** Heartbeat: double-bump "lub-dub" at 1 Hz. */
function beat(t: number): number {
  const ph = t % 1;
  return Math.exp(-(((ph - 0.06) / 0.045) ** 2)) + 0.55 * Math.exp(-(((ph - 0.27) / 0.06) ** 2));
}

export function HeartModel({ url }: { url: string }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const gltf = useGLTF(url, DRACO, false, (loader) => {
    if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath("/decoders/basis/").detectSupport(gl);
    (loader as unknown as { setKTX2Loader: (k: KTX2Loader) => void }).setKTX2Loader(ktx2);
  });
  const { data: map } = useAnatomyMap();
  const [bindings, setBindings] = useState<Awaited<ReturnType<typeof buildBindings>> | null>(null);
  const setLoaded = useModelStatus((s) => s.set);
  const heartbeat = useStore((s) => s.view.heartbeat);
  const tier = useStore((s) => s.prediction?.scene.heart.risk_tier);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [fade, setFade] = useState(0);

  useEffect(() => {
    let alive = true;
    reg.nodes.clear();
    reg.meshes.clear();
    gltf.scene.traverse((o) => {
      if (o.name) reg.nodes.set(o.name, o);
      if ((o as THREE.Mesh).isMesh && o.name) reg.meshes.set(o.name, o as THREE.Mesh);
    });
    reg.gltf = gltf as never;
    buildBindings(gltf.scene, (gltf as unknown as { parser: unknown }).parser).then((b) => {
      if (!alive) return;
      setBindings(b);
      setLoaded(true);
      setFade(performance.now());
      invalidate();
    });
    registerTestHook("getMeshColors", () => {
      const out: Record<string, string> = {};
      for (const [n, m] of reg.meshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.color && !n.startsWith("Extra_")) out[n] = "#" + mat.color.getHexString().toUpperCase();
      }
      return out;
    });
    return () => {
      alive = false;
    };
  }, [gltf, setLoaded, invalidate]);

  // every mesh named in anatomy_map must exist in the file
  useEffect(() => {
    if (!map || !bindings) return;
    const miss = missingMeshes(map, new Set(bindings.keys()));
    if (miss.length) {
      console.error("[CardioLens] meshes missing from the 3D model:", miss);
      toast({ title: "3D model is incomplete", description: `Missing: ${miss.join(", ")}` });
    }
  }, [map, bindings]);

  useSceneBinding(bindings, map);

  // fade in over 300 ms + heartbeat (uniform scale of the Heart group, pivot at the origin)
  useFrame(({ clock }) => {
    const heart = reg.nodes.get("Heart");
    if (fade) {
      const k = Math.min(1, (performance.now() - fade) / 300);
      gltf.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && (o as THREE.Mesh).isMesh && !o.name.startsWith("Extra_") && !o.name.startsWith("Territory_") && o.name !== "Torso_Shell") {
          m.transparent = k < 1;
          m.opacity = k;
        }
      });
      if (k >= 1) setFade(0);
      invalidate();
    }
    if (heart) {
      const on = heartbeat && !reduced;
      const A = tier === "High" ? 0.018 : 0.012;
      const s = on ? 1 + A * beat(clock.getElapsedTime()) : 1;
      heart.scale.setScalar(s);
      if (on) invalidate();
    }
  });

  return <primitive object={gltf.scene} />;
}

useGLTF.preload(MODEL_URL.full, DRACO);
