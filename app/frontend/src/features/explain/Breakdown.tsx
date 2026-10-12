import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, MoveDown, MoveUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useAnatomyMap, useFeatureIndex, useSchema } from "../../api/hooks";
import type { Contribution, FeatureSpec } from "../../api/types";
import { featureValue, num } from "../../lib/format";
import { useStore } from "../../state/store";
import { useTargets } from "../../api/hooks";

/** 6 physiological groups: share of total |attribution| for the selected target. */
export function GroupBreakdown() {
  const p = useStore((s) => s.prediction);
  const t = useStore((s) => s.explainTarget);
  const { data: schema } = useSchema();
  const label = useTargets().find((x) => x.key === t)?.label ?? "";
  if (!p || !schema) return null;
  const g = p.prediction.group_contributions[t] ?? {};
  const max = Math.max(1, ...Object.values(g));
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-xs text-t2">Share of the {label} explanation coming from each group of measurements.</p>
      <div className="space-y-1.5" role="table" aria-label="Contribution by physiological group">
        {[...schema.groups]
          .sort((a, b) => (g[b.key] ?? 0) - (g[a.key] ?? 0))
          .map((grp) => (
            <div key={grp.key} role="row" className="grid grid-cols-[156px_1fr_40px] items-center gap-2 text-xs">
              <span role="cell" className="truncate text-t1">
                {grp.label}
              </span>
              <span role="cell" className="h-2.5 rounded-sm bg-s2">
                <span className="block h-full rounded-sm bg-[rgb(var(--text-2)/0.75)]" style={{ width: `${((g[grp.key] ?? 0) / max) * 100}%` }} />
              </span>
              <span role="cell" className="num text-right text-t2">
                {Math.round(g[grp.key] ?? 0)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

type Key = "label" | "value" | "status" | "pct" | "dir";
export type Row = Contribution & { spec?: FeatureSpec; status: "within" | "above" | "below" | null };

export function measurementStatus(value: unknown, f?: FeatureSpec): Row["status"] {
  const nr = f?.normal_range;
  if (!nr || nr.length !== 2 || typeof value !== "number") return null;
  return value < nr[0]! ? "below" : value > nr[1]! ? "above" : "within";
}

export function sortRows(rows: Row[], key: Key, asc: boolean): Row[] {
  const order = { below: 0, within: 1, above: 2 } as const;
  const val = (r: Row): number | string => {
    switch (key) {
      case "label":
        return r.label.toLowerCase();
      case "value":
        return typeof r.value === "number" ? r.value : String(r.value);
      case "status":
        return r.status ? order[r.status] : 9;
      case "pct":
        return r.contribution_pct;
      case "dir":
        return r.shap;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (asc ? c : -c) || a.label.localeCompare(b.label);
  });
}

const STATUS = {
  within: { icon: CircleCheck, text: "Within" },
  above: { icon: MoveUp, text: "Above" },
  below: { icon: MoveDown, text: "Below" },
} as const;

/** Measurement | Value | Unit | Normal range | Status | Contribution % | Direction (sortable). */
export function MeasurementTable() {
  const p = useStore((s) => s.prediction);
  const t = useStore((s) => s.explainTarget);
  const fx = useFeatureIndex();
  const { data: map } = useAnatomyMap();
  const label = useTargets().find((x) => x.key === t)?.label ?? "";
  const [sort, setSort] = useState<{ key: Key; asc: boolean }>({ key: "pct", asc: false });
  const rows = useMemo(() => {
    const r: Row[] = (p?.contributions[t] ?? []).map((c) => ({
      ...c,
      label: fx[c.feature]?.label ?? c.label,
      spec: fx[c.feature],
      status: measurementStatus(c.value, fx[c.feature]),
    }));
    return sortRows(r, sort.key, sort.asc);
  }, [p, t, fx, sort]);
  if (!p) return null;
  const head = (k: Key, label: string, cls = "") => (
    <th scope="col" className={`py-1.5 font-medium ${cls}`} aria-sort={sort.key === k ? (sort.asc ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-0.5 hover:text-t1" onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : k === "label" }))}>
        {label}
        <ArrowUpDown aria-hidden className={`h-3 w-3 ${sort.key === k ? "text-t1" : "opacity-40"}`} />
      </button>
    </th>
  );
  return (
    <div className="scroll-y max-h-[420px] px-4 pb-3">
      <table className="w-full text-xs" data-testid="measurement-table">
        <caption className="sr-only">Measurements for {label}: value, typical range, status and contribution</caption>
        <thead className="sticky top-0 bg-s1 text-left text-t2">
          <tr>
            {head("label", "Measurement")}
            {head("value", "Value", "text-right")}
            <th scope="col" className="py-1.5 pl-2 font-medium">
              Range
            </th>
            {head("status", "Status")}
            {head("pct", "Contrib.", "text-right")}
            {head("dir", "Dir.", "text-center")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = r.status ? STATUS[r.status] : null;
            const nr = r.spec?.normal_range;
            return (
              <tr key={r.feature} className="border-t border-line">
                <td className="max-w-[110px] truncate py-1.5 pr-1 text-t1" title={r.label}>
                  {r.label}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right text-t1">
                  {featureValue(r.value, r.spec, false)} <span className="font-mono text-[10px] text-t3">{r.unit}</span>
                </td>
                <td className="num whitespace-nowrap py-1.5 pl-2 text-t3">
                  {nr && nr.length === 2 ? `${num(nr[0]!, r.spec?.step ?? 1)}–${num(nr[1]!, r.spec?.step ?? 1)}` : "–"}
                </td>
                <td className="whitespace-nowrap py-1.5 text-t2">
                  {st ? (
                    <span className={`inline-flex items-center gap-0.5 ${r.status !== "within" ? "text-t1" : ""}`}>
                      <st.icon aria-hidden className="h-3 w-3" />
                      {st.text}
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="py-1.5 text-right text-t2">{r.contribution_pct.toFixed(1)}%</td>
                <td className="py-1.5 text-center">
                  {r.shap > 0 ? (
                    <ArrowUp aria-label="raises risk" className="mx-auto h-3.5 w-3.5" style={{ color: map?.style.regions.raises_color }} />
                  ) : r.shap < 0 ? (
                    <ArrowDown aria-label="lowers risk" className="mx-auto h-3.5 w-3.5" style={{ color: map?.style.regions.lowers_color }} />
                  ) : (
                    <span className="text-t3">–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-t3">Typical adult ranges are shown for orientation only; they are never used by the model.</p>
    </div>
  );
}
