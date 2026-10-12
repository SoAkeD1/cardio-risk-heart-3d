// CIELAB interpolation identical to cardio_ml.anatomy.color_for (sRGB D65, same matrices), so the legend and
// any client-side colour match the API to within rounding. The 3D binding itself only copies API colours.

type Lab = [number, number, number];
const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;
const WHITE = [0.95047, 1.0, 1.08883] as const;
const D = 6 / 29;

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function hexToLab(hex: string): Lab {
  const lin = hexToRgb(hex).map(toLin);
  const xyz = M.map((row, i) => (row[0] * lin[0]! + row[1] * lin[1]! + row[2] * lin[2]!) / WHITE[i]!);
  const f = xyz.map((t) => (t > D ** 3 ? Math.cbrt(t) : t / (3 * D * D) + 4 / 29));
  return [116 * f[1]! - 16, 500 * (f[0]! - f[1]!), 200 * (f[1]! - f[2]!)];
}

// inverse of M (precomputed: identical to numpy.linalg.solve on the same matrix)
const MI = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

export function labToHex(lab: Lab): string {
  const fy = (lab[0] + 16) / 116;
  const f = [fy + lab[1] / 500, fy, fy - lab[2] / 200];
  const xyz = f.map((t, i) => (t > D ? t ** 3 : 3 * D * D * (t - 4 / 29)) * WHITE[i]!);
  const rgb = MI.map((row) => row[0] * xyz[0]! + row[1] * xyz[1]! + row[2] * xyz[2]!).map((c) =>
    Math.min(1, Math.max(0, toSrgb(c))),
  );
  return "#" + rgb.map((v) => pyRound(v * 255).toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** Python's round(): half to even (keeps parity with the backend at exact .5). */
function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export type Stop = { p: number; color: string };

/** Colour of a probability on the shared scale (stops from anatomy_map.style.color_scale). */
export function colorFor(prob: number, stops: Stop[]): string {
  if (!stops.length) return "#888888";
  const labs = stops.map((s) => [s.p, hexToLab(s.color)] as const);
  const p = Math.min(Math.max(prob, labs[0]![0]), labs[labs.length - 1]![0]);
  for (let i = 0; i < labs.length - 1; i++) {
    const [p0, l0] = labs[i]!;
    const [p1, l1] = labs[i + 1]!;
    if (p <= p1) {
      const w = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
      return labToHex([l0[0] + w * (l1[0] - l0[0]), l0[1] + w * (l1[1] - l0[1]), l0[2] + w * (l1[2] - l0[2])]);
    }
  }
  return stops[stops.length - 1]!.color.toUpperCase();
}

/** CSS linear-gradient sampling the CIELAB scale (so the legend matches the 3D colours). */
export function gradientCss(stops: Stop[], n = 21, dir = "to right"): string {
  const parts = Array.from({ length: n }, (_, i) => {
    const p = i / (n - 1);
    return `${colorFor(p, stops)} ${(p * 100).toFixed(1)}%`;
  });
  return `linear-gradient(${dir}, ${parts.join(", ")})`;
}

/** Relative luminance contrast ratio (WCAG). */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = hexToRgb(h).map(toLin) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Readable text colour on a swatch. */
export function inkOn(bg: string): string {
  return contrast(bg, "#1B1C1E") >= contrast(bg, "#FFFFFF") ? "#1B1C1E" : "#FFFFFF";
}
