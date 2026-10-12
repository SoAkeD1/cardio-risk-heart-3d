import { ChevronDown, Undo2 } from "lucide-react";
import { useState } from "react";
import { useFeatureIndex, useTargets } from "../../api/hooks";
import { featureValue } from "../../lib/format";
import { useStore } from "../../state/store";

const ptsShort = (d: number) => {
  const v = d * 100;
  if (Math.abs(v) < 0.5) return "0";
  return `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v))}`;
};

/** Last 5 input changes with the model-estimated Δ per target (from consecutive API responses). Click = revert. */
export function WhatChanged() {
  const history = useStore((s) => s.changeHistory);
  const setField = useStore((s) => s.setField);
  const fx = useFeatureIndex();
  const targets = useTargets();
  const [open, setOpen] = useState(true);
  if (!history.length) return null;
  return (
    <section className="mx-4 mb-3 rounded-md border border-line bg-s2" data-testid="what-changed" aria-label="What changed">
      <button className="flex h-9 w-full items-center justify-between px-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-t2" aria-expanded={open} onClick={() => setOpen(!open)}>
        What changed
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="divide-y divide-[var(--border)] border-t border-line">
          {history.map((h) => {
            const f = h.features[0]!;
            const spec = fx[f.name];
            return (
              <li key={h.id}>
                <button
                  className="group flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-s3"
                  title="Revert this change"
                  onClick={() => setField(f.name, f.old)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t1">
                      <span className="font-medium">{spec?.label ?? f.name}</span>{" "}
                      <span className="text-t2">
                        {featureValue(f.old, spec)} → {featureValue(f.new, spec)}
                      </span>
                    </span>
                    <span className="num mt-0.5 block text-t2">
                      {targets.map((t) => `${t.label} ${ptsShort(h.deltas[t.key] ?? 0)}`).join(" · ")} pts
                      {h.tierFrom !== h.tierTo ? ` · tier ${h.tierFrom} → ${h.tierTo}` : ""}
                    </span>
                  </span>
                  <Undo2 aria-label="revert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t3 group-hover:text-t1" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
