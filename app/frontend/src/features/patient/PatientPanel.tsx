import { RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSchema } from "../../api/hooks";
import { changedFields, useStore } from "../../state/store";
import { AccordionItem, AccordionRoot } from "../../ui/Accordion";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { toast } from "../../ui/Toast";
import { FieldControl } from "./FieldControl";
import { SampleMenu } from "./SampleMenu";

export function PatientPanel() {
  const { data: schema, isLoading } = useSchema();
  const patient = useStore((s) => s.patient);
  const defaults = useStore((s) => s.defaults);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string[]>(["demographic"]);
  const changed = useMemo(() => new Set(changedFields(patient, defaults)), [patient, defaults]);

  const groups = useMemo(() => {
    if (!schema) return [];
    const needle = q.trim().toLowerCase();
    return [...schema.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        ...g,
        fields: schema.features.filter(
          (f) => f.group === g.key && (!needle || f.label.toLowerCase().includes(needle) || f.name.includes(needle)),
        ),
      }))
      .filter((g) => g.fields.length);
  }, [schema, q]);

  const reset = () => {
    const st = useStore.getState();
    const prev = st.resetPatient();
    const had = st.hasPatient;
    toast({
      title: "Patient reset to defaults",
      action: { label: "Undo", run: () => useStore.getState().restorePatient(prev, had) },
    });
  };

  return (
    <div className="patient-controls flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">Patient</h2>
          <SampleMenu compact />
          <Button size="sm" variant="ghost" onClick={reset} aria-label="Reset all inputs to defaults">
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-s2 px-2 focus-within:ring-2 focus-within:ring-[rgb(var(--focus))]">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-t3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search measurements…"
            aria-label="Search measurements"
            className="min-w-0 flex-1 bg-transparent text-sm text-t1 outline-none placeholder:text-t3 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button aria-label="Clear search" onClick={() => setQ("")} className="text-t3 hover:text-t1">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="scroll-y min-h-0 flex-1" data-testid="patient-panel">
        {isLoading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
        <AccordionRoot type="multiple" value={q ? groups.map((g) => g.key) : open} onValueChange={(v) => !q && setOpen(v)}>
          {groups.map((g) => {
            const n = g.fields.filter((f) => changed.has(f.name)).length;
            return (
              <AccordionItem
                key={g.key}
                value={g.key}
                title={g.label}
                aside={
                  n > 0 ? (
                    <span className="num shrink-0 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-medium text-t2">• {n} changed</span>
                  ) : null
                }
              >
                <div className="divide-y divide-[var(--border)]">
                  {g.fields.map((f) => (
                    <FieldControl key={f.name} f={f} />
                  ))}
                </div>
              </AccordionItem>
            );
          })}
        </AccordionRoot>
        {schema && !groups.length && <p className="p-4 text-sm text-t2">No measurement matches &ldquo;{q}&rdquo;.</p>}
        <p className="px-4 py-3 text-xs text-t3">
          Dot = changed from the dataset default · Alt+click a label to reset it. Inputs stay in this browser tab only.
        </p>
      </div>
      <div className="patient-reset shrink-0 p-3">
        <Button variant="secondary" onClick={reset} className="w-full"><RotateCcw aria-hidden className="h-4 w-4" />Reset measurements</Button>
      </div>
    </div>
  );
}
