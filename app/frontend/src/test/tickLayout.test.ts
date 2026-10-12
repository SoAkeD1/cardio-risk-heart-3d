import { describe, expect, it } from "vitest";
import { layoutTicks, type PlacedTick } from "../lib/tickLayout";

const box = (t: PlacedTick) => (t.align === "left" ? [t.textX, t.textX + t.textW] : [t.textX - t.textW, t.textX]) as [number, number];

function assertClean(placed: PlacedTick[]) {
  for (const a of placed)
    for (const b of placed) {
      if (a === b) continue;
      const [a0, a1] = box(a), [b0, b1] = box(b);
      if (a.row === b.row) expect(a1 <= b0 || b1 <= a0, `${a.key}/${b.key} labels overlap`).toBe(true);
      // b's leader (x, rows 0..b.row) must not pass through a's label
      if (a.row <= b.row) expect(b.x <= a0 || b.x >= a1, `${b.key} leader crosses ${a.key} label`).toBe(true);
    }
}

describe("layoutTicks", () => {
  it("stacks ticks within 5% (RCA 28 / LCX 29) and keeps a distant one (LAD 47) clear", () => {
    const { placed, rows } = layoutTicks(
      [
        { key: "lad", label: "LAD 47%", p: 0.465 },
        { key: "lcx", label: "LCX 29%", p: 0.29 },
        { key: "rca", label: "RCA 28%", p: 0.275 },
      ],
      296,
    );
    const r = Object.fromEntries(placed.map((t) => [t.key, t]));
    expect(r.rca!.row).not.toBe(r.lcx!.row); // stacked
    expect(rows).toBeLessThanOrEqual(3);
    assertClean(placed);
  });
  it("handles three nearly identical thresholds and ticks at the edges", () => {
    for (const ps of [[0.3, 0.31, 0.32], [0.01, 0.02, 0.99], [0.95, 0.97, 0.99], [0.1, 0.5, 0.9]]) {
      const { placed } = layoutTicks(
        ps.map((p, i) => ({ key: `v${i}`, label: `V${i} ${Math.round(p * 100)}%`, p })),
        240,
      );
      for (const t of placed) {
        const [x0, x1] = box(t);
        expect(x0).toBeGreaterThanOrEqual(-0.01);
        expect(x1).toBeLessThanOrEqual(240.01);
      }
      assertClean(placed);
    }
  });
});
