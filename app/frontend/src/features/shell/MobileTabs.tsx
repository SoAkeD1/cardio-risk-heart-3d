import type { ReactNode } from "react";
import { useStore } from "../../state/store";
import { TabsContent, TabsList, TabsRoot } from "../../ui/Tabs";
import { PatientPanel } from "../patient/PatientPanel";
import { ResultsPanel } from "../risk/ResultsPanel";

/** < 768 px: canvas (55vh) + tabs Inputs / Risk / Why / What-if. */
export function MobileTabs({ viewer }: { viewer: ReactNode }) {
  const tab = useStore((s) => s.ui.rightTab);
  const setUi = useStore((s) => s.setUi);
  const value = ["inputs", "risk", "why", "whatif"].includes(tab) ? tab : "risk";
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section aria-label="3D heart viewer" className="relative h-[55vh] shrink-0" data-tour="canvas">
        {viewer}
      </section>
      <TabsRoot value={value} onValueChange={(v) => setUi({ rightTab: v })} className="flex min-h-0 flex-1 flex-col bg-s1">
        <div className="border-b border-line p-2">
          <TabsList
            label="Panels"
            items={[
              { value: "inputs", label: "Inputs" },
              { value: "risk", label: "Risk" },
              { value: "why", label: "Why" },
              { value: "whatif", label: "What-if" },
            ]}
          />
        </div>
        <TabsContent value="inputs" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <PatientPanel />
        </TabsContent>
        {(["risk", "why", "whatif"] as const).map((v) => (
          <TabsContent key={v} value={v} className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <div id={v === "risk" ? "results" : undefined} className="flex min-h-0 flex-1 flex-col">
              <ResultsPanel only={v} />
            </div>
          </TabsContent>
        ))}
      </TabsRoot>
    </main>
  );
}
