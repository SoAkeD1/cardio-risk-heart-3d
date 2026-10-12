// TanStack Query hooks + the live prediction flow (debounce 250 ms, stale requests aborted, last result kept).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store";
import { LatestOnly, isAbort } from "../lib/debounce";
import { api, ApiError, type Features } from "./client";
import type { FeatureSpec, Target } from "./types";

const STATIC = {
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 8,
  retryDelay: (n: number) => Math.min(500 * 2 ** n, 5000),
} as const;

export const useHealth = () =>
  useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 15000, retry: false });
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
export function usePredictionSync() {
  const patient = useStore((s) => s.patient);
  const hasPatient = useStore((s) => s.hasPatient);
  const focus = useStore((s) => s.explainTarget);
  const caseId = useStore((s) => s.caseId);
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
    const immediate = !!caseId && caseId !== lastCase.current;
    lastCase.current = caseId;
    const timer = setTimeout(async () => {
      const signal = latest.current.next();
      st.setPending(true);
      try {
        const res = await mutateAsync({ features: patient as Features, focus, signal });
        if (signal.aborted) return;
        st.setPrediction(res);
        st.setError(undefined);
        st.setOffline(false);
        announce(res.scene.heart.cad_prob, res.scene.heart.risk_tier);
      } catch (e) {
        if (isAbort(e) || signal.aborted) return;
        if (e instanceof ApiError) {
          if (e.offline) st.setOffline(true);
          else st.setError(e.message, e.fields);
        } else st.setError("Prediction failed.");
      } finally {
        if (!signal.aborted) st.setPending(false);
      }
    }, immediate ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [patient, hasPatient, focus, caseId, mutateAsync]);

  useEffect(() => () => latest.current.abort(), []);
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
