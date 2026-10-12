import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useExamples, usePredictionSync, useSchema, useWhatIfSync } from "./api/hooks";
import { useStore, type Val } from "./state/store";
import { useLayout } from "./lib/useBreakpoint";
import { hasWebGL } from "./lib/device";
import { TopBar } from "./features/shell/TopBar";
import { StatusBanner } from "./features/shell/StatusBanner";
import { DisclaimerStrip } from "./features/shell/DisclaimerStrip";
import { useApplyTheme } from "./features/shell/ThemeToggle";
import { ShortcutSheet, useGlobalShortcuts } from "./features/shell/Shortcuts";
import { PatientPanel } from "./features/patient/PatientPanel";
import { ResultsPanel } from "./features/risk/ResultsPanel";
import { MobileTabs } from "./features/shell/MobileTabs";
import { BottomSheet } from "./features/shell/BottomSheet";
import { Tour } from "./features/onboarding/Tour";
import { ExportMenu } from "./features/report/ExportMenu";
import { loadExample } from "./features/patient/SampleMenu";
import { Sheet } from "./ui/Sheet";
import { Fallback2D } from "./three/Fallback2D";
import { installTestHooks } from "./test/hooks";

const Viewer = lazy(() => import("./three/Viewer"));
const ModelCardDialog = lazy(() => import("./features/modelcard/ModelCardDialog"));

export default function App() {
  useApplyTheme();
  usePredictionSync();
  useWhatIfSync();
  const layout = useLayout();
  const schema = useSchema();
  const examples = useExamples();
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const setDefaults = useStore((s) => s.setDefaults);
  const [modelCard, setModelCard] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [viewerKey, setViewerKey] = useState(0);
  const webgl = useMemo(() => hasWebGL() && !new URLSearchParams(location.search).has("nowebgl"), []);
  // the 3D stack (three.js + R3F, ~300 KB gz + model decode) starts once the dashboard has painted
  const [mount3d, setMount3d] = useState(false);
  const hasPrediction = useStore((s) => !!s.prediction);
  useEffect(() => {
    if (mount3d) return;
    const go = () => setMount3d(true);
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    // opening a shared/sample link (?case=): let its first estimate paint before the 3D stack initialises
    const waitingForCase = new URLSearchParams(location.search).has("case") && !hasPrediction;
    const delay = waitingForCase ? 4000 : hasPrediction ? 250 : 400;
    const t = setTimeout(() => (ric ? ric(go, { timeout: 1000 }) : go()), delay);
    return () => clearTimeout(t);
  }, [mount3d, hasPrediction]);

  useGlobalShortcuts({ onShortcuts: () => setShortcuts((o) => !o) });
  useEffect(() => installTestHooks(), []);

  // schema defaults -> store
  useEffect(() => {
    if (!schema.data) return;
    const d: Record<string, Val> = {};
    for (const f of schema.data.features) if (f.default !== null && f.default !== undefined) d[f.name] = f.default as Val;
    setDefaults(d);
  }, [schema.data, setDefaults]);

  // ?case=<exampleId> loads a sample
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("case");
    const e = examples.data?.examples.find((x) => x.id === id);
    if (e && useStore.getState().caseId !== id) loadExample(e); // example features are complete: no need to wait for the schema
  }, [examples.data]);

  // first visit: the tour (skippable, remembered)
  useEffect(() => {
    if (!ui.tourDone && !new URLSearchParams(location.search).has("notour")) {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [ui.tourDone]);

  const viewer = !mount3d ? (
    <div className="canvas-bg h-full w-full" />
  ) : webgl ? (
    <Suspense fallback={<div className="canvas-bg h-full w-full" />}>
      <Viewer
        key={viewerKey}
        onModelError={() => setModelError(true)}
        onModelLoaded={() => setModelError(false)}
      />
    </Suspense>
  ) : (
    <Fallback2D />
  );
  const patient = <PatientPanel />;
  const results = <ResultsPanel />;

  return (
    <div className="flex h-full flex-col">
      <a href="#results" className="skip-link">
        Skip to results
      </a>
      <TopBar
        showPanelToggle={layout !== "desktop" && layout !== "mobile"}
        onModelCard={() => setModelCard(true)}
        onShortcuts={() => setShortcuts(true)}
        onHelp={() => {
          setUi({ tourDone: false });
          setTourOpen(true);
        }}
        exportMenu={<ExportMenu />}
      />
      <StatusBanner
        noWebGL={!webgl}
        modelError={modelError}
        onRetryModel={() => {
          setModelError(false);
          setViewerKey((k) => k + 1);
        }}
      />

      {layout === "mobile" ? (
        <MobileTabs viewer={viewer} />
      ) : (
        <main className="flex min-h-0 flex-1">
          {layout === "desktop" && (
            <aside aria-label="Patient inputs" className="panel flex w-[340px] shrink-0 flex-col border-r">
              {patient}
            </aside>
          )}
          <section aria-label="3D heart viewer" className="relative min-w-0 flex-1" data-tour="canvas">
            {viewer}
          </section>
          {(layout === "desktop" || layout === "laptop") && (
            <aside
              id="results"
              aria-label="Results"
              className={`panel flex shrink-0 flex-col border-l ${layout === "desktop" ? "w-[380px]" : "w-[360px]"}`}
            >
              {results}
            </aside>
          )}
          {layout === "tablet" && <BottomSheet>{results}</BottomSheet>}
        </main>
      )}

      {layout !== "desktop" && layout !== "mobile" && (
        <Sheet open={ui.leftOpen} onOpenChange={(o) => setUi({ leftOpen: o })} title="Patient">
          {patient}
        </Sheet>
      )}

      <DisclaimerStrip />
      <div id="live-region" aria-live="polite" className="sr-only" />

      <Suspense fallback={null}>{modelCard && <ModelCardDialog open onOpenChange={setModelCard} />}</Suspense>
      <ShortcutSheet open={shortcuts} onOpenChange={setShortcuts} />
      {tourOpen && (
        <Tour
          onClose={() => {
            setTourOpen(false);
            setUi({ tourDone: true });
          }}
        />
      )}
    </div>
  );
}
