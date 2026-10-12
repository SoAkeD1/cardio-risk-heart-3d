import { useState } from "react";
import { useAnatomyMap, useFeatureIndex, useTargets } from "../../api/hooks";
import type { Target } from "../../api/types";
import { useStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { TabsContent, TabsList, TabsRoot } from "../../ui/Tabs";
import { ShapWaterfall } from "./ShapWaterfall";

export function TargetTabs({ children }: { children?: React.ReactNode }) {
  const t = useStore((s) => s.explainTarget);
  const setT = useStore((s) => s.setExplainTarget);
  const targets = useTargets();
  return (
    <TabsRoot value={t} onValueChange={(v) => setT(v as Target)}>
      <TabsList label="Explain which estimate" items={targets.map((x) => ({ value: x.key, label: x.label }))} />
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
  const prob = p.prediction[t].prob;
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
          raises={map?.style.regions.raises_color ?? "currentColor"}
          lowers={map?.style.regions.lowers_color ?? "currentColor"}
        />
        <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Show top 8 only" : `Show all ${rows.length} features`}
        </Button>
      </TargetTabs>
    </div>
  );
}
