// Module-level registry shared by the viewer pieces (and the dev/test hook): loaded nodes by name, the
// glTF parser, and imperative viewer APIs (snapshot, projection).
import * as THREE from "three";
import type { GLTF } from "three-stdlib";
import { create } from "zustand";

export const reg = {
  nodes: new Map<string, THREE.Object3D>(),
  meshes: new Map<string, THREE.Mesh>(),
  gltf: null as (GLTF & { parser?: unknown }) | null,
  camera: null as THREE.Camera | null,
  canvas: null as HTMLCanvasElement | null,
  snapshot: null as null | ((opts?: { front?: boolean; scale?: number }) => Promise<string>),
  fps: 0,
};

/** Blender-space view target stored in Extra_View_* extras -> glTF / three.js (Y-up). */
export function viewTarget(node: THREE.Object3D): THREE.Vector3 {
  const t = (node.userData?.target as number[] | undefined) ?? [0, 0, 0];
  const v = new THREE.Vector3(t[0] ?? 0, t[2] ?? 0, -(t[1] ?? 0));
  node.parent?.updateWorldMatrix(true, false);
  return node.parent ? v.applyMatrix4(node.parent.matrixWorld) : v;
}

export function worldPos(name: string): THREE.Vector3 | null {
  const n = reg.nodes.get(name);
  if (!n) return null;
  n.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
}

/** Hover tooltip state (outside React render of the canvas). */
export type HoverTip = { x: number; y: number; key: string; mesh: string } | null;
export const useHoverTip = create<{ tip: HoverTip; set: (t: HoverTip) => void }>((set) => ({
  tip: null,
  set: (tip) => set({ tip }),
}));

/** Load progress / fade state. */
export const useModelStatus = create<{ loaded: boolean; set: (b: boolean) => void }>((set) => ({
  loaded: false,
  set: (loaded) => set({ loaded }),
}));
