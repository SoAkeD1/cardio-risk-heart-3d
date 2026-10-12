import { Environment as DreiEnvironment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { ViewerLook } from "../api/types";

/** HDRI (self-hosted, CC0) + camera-relative key and rim lights from viewer_look.json. No shadows. */
export function SceneEnvironment({ look }: { look: ViewerLook }) {
  const lights = useRef<(THREE.DirectionalLight | null)[]>([]);
  const tmp = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    // keep lights fixed relative to the camera (key upper-front-left, rim from behind)
    look.lights.forEach((L, i) => {
      const l = lights.current[i];
      if (!l) return;
      tmp.current.set(...L.direction).applyQuaternion(camera.quaternion).multiplyScalar(2);
      l.position.copy(camera.position).add(tmp.current);
      l.target.position.set(0, 0, 0);
      l.target.updateMatrixWorld();
    });
  });
  return (
    <>
      <DreiEnvironment files={"/env/" + look.environment.hdri.split("/").pop()} environmentIntensity={look.environment.intensity} />
      {look.lights.map((L, i) => (
        <directionalLight
          key={L.name}
          ref={(r) => {
            lights.current[i] = r;
          }}
          color={L.color}
          intensity={L.three_intensity}
        />
      ))}
    </>
  );
}
