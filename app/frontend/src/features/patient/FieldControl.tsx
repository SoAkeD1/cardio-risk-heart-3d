import { Info, TriangleAlert } from "lucide-react";
import type { FeatureSpec } from "../../api/types";
import { useTargets } from "../../api/hooks";
import { featureValue, num } from "../../lib/format";
import { useStore, type Val } from "../../state/store";
import { NumberField } from "../../ui/NumberField";
import { Segmented } from "../../ui/Segmented";
import { Slider } from "../../ui/Slider";
import { Toggle } from "../../ui/Toggle";
import { Tooltip } from "../../ui/Tooltip";

const isYes = (v: Val | undefined) => ["1", "y", "yes", "true"].includes(String(v).toLowerCase());

export function optionLabel(f: FeatureSpec, v: string | number): string {
  const s = String(v);
  if (f.value_labels && s in f.value_labels) return f.value_labels[s]!;
  return s;
}

/** Picks the control from the schema type: binary -> Toggle, <= 4 options -> Segmented, else Select,
 * numeric -> Slider + NumberField (normal-range band, extrapolation note). */
export function FieldControl({ f }: { f: FeatureSpec }) {
  const value = useStore((s) => s.patient[f.name]);
  const def = useStore((s) => s.defaults[f.name]);
  const err = useStore((s) => s.fieldErrors[f.name]);
  const setField = useStore((s) => s.setField);
  const resetField = useStore((s) => s.resetField);
  const changed = def !== undefined && value !== undefined && String(value) !== String(def);
  const id = `f-${f.name}`;
  const nr = f.normal_range && f.normal_range.length === 2 ? (f.normal_range as [number, number]) : null;
  const help = (
    <span>
      {f.help}
      {nr && (
        <>
          <br />
          <span className="text-t2">
            Typical adult range: {num(nr[0], f.step ?? 1)}–{num(nr[1], f.step ?? 1)} {f.unit}
          </span>
        </>
      )}
      {!f.used_by_model && (
        <>
          <br />
          <span className="text-t2">Not used by the model (constant in the training data).</span>
        </>
      )}
    </span>
  );

  const label = (
    <div className="flex min-w-0 items-center gap-1.5">
      <label
        htmlFor={id}
        className="min-w-0 truncate text-[13px] text-t1"
        title="Alt+click to reset to the default"
        onClick={(e) => {
          if (e.altKey) {
            e.preventDefault();
            resetField(f.name);
          }
        }}
      >
        {f.label}
      </label>
      {changed && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="changed from default" role="img" />
      )}
      <Tooltip content={help}>
        <button type="button" aria-label={`About ${f.label}`} className="shrink-0 rounded text-t3 hover:text-t1">
          <Info className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      {f.effect_strength != null && <EffectMeter f={f} />}
    </div>
  );

  let control: JSX.Element;
  if (f.type === "numeric") {
    const v = typeof value === "number" ? value : Number(value ?? f.default);
    const outside = f.min != null && f.max != null && (v < f.min || v > f.max);
    control = (
      <>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Slider
              label={f.label}
              value={v}
              min={f.min!}
              max={f.max!}
              step={f.step ?? 1}
              band={nr}
              onChange={(x) => setField(f.name, Number(x.toFixed(4)))}
            />
          </div>
          <div className="w-[104px] shrink-0">
            <NumberField
              id={id}
              label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}
              value={v}
              min={f.hard_min}
              max={f.hard_max}
              step={f.step}
              unit={f.unit}
              invalid={!!err}
              onCommit={(x) => setField(f.name, x)}
            />
          </div>
        </div>
        {outside && !err && (
          <p className="mt-1 flex items-center gap-1 text-xs text-warn">
            <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Outside the training range ({num(f.min!, f.step ?? 1)}–{num(f.max!, f.step ?? 1)}): extrapolation, interpret with caution.
          </p>
        )}
      </>
    );
  } else if (f.type === "binary" && !f.value_labels) {
    const on = isYes(value);
    control = (
      <div className="flex items-center gap-2">
        <span className="w-7 text-right text-xs text-t2">{on ? "Yes" : "No"}</span>
        <Toggle id={id} label={f.label} checked={on} onChange={(b) => setField(f.name, b ? 1 : 0)} disabled={!f.used_by_model} />
      </div>
    );
  } else {
    const opts = (f.allowed_values ?? []).map((a) => ({ value: String(a), label: optionLabel(f, a) }));
    const asNum = (s: string) => ((f.allowed_values ?? []).some((a) => typeof a === "number") ? Number(s) : s);
    const cur = String(value ?? f.default);
    control =
      opts.length <= 4 ? (
        <Segmented size="sm" label={f.label} value={cur} options={opts} onChange={(s) => setField(f.name, asNum(s) as Val)} />
      ) : (
        <select
          id={id}
          value={cur}
          onChange={(e) => setField(f.name, asNum(e.target.value) as Val)}
          className="h-8 w-full rounded-md border border-line bg-s2 px-2 text-sm text-t1"
        >
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
  }

  const inline = f.type === "binary" && !f.value_labels;
  return (
    <div className="py-2" data-field={f.name}>
      {inline ? (
        <div className="flex items-center justify-between gap-3">
          {label}
          {control}
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            {label}
            {f.type !== "numeric" && changed && <span className="text-[11px] text-t3">default {featureValue(def, f, false)}</span>}
          </div>
          {control}
        </>
      )}
      {err && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-warn">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {err}
        </p>
      )}
    </div>
  );
}

/** 0-3 bars from artifacts/feature_response.json (served as effect_strength by /api/schema). */
function EffectMeter({ f }: { f: FeatureSpec }) {
  const n = f.effect_strength ?? 0;
  const pts = f.effect_max_pts ?? {};
  const targets = useTargets();
  const tip = (
    <span>
      How much this input can change this model&rsquo;s estimates.
      <br />
      <span className="text-t2">
        {n === 0
          ? "Little effect on any estimate."
          : `Up to ${targets.map((t) => `${t.label} ${Math.round(pts[t.key] ?? 0)}`).join(" · ")} pts across the sample patients.`}
      </span>
    </span>
  );
  return (
    <Tooltip content={tip}>
      <span role="img" aria-label={`Effect on the estimate: ${n} of 3`} data-effect={n} className="ml-auto flex h-3 shrink-0 items-end gap-[2px] pl-1">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= n ? "bg-[rgb(var(--text-2))]" : "bg-s3"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
    </Tooltip>
  );
}
