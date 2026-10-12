import * as DM from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ClipboardCopy, FileDown, ImageDown, Share } from "lucide-react";
import { useState } from "react";
import { useAnatomyMap, useFeatureIndex, useSchema } from "../../api/hooks";
import { changedFields, useStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/Toast";
import { composeSnapshot, downloadDataUrl } from "../../three/snapshot";
import { summaryText } from "./copySummary";

export function ExportMenu() {
  const prediction = useStore((s) => s.prediction);
  const { data: schema } = useSchema();
  const { data: map } = useAnatomyMap();
  const fx = useFeatureIndex();
  const [busy, setBusy] = useState(false);
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  const pdf = async () => {
    if (!prediction || !schema) return;
    setBusy(true);
    try {
      const st = useStore.getState();
      let snapshot: string | null = null;
      try {
        snapshot = await composeSnapshot({ front: true, scale: 2, legend: prediction.scene.legend, jpeg: true });
      } catch {
        snapshot = null; // no WebGL: the PDF falls back to an artery table
      }
      const { buildReportPdf } = await import("./buildReportPdf");
      const blob = await buildReportPdf({
        prediction,
        schema,
        map,
        patient: st.patient,
        changed: changedFields(st.patient, st.defaults),
        snapshot,
        whatIf: st.whatIf.enabled ? st.whatIf.result : null,
        whatIfChanges: st.whatIf.enabled ? st.whatIf.changes : undefined,
      });
      downloadDataUrl(URL.createObjectURL(blob), `cardiolens-report-${stamp()}.pdf`);
    } catch (e) {
      toast({ title: "Could not create the PDF", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const png = async () => {
    try {
      downloadDataUrl(
        await composeSnapshot({ legend: prediction?.scene.legend ?? null, stops: map?.style.color_scale.stops.map(([p, color]) => ({ p, color })) }),
        `cardiolens-${stamp()}.png`,
      );
    } catch (e) {
      toast({ title: "Screenshot failed", description: (e as Error).message });
    }
  };
  const copy = async () => {
    if (!prediction) return;
    try {
      await navigator.clipboard.writeText(summaryText(prediction, fx));
      toast({ title: "Summary copied to the clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "The browser blocked clipboard access." });
    }
  };

  const item = "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-t1 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-s2";
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <Button variant="ghost" aria-label="Export" disabled={busy} data-testid="export-menu" className="px-2 md:px-3">
          <Share aria-hidden className="h-4 w-4" />
          <span className="hidden md:inline">{busy ? "Preparing…" : "Export"}</span>
          <ChevronDown aria-hidden className="hidden h-4 w-4 opacity-70 md:inline" />
        </Button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-[70] w-60 rounded-lg border border-line bg-s1 p-1 shadow-soft">
          <DM.Item className={item} disabled={!prediction} onSelect={pdf} data-testid="export-pdf">
            <FileDown aria-hidden className="h-4 w-4 text-t2" /> PDF report
          </DM.Item>
          <DM.Item className={item} onSelect={png}>
            <ImageDown aria-hidden className="h-4 w-4 text-t2" /> PNG screenshot
          </DM.Item>
          <DM.Item className={item} disabled={!prediction} onSelect={copy}>
            <ClipboardCopy aria-hidden className="h-4 w-4 text-t2" /> Copy summary
          </DM.Item>
          {!prediction && <p className="px-3 pb-2 pt-1 text-xs text-t3">Load a patient to enable the report.</p>}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
