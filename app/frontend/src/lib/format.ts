// Display formatting: whole-number percentages, signed "pts", feature values with units.

export const pct = (p: number | undefined | null): string =>
  p == null || Number.isNaN(p) ? "–" : `${Math.round(p * 100)}%`;

/** Signed probability points: 0.123 -> "+12 pts", -0.004 -> "−0 pts" is avoided -> "<1 pt". */
export function pts(delta: number): string {
  const v = delta * 100;
  if (Math.abs(v) < 0.5) return v === 0 ? "0 pts" : `${v > 0 ? "+" : "−"}<1 pt`;
  const r = Math.round(Math.abs(v));
  return `${v > 0 ? "+" : "−"}${r} pt${r === 1 ? "" : "s"}`;
}

export function num(v: number, step = 1): string {
  const d = step >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(step)));
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

export type FeatureLike = {
  type: string;
  unit?: string;
  step?: number | null;
  value_labels?: Record<string, string> | null;
};

/** "Yes"/"No" for binaries, mapped labels for categories, number + unit for numerics. */
export function featureValue(v: unknown, f?: FeatureLike, withUnit = true): string {
  if (v === null || v === undefined || v === "") return "–";
  if (!f) return String(v);
  if (f.type === "binary" && f.value_labels == null) {
    const s = String(v).toLowerCase();
    return ["1", "y", "yes", "true"].includes(s) ? "Yes" : "No";
  }
  if (f.value_labels && String(v) in f.value_labels) return f.value_labels[String(v)]!;
  if (f.type === "numeric") {
    const n = typeof v === "number" ? v : Number(v);
    const s = Number.isFinite(n) ? num(n, f.step ?? 1) : String(v);
    return withUnit && f.unit ? `${s} ${f.unit}` : s;
  }
  return String(v);
}

export const tierLabel = (tier: string) => `${tier} risk`;

export const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Sort explanation rows by |contribution| (stable, name tie-break). */
export function byImpact<T extends { shap: number; label: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap) || a.label.localeCompare(b.label));
}

export const signArrow = (x: number) => (x > 0 ? "↑" : x < 0 ? "↓" : "→");
