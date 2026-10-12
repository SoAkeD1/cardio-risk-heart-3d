import { ArrowDown, ArrowUp, Info, RotateCcw } from "lucide-react";
import { useAnatomyMap, useFeatureIndex, useTargets } from "../../api/hooks";
import type { FeatureSpec } from "../../api/types";
import { num, pct, pts } from "../../lib/format";
import { useStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { NumberField } from "../../ui/NumberField";
import { Slider } from "../../ui/Slider";
import { Toggle } from "../../ui/Toggle";
import { SensitivityChart } from "./SensitivityChart";

const isYes = (v: unknown) => ["1", "y", "yes", "true"].includes(String(v).toLowerCase());

function WhatIfField({ f }: { f: FeatureSpec }) {
  const base = useStore((s) => s.patient[f.name]);
  const change = useStore((s) => s.whatIf.changes[f.name]);
  const setChange = useStore((s) => s.setChange);
  const setWhatIf = useStore((s) => s.setWhatIf);
  const focus = useStore((s) => s.whatIf.focusFeature);
  const set = (v: number) => setChange(f.name, String(v) === String(base) ? undefined : v);
  if (f.type === "binary") {
    const on = change !== undefined ? change === 1 : isYes(base);
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-[13px] text-t1">
          {f.label}
          {change !== undefined && <span className="ml-1.5 text-xs text-t3">(was {isYes(base) ? "Yes" : "No"})</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="w-7 text-right text-xs text-t2">{on ? "Yes" : "No"}</span>
          <Toggle label={`What-if ${f.label}`} checked={on} onChange={(b) => set(b ? 1 : 0)} />
        </div>
      </div>
    );
  }
  const v = change ?? Number(base);
  return (
    <div
      className={`-mx-2 rounded-md px-2 py-2 ${focus === f.name ? "bg-s2" : ""}`}
      onPointerDown={() => setWhatIf({ focusFeature: f.name })} onFocus={() => setWhatIf({ focusFeature: f.name })}>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-t1">{f.label}</span>
        {change !== undefined && (
          <span className="num text-xs text-t3">
            was {num(Number(base), f.step ?? 1)} {f.unit}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Slider
            label={`What-if ${f.label}`}
            value={v}
            min={f.min!}
            max={f.max!}
            step={f.step ?? 1}
            band={f.normal_range && f.normal_range.length === 2 ? (f.normal_range as [number, number]) : null}
            onChange={(x) => set(Number(x.toFixed(4)))}
          />
        </div>
        <div className="w-[100px] shrink-0">
          <NumberField label={`What-if ${f.label}`} value={v} min={f.hard_min} max={f.hard_max} step={f.step} unit={f.unit} onCommit={set} />
        </div>
      </div>
    </div>
  );
}

export function DeltaTable() {
  const r = useStore((s) => s.whatIf.result);
  const pending = useStore((s) => s.whatIf.pending);
  const { data: map } = useAnatomyMap();
  const targets = useTargets();
  if (!r) return <p className="py-2 text-xs text-t2">Move a slider to see the model-estimated change.</p>;
  return (
    <table className="w-full text-xs" data-testid="delta-table" aria-busy={pending}>
      <thead className="text-left text-t2">
        <tr>
          <th scope="col" className="py-1 font-medium">Target</th>
          <th scope="col" className="py-1 text-right font-medium">Before</th>
          <th scope="col" className="py-1 text-right font-medium">After</th>
          <th scope="col" className="py-1 text-right font-medium">Δ</th>
        </tr>
      </thead>
      <tbody>
        {targets.map(({ key: t, label }) => {
          const d = r.delta[t] ?? 0;
          return (
            <tr key={t} className="border-t border-line" data-testid={`delta-${t}`}>
              <td className="py-1.5 font-medium text-t1">{label}</td>
              <td className="py-1.5 text-right text-t2">{pct(r.before[t].prob)}</td>
              <td className="py-1.5 text-right text-t1">{pct(r.after[t].prob)}</td>
              <td className="py-1.5 text-right">
                <span className="inline-flex items-center gap-0.5 text-t1">
                  {d > 0.0005 ? (
                    <ArrowUp aria-label="up" className="h-3 w-3" style={{ color: map?.style.regions.raises_color }} />
                  ) : d < -0.0005 ? (
                    <ArrowDown aria-label="down" className="h-3 w-3" style={{ color: map?.style.regions.lowers_color }} />
                  ) : null}
                  {pts(d)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function WhatIfPanel() {
  const { data: map } = useAnatomyMap();
  const fx = useFeatureIndex();
  const w = useStore((s) => s.whatIf);
  const setWhatIf = useStore((s) => s.setWhatIf);
  const apply = useStore((s) => s.applyWhatIf);
  const patient = useStore((s) => s.patient);
  const feats = (map?.modifiable.features ?? []).map((n) => fx[n]).filter((f): f is FeatureSpec => !!f);
  const focus = w.focusFeature && fx[w.focusFeature]?.type === "numeric" ? w.focusFeature : feats.find((f) => f.type === "numeric")?.name;
  const nChanges = Object.keys(w.changes).length;
  return (
    <div className="space-y-3 px-4 py-3" data-tour="whatif" data-testid="whatif-panel">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="whatif-toggle" className="text-sm font-medium">
          Explore what-if
        </label>
        <Toggle id="whatif-toggle" label="Explore what-if" checked={w.enabled} onChange={(b) => setWhatIf({ enabled: b, ...(b ? {} : { showOnHeart: false }) })} />
      </div>
      <p className="flex gap-1.5 rounded-md border border-line bg-s2 p-2 text-xs leading-snug text-t2">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Model-estimated change only — correlational, not a treatment effect.
          {map && <span className="mt-1 block text-t3">{map.modifiable.derived_updates}</span>}
        </span>
      </p>
      {w.enabled && (
        <>
          <div className="divide-y divide-[var(--border)]">
            {feats.map((f) => (
              <WhatIfField key={f.name} f={f} />
            ))}
          </div>
          {w.error && <p className="text-xs text-warn">{w.error}</p>}
          <DeltaTable />
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="whatif-heart" className="text-[13px] text-t1">
              Show on heart
            </label>
            <Toggle id="whatif-heart" label="Show what-if on the heart" checked={w.showOnHeart} disabled={!w.result} onChange={(b) => setWhatIf({ showOnHeart: b })} />
          </div>
          {focus && <SensitivityChart key={`${focus}-${JSON.stringify(patient).length}`} feature={focus} current={w.changes[focus] ?? Number(patient[focus])} />}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!nChanges || !w.result} onClick={apply}>
              Apply to patient
            </Button>
            <Button size="sm" variant="ghost" disabled={!nChanges} onClick={() => setWhatIf({ changes: {}, result: undefined, showOnHeart: false })}>
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              Reset what-if
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
