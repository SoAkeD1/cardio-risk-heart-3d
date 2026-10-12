// Minimal typed fetch client. Every error becomes an ApiError with the backend's single error shape.
import type {
  AnatomyMap,
  ExamplesResponse,
  FeatureValue,
  Health,
  ModelCard,
  PredictOut,
  SchemaResponse,
  SensitivityOut,
  Target,
  ViewerLook,
  Education,
  WhatIfOut,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
  get offline() {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "offline", "Can't reach the CardioLens server.");
  }
  if (!res.ok) {
    let body: { error?: { code: string; message: string; fields?: Record<string, string> } } = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON (proxy error page) */
    }
    // a 5xx WITHOUT the API's error shape comes from a proxy / gateway (backend down or restarting) -> offline
    if (res.status >= 500 && !body.error) throw new ApiError(0, "offline", "Can't reach the CardioLens server.");
    throw new ApiError(
      res.status,
      body.error?.code ?? "http_error",
      body.error?.message ?? `Request failed (${res.status})`,
      body.error?.fields,
    );
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), signal });

export type Features = Record<string, FeatureValue>;

export const api = {
  health: () => request<Health>("/health"),
  schema: () => request<SchemaResponse>("/schema"),
  examples: () => request<ExamplesResponse>("/examples"),
  modelCard: () => request<ModelCard>("/model-card"),
  anatomyMap: () => request<AnatomyMap>("/anatomy-map"),
  viewerLook: () => request<ViewerLook>("/viewer-look"),
  education: () => request<Education>("/education"),
  predict: (features: Features, focus: Target, signal?: AbortSignal) =>
    post<PredictOut>("/predict", { features, k: 8, focus, show_territories: false }, signal),
  whatIf: (features: Features, changes: Features, focus: Target, signal?: AbortSignal) =>
    post<WhatIfOut>("/what-if", { features, changes, focus }, signal),
  sensitivity: (features: Features, feature: string, signal?: AbortSignal) =>
    post<SensitivityOut>("/sensitivity", { features, feature, n: 15 }, signal),
};
