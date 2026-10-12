// Friendly aliases over the generated OpenAPI types (src/api/types.gen.ts, from scripts/gen_types.py).
import type { components } from "./types.gen";

type S = components["schemas"];
export type Health = S["Health"];
export type SchemaResponse = S["SchemaResponse"];
export type FeatureSpec = S["FeatureSpec"];
export type Group = S["Group"];
export type Example = S["Example"];
export type ExamplesResponse = S["ExamplesResponse"];
export type PredictIn = S["PredictIn"];
export type PredictOut = S["PredictOut"];
export type Prediction = S["Prediction"];
export type Contribution = S["Contribution"];
export type Scene = S["Scene"];
export type SceneMesh = S["SceneMesh"];
export type SceneVessel = S["SceneVessel"];
export type SceneRegion = S["SceneRegion"];
export type WhatIfOut = S["WhatIfOut"];
export type SensitivityOut = S["SensitivityOut"];
export type ModelCard = S["ModelCard"];
export type TargetCard = S["TargetCard"];
export type ErrorBody = S["ErrorBody"];

export type Target = "cad" | "lad" | "lcx" | "rca";
export type Vessel = "lad" | "lcx" | "rca";
export const VESSELS: Vessel[] = ["lad", "lcx", "rca"];
export const TARGETS: Target[] = ["cad", "lad", "lcx", "rca"];
export type FeatureValue = number | string;

/** The parts of anatomy_map.json the UI reads (served by GET /api/anatomy-map). */
export type AnatomyMap = {
  vessels: { key: Vessel; mesh_names: string[]; display_name: string; short_description: string; camera_anchor: string }[];
  neutral_structures: { name?: string; mesh_names: string[]; color: string; opacity: number; tooltip: string }[];
  heart: { mesh_names: string[]; camera_anchor: string };
  body_regions: { region: string; display_name: string; mesh_names: string[]; camera_anchor: string; features: string[] }[];
  territories: { assumption: string; tooltip: string; entries: { key: Vessel; mesh_names: string[]; aha_segments: number[] }[] };
  modifiable: { features: string[]; note: string; derived_updates: string };
  style: {
    color_scale: { stops: [number, string][]; meaning: string };
    vessel: { outline_color: string; badge_text: string };
    territory: { opacity: number };
    heart_tiers: Record<string, { color: string; emissive: number; pulse_hz: number }>;
    reliability: { badge: string; min_auc: number }[];
    regions: { raises_color: string; lowers_color: string };
  };
  asset: { sources: { name: string; attribution?: string; url?: string; license?: string }[] };
};

export type ViewerLook = {
  background: { center: string; edge: string; radius: number };
  environment: { hdri: string; name: string; author: string; license: string; source: string; intensity: number };
  lights: { name: string; direction: [number, number, number]; color: string; three_intensity: number }[];
  renderer: { exposure: number };
  camera: { vfov_deg: number; near: number; far: number };
};
