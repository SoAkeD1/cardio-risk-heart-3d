// three.js-dependent helpers (kept out of registry.ts so the entry chunk never pulls in three.js)
import * as THREE from "three";
import { reg } from "./registry";

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

