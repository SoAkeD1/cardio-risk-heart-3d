// Module-level registry shared by the viewer pieces (and the dev/test hook): loaded nodes by name, the
// glTF parser, and imperative viewer APIs (snapshot, projection).
import type * as THREE from "three";
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
