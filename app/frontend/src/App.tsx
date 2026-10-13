import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { OpeningAnimation } from "./features/shell/OpeningAnimation";
import { shouldShowOpening } from "./lib/openingSession";
import { useAnatomyMap, useExamples, usePredictionSync, useSchema, useServiceRecovery, useWhatIfSync } from "./api/hooks";
import { useNames } from "./lib/anatomy";
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
import { DebugDrawer } from "./features/shell/DebugDrawer";
import { ExportMenu } from "./features/report/ExportMenu";
import { loadExample } from "./features/patient/SampleMenu";
import { Fallback2D } from "./three/Fallback2D";
import { installTestHooks } from "./test/hooks";

const Viewer = lazy(() => import("./three/Viewer"));
const ModelCardDialog = lazy(() => import("./features/modelcard/ModelCardDialog"));

export default function App() {
  const [opening, setOpening] = useState(shouldShowOpening);
  const finishOpening = useCallback(() => setOpening(false), []);
  useApplyTheme();
  usePredictionSync();
  useServiceRecovery();
  useWhatIfSync();
  const layout = useLayout();
  const schema = useSchema();
  const examples = useExamples();
  const amap = useAnatomyMap();
  const setNames = useNames((s) => s.set);
  useEffect(() => {
    if (amap.data) setNames(amap.data);
  }, [amap.data, setNames]);
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
    <>
    {opening && <OpeningAnimation onComplete={finishOpening} />}
    <div className="cardio-dashboard flex h-full flex-col" aria-hidden={opening || undefined}>
      <a href="#results" className="skip-link">
        Skip to results
      </a>
      <TopBar
        showPanelToggle
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

      <main className="dashboard-columns flex min-h-0 flex-1">
        <aside
          id="patient-overview-sidebar"
          aria-label="Patient overview"
          aria-hidden={!ui.leftOpen}
          {...(!ui.leftOpen ? { inert: "" } : {})}
          className={`patient-dock${ui.leftOpen ? " patient-dock--open" : ""}`}
        >
          <div className="patient-dock-content">
            <div className="column-heading">
              <h2>Patient overview</h2>
              <button aria-label="Close patient overview" className="rounded-md p-2 text-t2 hover:bg-s2" onClick={() => setUi({ leftOpen: false })}><X size={17} aria-hidden /></button>
            </div>
            {patient}
          </div>
        </aside>
        {layout === "mobile" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col"><MobileTabs viewer={viewer} /></div>
        ) : (
          <>
          <section aria-label="3D heart viewer" className="viewer-column relative min-w-0 flex-1" data-tour="canvas">
            <div className="column-heading"><h2>Cardiac visualization</h2></div>
            <div className="heart-stage relative min-h-0 flex-1">{viewer}</div>
          </section>
          {(layout === "desktop" || layout === "laptop") && (
            <aside
              id="results"
              aria-label="Results"
              className={`estimates-column panel flex shrink-0 flex-col border-l ${layout === "desktop" ? "w-[380px]" : "w-[360px]"}`}
            >
              <div className="column-heading"><h2>Artery estimates</h2><span className="heading-chip">{amap.data?.vessels.length ?? "—"} vessels</span></div>
              {results}
            </aside>
          )}
          {layout === "tablet" && <BottomSheet>{results}</BottomSheet>}
          </>
        )}
      </main>

      <DisclaimerStrip />
      <div id="live-region" aria-live="polite" className="sr-only" />
      <DebugDrawer />

      <Suspense fallback={null}>{modelCard && <ModelCardDialog open onOpenChange={setModelCard} />}</Suspense>
      <ShortcutSheet open={shortcuts} onOpenChange={setShortcuts} />
      {tourOpen && !opening && (
        <Tour
          onClose={() => {
            setTourOpen(false);
            setUi({ tourDone: true });
          }}
        />
      )}
    </div>
    </>
  );
}
