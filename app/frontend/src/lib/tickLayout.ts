// Collision-free label layout for threshold ticks on a horizontal scale (legend).
// Ticks within `clusterGap` (fraction of the scale) form a cluster whose labels stack vertically on one side of the
// cluster with elbow leader lines. Rows are ordered so that no leader crosses another leader or a label.

export type Tick = { key: string; label: string; p: number };
export type PlacedTick = Tick & {
  x: number; // tick position (px)
  row: number; // label row (0 = closest to the bar)
  textX: number; // label anchor x (px)
  align: "left" | "right"; // label grows to the right of textX ("left") or to the left ("right")
  textW: number; // estimated label width (px)
};

export function layoutTicks(
  ticks: Tick[],
  width: number,
  opts: { clusterGap?: number; charW?: number; pad?: number } = {},
): { placed: PlacedTick[]; rows: number } {
  const gap = opts.clusterGap ?? 0.05;
  const charW = opts.charW ?? 6.3;
  const pad = opts.pad ?? 6;
  const sorted = [...ticks].sort((a, b) => a.p - b.p || a.key.localeCompare(b.key));
  // 1. clusters of ticks closer than `gap`
  const clusters: Tick[][] = [];
  for (const t of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && t.p - last[last.length - 1]!.p < gap) last.push(t);
    else clusters.push([t]);
  }
  // 2. per cluster: try (side, base row) until nothing collides. Obstacles: earlier label boxes AND earlier vertical
  //    leaders (a tick's leader runs from the bar down to its own row).
  const placed: PlacedTick[] = [];
  const boxes: { x0: number; x1: number; row: number }[] = [];
  const leaders: { x: number; row: number }[] = [];
  for (const c of clusters) {
    const xs = c.map((t) => t.p * width);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const widest = Math.max(...c.map((t) => t.label.length * charW));
    const preferRight = maxX + pad + widest <= width || width - maxX >= minX;
    let best: { right: boolean; base: number } | null = null;
    for (let base = 0; base < 8 && !best; base++) {
      for (const right of preferRight ? [true, false] : [false, true]) {
        if (!right && minX - pad - widest < 0) continue;
        if (right && maxX + pad + widest > width) continue;
        // right side: rightmost tick on the top row; left side: leftmost tick on the top row
        const order = right ? [...c].reverse() : [...c];
        const ok = order.every((t, i) => {
          const row = base + i;
          const w = t.label.length * charW;
          const b = right ? { x0: maxX + pad, x1: maxX + pad + w } : { x0: minX - pad - w, x1: minX - pad };
          const x = t.p * width;
          return (
            !boxes.some((o) => o.row === row && b.x0 < o.x1 + 4 && o.x0 < b.x1 + 4) && // label vs label
            !leaders.some((l) => l.row >= row && l.x > b.x0 - 3 && l.x < b.x1 + 3) && // label vs older leader
            !boxes.some((o) => o.row <= row && x > o.x0 - 3 && x < o.x1 + 3) // new leader vs older label
          );
        });
        if (ok) {
          best = { right, base };
          break;
        }
      }
    }
    const { right, base } = best ?? { right: preferRight, base: boxes.reduce((m, b) => Math.max(m, b.row + 1), 0) };
    const order = right ? [...c].reverse() : [...c];
    order.forEach((t, i) => {
      const w = t.label.length * charW;
      const row = base + i;
      const b = right ? { x0: maxX + pad, x1: maxX + pad + w, row } : { x0: minX - pad - w, x1: minX - pad, row };
      boxes.push(b);
      leaders.push({ x: t.p * width, row });
      placed.push({ ...t, x: t.p * width, row, textX: right ? b.x0 : b.x1, align: right ? "left" : "right", textW: w });
    });
  }
  const rows = placed.reduce((m, t) => Math.max(m, t.row + 1), 0);
  return { placed: placed.sort((a, b) => a.p - b.p), rows };
}
