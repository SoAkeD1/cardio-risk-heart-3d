import { TriangleAlert } from "lucide-react";
import { useStore } from "../../state/store";
import { GroupBreakdown, MeasurementTable } from "../explain/Breakdown";
import { WhyPanel } from "../explain/WhyPanel";
import { EmptyState } from "../onboarding/EmptyState";
import { WhatIfPanel } from "../whatif/WhatIfPanel";
import { SectionHeader } from "./parts";
import { RiskSummary } from "./RiskSummary";
import { WhatChanged } from "./WhatChanged";
import { VesselCards } from "./VesselCards";

/** Right panel: summary · vessel cards · Why? · physiological breakdown · what-if. `only` = mobile tab subset. */
export function ResultsPanel({ only }: { only?: "risk" | "why" | "whatif" }) {
  const prediction = useStore((s) => s.prediction);
  const pending = useStore((s) => s.pending);
  const error = useStore((s) => s.error);
  const warnings = prediction?.warnings.filter((w) => !w.startsWith("region layer")) ?? [];
  const show = (k: "risk" | "why" | "whatif") => !only || only === k;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* subtle progress line while refetching; the previous result stays rendered */}
      <div className="absolute inset-x-0 top-0 z-[5] h-0.5 overflow-hidden" aria-hidden>
        {pending && <div className="h-full w-1/3 animate-[progress_1s_ease-in-out_infinite] bg-accent" />}
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 border-b border-line bg-s2 px-4 py-2 text-xs text-warn">
          <TriangleAlert aria-hidden className="mt-px h-4 w-4 shrink-0" />
          <span>{error} The last valid estimate is still shown.</span>
        </div>
      )}
      {!prediction ? (
        <EmptyState />
      ) : (
        <div className="scroll-y min-h-0 flex-1" data-tour="results" aria-busy={pending}>
          {show("risk") && (
            <>
              <SectionHeader title="Risk summary" />
              <RiskSummary />
              <WhatChanged />
              {warnings.length > 0 && (
                <ul className="mx-4 mb-3 space-y-1 rounded-md border border-line bg-s2 p-2 text-xs text-warn">
                  {warnings.map((w) => (
                    <li key={w} className="flex gap-1.5">
                      <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              <SectionHeader title="Arteries" />
              <VesselCards />
            </>
          )}
          {show("why") && (
            <div data-tour="why">
              <SectionHeader id="why" title="Why? What drives the estimate" />
              <WhyPanel />
              <SectionHeader title="Physiological breakdown" />
              <GroupBreakdown />
              <MeasurementTable />
            </div>
          )}
          {show("whatif") && (
            <>
              <SectionHeader id="whatif" title="What-if" />
              <WhatIfPanel />
            </>
          )}
          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
