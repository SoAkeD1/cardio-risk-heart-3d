// Global app state (Zustand). Only `view` and `ui` are persisted (localStorage, try/catch-wrapped);
// patient inputs and results live in memory only.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PredictOut, Target, Vessel, WhatIfOut } from "../api/types";
import { safeStorage } from "../lib/storage";

export type Val = number | string;
export type Preset = string; // a view key from anatomy_map.viewer.views
export type Look = "realistic" | "clinical";
export type Perf = "auto" | "quality" | "lite";

export type ViewState = {
  mode: "heart" | "body";
  preset: Preset;
  look: Look;
  territories: boolean;
  xray: number;
  heartbeat: boolean;
  turntable: boolean;
  performance: Perf;
  education: boolean; // optional general-education card (off by default)
};
export type UiState = {
  theme: "dark" | "light";
  leftOpen: boolean;
  rightTab: string;
  tourDone: boolean;
  legendOpen: boolean;
};
export type WhatIf = {
  enabled: boolean;
  changes: Record<string, number>;
  result?: WhatIfOut;
  pending: boolean;
  showOnHeart: boolean;
  peek: boolean;
  focusFeature?: string;
  error?: string;
};

/** One input change and its model-estimated effect (all values from the API responses). */
export type ChangeEvent = {
  id: number;
  at: number;
  features: { name: string; old: Val; new: Val }[];
  deltas: Record<string, number>; // target -> new prob - previous prob
  tierFrom?: string;
  tierTo?: string;
};
export type RequestLogEntry = { at: number; payload: unknown; latencyMs?: number; status: "ok" | "error" | "aborted" | "pending"; changed: string[] };

export type State = {
  patient: Record<string, Val>;
  defaults: Record<string, Val>;
  hasPatient: boolean;
  caseId?: string;
  prediction?: PredictOut;
  pending: boolean;
  error?: string;
  fieldErrors: Record<string, string>;
  offline: boolean;
  /** the shown prediction is older than the current inputs or the service is unreachable */
  stale: boolean;
  /** bumped to re-send the current patient (e.g. after the backend comes back) */
  resendNonce: number;
  changeEvent?: ChangeEvent;
  changeHistory: ChangeEvent[];
  requestLog: RequestLogEntry[];
  whatIf: WhatIf;
  selection: { target?: Vessel; hover?: string };
  explainTarget: Target;
  view: ViewState;
  ui: UiState;
  flyTo?: { anchor?: string; preset?: Preset; nonce: number };
  liteActive: boolean;

  setDefaults: (d: Record<string, Val>) => void;
  setField: (name: string, v: Val) => void;
  resetField: (name: string) => void;
  loadCase: (id: string, features: Record<string, Val>) => void;
  resetPatient: () => Record<string, Val>;
  restorePatient: (p: Record<string, Val>, has: boolean) => void;
  setPrediction: (p?: PredictOut) => void;
  setPending: (b: boolean) => void;
  setError: (e?: string, fields?: Record<string, string>) => void;
  setOffline: (b: boolean) => void;
  setStale: (b: boolean) => void;
  resend: () => void;
  pushChange: (e: ChangeEvent) => void;
  logRequest: (e: RequestLogEntry) => void;
  select: (t?: Vessel) => void;
  hover: (h?: string) => void;
  setExplainTarget: (t: Target) => void;
  setView: (v: Partial<ViewState>) => void;
  setUi: (u: Partial<UiState>) => void;
  setWhatIf: (w: Partial<WhatIf>) => void;
  setChange: (name: string, v?: number) => void;
  applyWhatIf: () => void;
  requestFly: (f: { anchor?: string; preset?: Preset }) => void;
  setLiteActive: (b: boolean) => void;
};

export const defaultView: ViewState = {
  mode: "heart",
  preset: "", // empty = first heart view of anatomy_map.viewer.views
  look: "realistic",
  territories: false,
  xray: 0.18,
  heartbeat: true,
  turntable: false,
  performance: "auto",
  education: false,
};
const defaultUi: UiState = { theme: "dark", leftOpen: false, rightTab: "risk", tourDone: false, legendOpen: true };
const emptyWhatIf: WhatIf = { enabled: false, changes: {}, pending: false, showOnHeart: false, peek: false };

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      patient: {},
      defaults: {},
      hasPatient: false,
      pending: false,
      fieldErrors: {},
      offline: false,
      stale: false,
      resendNonce: 0,
      changeHistory: [],
      requestLog: [],
      whatIf: emptyWhatIf,
      selection: {},
      explainTarget: "cad",
      view: defaultView,
      ui: defaultUi,
      liteActive: false,

      setDefaults: (d) => set((s) => ({ defaults: d, patient: Object.keys(s.patient).length ? s.patient : { ...d } })),
      setField: (name, v) =>
        set((s) => ({ patient: { ...s.patient, [name]: v }, hasPatient: true, caseId: undefined })),
      resetField: (name) =>
        set((s) => (name in s.defaults ? { patient: { ...s.patient, [name]: s.defaults[name]! } } : {})),
      loadCase: (id, features) =>
        set((s) => ({
          patient: { ...s.defaults, ...features },
          hasPatient: true,
          caseId: id,
          changeHistory: [],
          changeEvent: undefined,
          whatIf: { ...emptyWhatIf },
          fieldErrors: {},
        })),
      resetPatient: () => {
        const prev = get().patient;
        set((s) => ({ patient: { ...s.defaults }, caseId: undefined, whatIf: { ...emptyWhatIf } }));
        return prev;
      },
      restorePatient: (p, has) => set({ patient: p, hasPatient: has }),
      setPrediction: (p) => set({ prediction: p }),
      setPending: (b) => set({ pending: b }),
      setError: (e, fields) => set({ error: e, fieldErrors: fields ?? {} }),
      setOffline: (b) => set((s) => ({ offline: b, stale: b ? !!s.prediction : s.stale })),
      setStale: (b) => set({ stale: b }),
      resend: () => set((s) => ({ resendNonce: s.resendNonce + 1 })),
      pushChange: (e) => set((s) => ({ changeEvent: e, changeHistory: [e, ...s.changeHistory].slice(0, 5) })),
      logRequest: (e) => set((s) => ({ requestLog: [e, ...s.requestLog].slice(0, 20) })),
      select: (t) =>
        set((s) => ({
          selection: { ...s.selection, target: t },
          explainTarget: t ?? s.explainTarget,
        })),
      hover: (h) => set((s) => (s.selection.hover === h ? {} : { selection: { ...s.selection, hover: h } })),
      setExplainTarget: (t) =>
        set((s) => ({ explainTarget: t, selection: { ...s.selection, target: t === "cad" ? undefined : t } })),
      setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
      setUi: (u) => set((s) => ({ ui: { ...s.ui, ...u } })),
      setWhatIf: (w) => set((s) => ({ whatIf: { ...s.whatIf, ...w } })),
      setChange: (name, v) =>
        set((s) => {
          const changes = { ...s.whatIf.changes };
          if (v === undefined) delete changes[name];
          else changes[name] = v;
          return { whatIf: { ...s.whatIf, changes, focusFeature: name } };
        }),
      applyWhatIf: () =>
        set((s) => {
          const derived = (s.whatIf.result?.derived_updates_applied ?? {}) as Record<string, Val>;
          const clean: Record<string, Val> = {};
          for (const [k, v] of Object.entries(derived)) if (v !== null && v !== undefined) clean[k] = v as Val;
          return {
            patient: { ...s.patient, ...s.whatIf.changes, ...clean },
            hasPatient: true,
            caseId: undefined,
            whatIf: { ...emptyWhatIf, enabled: true },
          };
        }),
      requestFly: (f) => set({ flyTo: { ...f, nonce: Date.now() + Math.random() } }),
      setLiteActive: (b) => set({ liteActive: b }),
    }),
    {
      name: "cardiolens.prefs.v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ view: s.view, ui: s.ui }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          view: { ...current.view, ...(p.view ?? {}), turntable: false, education: false },
          ui: { ...current.ui, ...(p.ui ?? {}), leftOpen: false },
        };
      },
    },
  ),
);

/** Changed-from-default feature names (for "• N changed" chips and the PDF). */
export function changedFields(patient: Record<string, Val>, defaults: Record<string, Val>): string[] {
  return Object.keys(patient).filter((k) => k in defaults && String(patient[k]) !== String(defaults[k]));
}
