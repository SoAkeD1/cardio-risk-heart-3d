import { useState } from "react";
import { useAnatomyMap, useFeatureIndex } from "../../api/hooks";
import { TARGETS, type Target } from "../../api/types";
import { useStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { TabsContent, TabsList, TabsRoot } from "../../ui/Tabs";
import { ShapWaterfall } from "./ShapWaterfall";

export const TARGET_LABEL: Record<Target, string> = { cad: "CAD", lad: "LAD", lcx: "LCX", rca: "RCA" };

export function TargetTabs({ children }: { children?: React.ReactNode }) {
  const t = useStore((s) => s.explainTarget);
  const setT = useStore((s) => s.setExplainTarget);
  return (
    <TabsRoot value={t} onValueChange={(v) => setT(v as Target)}>
      <TabsList label="Explain which estimate" items={TARGETS.map((x) => ({ value: x, label: TARGET_LABEL[x] }))} />
      <TabsContent value={t} className="mt-3 space-y-3 outline-none">
        {children}
      </TabsContent>
    </TabsRoot>
  );
}

export function WhyPanel() {
  const p = useStore((s) => s.prediction);
  const t = useStore((s) => s.explainTarget);
  const fx = useFeatureIndex();
  const { data: map } = useAnatomyMap();
  const [all, setAll] = useState(false);
  if (!p) return null;
  const rows = p.contributions[t] ?? [];
  const prob = t === "cad" ? p.prediction.cad.prob : p.prediction[t].prob;
  return (
    <div className="space-y-3 px-4 py-3" data-testid="why-panel">
      <TargetTabs>
        <p className="text-xs leading-snug text-t2">
          Bars show how much each measurement pushed this patient&rsquo;s estimate up or down (SHAP), in probability points.
        </p>
        <ShapWaterfall
          rows={rows}
          prob={prob}
          k={all ? rows.length : 8}
          fx={fx}
          raises={map?.style.regions.raises_color ?? "#E4572E"}
          lowers={map?.style.regions.lowers_color ?? "#3B7DD8"}
        />
        <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Show top 8 only" : `Show all ${rows.length} features`}
        </Button>
      </TargetTabs>
    </div>
  );
}
