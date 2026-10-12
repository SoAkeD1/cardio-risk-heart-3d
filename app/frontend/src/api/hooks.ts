// TanStack Query hooks + the live prediction flow (debounce 250 ms, stale requests aborted, last result kept).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useStore, type Val } from "../state/store";
import { LatestOnly, isAbort } from "../lib/debounce";
import { api, ApiError, type Features } from "./client";
import type { FeatureSpec, PredictOut, Target, Vessel } from "./types";
import { useNames } from "../lib/anatomy";

const STATIC = {
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 8,
  retryDelay: (n: number) => Math.min(500 * 2 ** n, 5000),
} as const;

export const useHealth = () =>
  useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 3000, refetchIntervalInBackground: true, retry: false });
export const useSchema = () => useQuery({ queryKey: ["schema"], queryFn: api.schema, ...STATIC });
export const useExamples = () => useQuery({ queryKey: ["examples"], queryFn: api.examples, ...STATIC });
export const useAnatomyMap = () => useQuery({ queryKey: ["anatomy-map"], queryFn: api.anatomyMap, ...STATIC });
export const useViewerLook = () => useQuery({ queryKey: ["viewer-look"], queryFn: api.viewerLook, ...STATIC });
export const useModelCard = (enabled = true) =>
  useQuery({ queryKey: ["model-card"], queryFn: api.modelCard, enabled, ...STATIC });

/** name -> FeatureSpec */
export function useFeatureIndex(): Record<string, FeatureSpec> {
  const { data } = useSchema();
  return useMemo(() => Object.fromEntries((data?.features ?? []).map((f) => [f.name, f])), [data]);
}

export const DEBOUNCE_MS = 250;

/** Drives /api/predict from the store: any patient / focus change -> debounced request; older requests are
 * aborted; the previous prediction stays on screen while pending. */
/** Target entries of a prediction response (keys come from the response itself). */
export function targetProbs(p: PredictOut["prediction"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) if (v && typeof v === "object" && "prob" in v) out[k] = (v as { prob: number }).prob;
  return out;
}

/** Input features whose resolved value differs between two API responses. */
export function changedBetween(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Object.keys(b).filter((k) => String(a[k]) !== String(b[k]));
}

const MAX_FEATURES_PER_CHANGE = 3; // a bigger diff (e.g. a sample load) is not shown as a "change"

/** Drives /api/predict from the store: any patient / focus change -> debounced request (250 ms); older requests are
 * aborted; the previous prediction stays on screen (marked stale while out of date). After a successful response
 * the change vs. the previous response is recorded (features old -> new, Δ per target, tier change). */
export function usePredictionSync() {
  const patient = useStore((s) => s.patient);
  const hasPatient = useStore((s) => s.hasPatient);
  const focus = useStore((s) => s.explainTarget);
  const caseId = useStore((s) => s.caseId);
  const resendNonce = useStore((s) => s.resendNonce);
  const lastCase = useRef<string | undefined>(undefined);
  const latest = useRef(new LatestOnly());
  const mutation = useMutation({
    mutationFn: ({ features, focus, signal }: { features: Features; focus: Target; signal: AbortSignal }) =>
      api.predict(features, focus, signal),
  });
  const { mutateAsync } = mutation;

  useEffect(() => {
    if (!hasPatient || !Object.keys(patient).length) return;
    const st = useStore.getState();
    // a freshly loaded sample is one deliberate action: send it at once; typing / dragging is debounced
    const newCase = !!caseId && caseId !== lastCase.current;
    lastCase.current = caseId;
    if (st.prediction) st.setStale(true); // inputs changed: the shown result is out of date until the response arrives
    const timer = setTimeout(async () => {
      const signal = latest.current.next();
      st.setPending(true);
      const prev = useStore.getState().prediction;
      const t0 = performance.now();
      const payload = { features: patient, focus };
      const changedNow = prev ? changedBetween(prev.resolved_features, patient) : Object.keys(patient);
      try {
        const res = await mutateAsync({ features: patient as Features, focus, signal });
        if (signal.aborted) return;
        const s2 = useStore.getState();
        s2.setPrediction(res);
        s2.setError(undefined);
        s2.setOffline(false);
        s2.setStale(false);
        s2.logRequest({ at: Date.now(), payload, latencyMs: Math.round(performance.now() - t0), status: "ok", changed: changedNow });
        if (prev && !newCase) {
          const feats = changedBetween(prev.resolved_features, res.resolved_features);
          if (feats.length >= 1 && feats.length <= MAX_FEATURES_PER_CHANGE) {
            const a = targetProbs(prev.prediction), b = targetProbs(res.prediction);
            s2.pushChange({
              id: Date.now() + Math.random(),
              at: Date.now(),
              features: feats.map((n) => ({ name: n, old: prev.resolved_features[n] as Val, new: res.resolved_features[n] as Val })),
              deltas: Object.fromEntries(Object.keys(b).map((t) => [t, (b[t] ?? 0) - (a[t] ?? 0)])),
              tierFrom: prev.scene.heart.risk_tier,
              tierTo: res.scene.heart.risk_tier,
            });
          }
        }
        announce(res.scene.heart.cad_prob, res.scene.heart.risk_tier);
      } catch (e) {
        if (isAbort(e) || signal.aborted) {
          st.logRequest({ at: Date.now(), payload, status: "aborted", changed: changedNow });
          return;
        }
        st.logRequest({ at: Date.now(), payload, latencyMs: Math.round(performance.now() - t0), status: "error", changed: changedNow });
        if (e instanceof ApiError) {
          if (e.offline) st.setOffline(true);
          else st.setError(e.message, e.fields);
        } else st.setError("Prediction failed.");
      } finally {
        if (!signal.aborted) st.setPending(false);
      }
    }, newCase ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [patient, hasPatient, focus, caseId, resendNonce, mutateAsync]);

  useEffect(() => () => latest.current.abort(), []);
}

/** Liveness: /api/health every 3 s. When the service comes back after an outage, the banner clears, failed
 * queries (schema, examples, map...) refetch and the current patient is re-sent automatically. */
export function useServiceRecovery() {
  const qc = useQueryClient();
  const health = useHealth();
  const wasDown = useRef(false);
  useEffect(() => {
    const st = useStore.getState();
    if (health.isError) {
      wasDown.current = true;
      if (!st.offline) st.setOffline(true);
      return;
    }
    if (health.data && (wasDown.current || st.offline)) {
      wasDown.current = false;
      st.setOffline(false);
      void qc.refetchQueries({ predicate: (q) => q.state.status === "error" });
      if (st.hasPatient) st.resend();
    }
  }, [health.data, health.isError, health.dataUpdatedAt, health.errorUpdatedAt, qc]);
}

/** What-if: debounced /api/what-if for the current changes. */
export function useWhatIfSync() {
  const patient = useStore((s) => s.patient);
  const whatIf = useStore((s) => s.whatIf);
  const focus = useStore((s) => s.explainTarget);
  const latest = useRef(new LatestOnly());
  const { enabled, changes } = whatIf;
  const key = JSON.stringify(changes);

  useEffect(() => {
    const st = useStore.getState();
    if (!enabled || !Object.keys(changes).length) {
      latest.current.abort();
      if (st.whatIf.result || st.whatIf.pending) st.setWhatIf({ result: undefined, pending: false });
      return;
    }
    const timer = setTimeout(async () => {
      const signal = latest.current.next();
      st.setWhatIf({ pending: true });
      try {
        const res = await api.whatIf(patient as Features, changes, focus, signal);
        if (!signal.aborted) useStore.getState().setWhatIf({ result: res, pending: false, error: undefined });
      } catch (e) {
        if (isAbort(e) || signal.aborted) return;
        useStore.getState().setWhatIf({ pending: false, error: e instanceof Error ? e.message : "What-if failed." });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, patient, focus]);
}

export function useSensitivity(feature: string | undefined, enabled: boolean) {
  const patient = useStore((s) => s.patient);
  return useQuery({
    queryKey: ["sensitivity", feature, patient],
    queryFn: ({ signal }) => api.sensitivity(patient as Features, feature!, signal),
    enabled: enabled && !!feature,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

// polite live region announcement ("Prediction updated: CAD 73%, High tier")
function announce(cad: number, tier: string) {
  const el = document.getElementById("live-region");
  if (el) el.textContent = `Prediction updated: CAD ${Math.round(cad * 100)}%, ${tier} tier.`;
}

/** Vessel keys (anatomy_map order). */
export function useVesselKeys(): Vessel[] {
  return useNames((s) => s.names?.vesselKeys) ?? [];
}

/** Targets in model-card order with short labels: vessels use anatomy_map short names; others the model-card label. */
export function useTargets(): { key: Target; label: string }[] {
  const { data } = useModelCard();
  const helpers = useNames((s) => s.names?.map.viewer.vessel_helpers);
  return useMemo(
    () =>
      (data?.targets ?? []).map((t) => ({
        key: t.key as Target,
        label: helpers?.[t.key]?.short_name ?? t.label.replace(/\s*\([^)]*\)\s*$/, ""),
      })),
    [data, helpers],
  );
}
