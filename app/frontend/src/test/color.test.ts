import { describe, expect, it } from "vitest";
import { colorFor, contrast, gradientCss, hexToLab, inkOn, labToHex } from "../lib/color";
import fixture from "./color_fixture.json";

const diff = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
};

describe("color.ts (CIELAB scale)", () => {
  it("matches cardio_ml.anatomy.color_for for every reference probability (±1/255)", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(11);
    for (const c of fixture.cases) expect(diff(colorFor(c.p, fixture.stops), c.color), `p=${c.p}`).toBeLessThanOrEqual(1);
  });
  it("round-trips hex -> Lab -> hex", () => {
    for (const h of ["#E8E2D8", "#F2B45A", "#E4572E", "#8E1B1B", "#000000", "#FFFFFF"]) expect(labToHex(hexToLab(h))).toBe(h);
  });
  it("clamps outside [0, 1] and returns stop colours at the stops", () => {
    expect(colorFor(-1, fixture.stops)).toBe(colorFor(0, fixture.stops));
    expect(colorFor(2, fixture.stops)).toBe(colorFor(1, fixture.stops));
    for (const s of fixture.stops) expect(diff(colorFor(s.p, fixture.stops), s.color)).toBeLessThanOrEqual(1);
  });
  it("lightness decreases monotonically along the scale", () => {
    const L = Array.from({ length: 21 }, (_, i) => hexToLab(colorFor(i / 20, fixture.stops))[0]);
    for (let i = 1; i < L.length; i++) expect(L[i]!).toBeLessThanOrEqual(L[i - 1]! + 1e-6);
  });
  it("builds a CSS gradient and picks readable ink", () => {
    expect(gradientCss(fixture.stops, 5)).toMatch(/^linear-gradient\(to right, #[0-9A-F]{6} 0\.0%/);
    expect(inkOn("#8E1B1B")).toBe("#FFFFFF");
    expect(inkOn("#E8E2D8")).toBe("#1B1C1E");
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
});
