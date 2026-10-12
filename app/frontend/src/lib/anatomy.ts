// Every mesh / anchor / view / group name the viewer uses, derived from anatomy_map.json (GET /api/anatomy-map).
// Kept in a tiny module-level store so non-React code (raycasting, camera, overlays) reads the same source.
import { create } from "zustand";
import type { AnatomyMap, BodyRegion, NeutralStructure, Vessel, ViewDef } from "../api/types";

export type Names = {
  map: AnatomyMap;
  vessels: { key: Vessel; mesh: string; hit: string; outline: string; short: string; anchor: string; display: string }[];
  vesselKeys: Vessel[];
  heartMeshes: string[];
  heartAnchor: string;
  neutral: NeutralStructure[];
  unmodelledCoronary: NeutralStructure[];
  territoryMeshes: string[];
  regions: BodyRegion[];
  regionMeshes: string[];
  bodyShell: string;
  chestRef: string;
  occluders: string[];
  views: ViewDef[];
  groups: { heart: string; body: string };
  centerlineExtra: string;
  viewTargetExtra: string;
};

export function deriveNames(map: AnatomyMap): Names {
  const vessels = map.vessels.map((v) => {
    const h = map.viewer.vessel_helpers[v.key]!;
    return { key: v.key, mesh: v.mesh_names[0]!, hit: h.hit_proxy_mesh, outline: h.outline_mesh, short: h.short_name, anchor: v.camera_anchor, display: v.display_name };
  });
  return {
    map,
    vessels,
    vesselKeys: vessels.map((v) => v.key),
    heartMeshes: map.heart.mesh_names,
    heartAnchor: map.heart.camera_anchor,
    neutral: map.neutral_structures,
    unmodelledCoronary: map.neutral_structures.filter((n) => n.unmodelled_coronary),
    territoryMeshes: map.territories.entries.flatMap((t) => t.mesh_names),
    regions: map.body_regions,
    regionMeshes: [...new Set(map.body_regions.flatMap((r) => r.mesh_names))],
    bodyShell: map.viewer.body_shell_mesh,
    chestRef: map.viewer.chest_reference_mesh,
    occluders: map.viewer.occluder_meshes,
    views: map.viewer.views,
    groups: map.viewer.groups,
    centerlineExtra: map.viewer.centerline_extra,
    viewTargetExtra: map.viewer.view_target_extra,
  };
}

export const useNames = create<{ names: Names | null; set: (m: AnatomyMap) => void }>((set) => ({
  names: null,
  set: (m) => set({ names: deriveNames(m) }),
}));

/** Non-React access (returns null until the map has loaded). */
export const names = () => useNames.getState().names;

export const vesselOf = (mesh: string) => names()?.vessels.find((v) => v.mesh === mesh || v.hit === mesh || v.outline === mesh);
export const isNeutral = (mesh: string) => names()?.neutral.find((n) => n.mesh_names.includes(mesh));
export const regionOfMesh = (mesh: string) => names()?.regions.find((r) => r.mesh_names.includes(mesh));
export const regionsOfFeature = (feature: string) => names()?.regions.filter((r) => r.features.includes(feature)) ?? [];

/** First view preset (anatomy_map order) for a viewer mode ("heart" | "body"). */
export const firstView = (mode: "heart" | "body") => names()?.views.find((v) => v.mode === mode)?.key ?? "";
export const viewMode = (key: string): "heart" | "body" => names()?.views.find((v) => v.key === key)?.mode ?? "heart";

/** Short credit lines built from anatomy_map.asset.sources + the model-card dataset citation (no typed-in text). */
export function creditParts(map: AnatomyMap | undefined, citation: string | undefined) {
  const src = map?.asset.sources.find((s) => s.attribution && !/none required/i.test(s.attribution));
  const author = (src as { author?: string } | undefined)?.author?.replace(/\s*\(.*\)\s*$/, "");
  const dataset = citation?.match(/\)\.\s*(.*?)\s*\[Dataset\]/)?.[1];
  return { model: src ? { name: src.name, author, license: src.license, url: src.url } : null, dataset };
}
