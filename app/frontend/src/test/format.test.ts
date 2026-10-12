import { describe, expect, it } from "vitest";
import { byImpact, featureValue, num, pct, pts, shortLabel } from "../lib/format";
import { measurementStatus, sortRows, type Row } from "../features/explain/Breakdown";

describe("format.ts", () => {
  it("formats probabilities as whole-number percentages", () => {
    expect(pct(0.734)).toBe("73%");
    expect(pct(0.005)).toBe("1%");
    expect(pct(1)).toBe("100%");
    expect(pct(undefined)).toBe("–");
  });
  it("formats signed probability points", () => {
    expect(pts(0.12)).toBe("+12 pts");
    expect(pts(-0.054)).toBe("−5 pts");
    expect(pts(0.01)).toBe("+1 pt");
    expect(pts(0.002)).toBe("<1 pt");
    expect(pts(-0.002)).toBe("<1 pt");
    expect(pts(0)).toBe("0 pts");
  });
  it("formats numbers to the field step", () => {
    expect(num(24.2211, 0.1)).toBe("24.2");
    expect(num(5700, 1)).toBe("5,700");
    expect(num(0.95, 0.1)).toBe("1");
  });
  it("formats feature values by type", () => {
    expect(featureValue(1, { type: "binary" })).toBe("Yes");
    expect(featureValue("N", { type: "binary" })).toBe("No");
    expect(featureValue("Female", { type: "binary", value_labels: { Male: "Male", Female: "Female" } })).toBe("Female");
    expect(featureValue("LBBB", { type: "categorical", value_labels: { N: "None", LBBB: "Left" } })).toBe("Left");
    expect(featureValue(122, { type: "numeric", unit: "mg/dL", step: 1 })).toBe("122 mg/dL");
    expect(featureValue(122, { type: "numeric", unit: "mg/dL", step: 1 }, false)).toBe("122");
    expect(featureValue(null, { type: "numeric" })).toBe("–");
  });
  it("shortens labels", () => {
    expect(shortLabel("EF-TTE (ejection fraction)")).toBe("EF-TTE");
    expect(shortLabel("Typical chest pain")).toBe("Typical chest pain");
  });
});

describe("sorting", () => {
  const r = (label: string, shap: number, pct_: number, value: number | string = 0): Row => ({
    feature: label.toLowerCase(),
    label,
    group: "lab",
    value,
    unit: "",
    shap,
    contribution_pct: pct_,
    direction: shap > 0 ? "raises risk" : "lowers risk",
    status: null,
  });
  it("orders explanations by |contribution| with a stable name tie-break", () => {
    const rows = [r("B", 0.01, 1), r("A", -0.2, 20), r("C", 0.2, 20), r("D", 0.05, 5)];
    expect(byImpact(rows).map((x) => x.label)).toEqual(["A", "C", "D", "B"]);
  });
  it("sorts the measurement table by any column, both directions", () => {
    const rows = [r("Beta", 0.1, 10, 5), r("alpha", -0.3, 30, 9), r("Gamma", 0.2, 20, 1)];
    expect(sortRows(rows, "pct", false).map((x) => x.label)).toEqual(["alpha", "Gamma", "Beta"]);
    expect(sortRows(rows, "label", true).map((x) => x.label)).toEqual(["alpha", "Beta", "Gamma"]);
    expect(sortRows(rows, "value", true).map((x) => x.label)).toEqual(["Gamma", "Beta", "alpha"]);
    expect(sortRows(rows, "dir", false).map((x) => x.label)).toEqual(["Gamma", "Beta", "alpha"]);
  });
  it("classifies values against the reference range (text status, display only)", () => {
    const f = { normal_range: [90, 120] } as never;
    expect(measurementStatus(80, f)).toBe("below");
    expect(measurementStatus(100, f)).toBe("within");
    expect(measurementStatus(150, f)).toBe("above");
    expect(measurementStatus("x", f)).toBeNull();
  });
});
