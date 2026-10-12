// PNG export of the canvas (+ legend overlay) and the 2x front-view render used by the PDF.
import type { Scene } from "../api/types";
import { colorFor, type Stop } from "../lib/color";
import { reg } from "./registry";

function bg(): [string, string] {
  const cs = getComputedStyle(document.documentElement);
  return [cs.getPropertyValue("--canvas-center").trim() || "#3a3a3a", cs.getPropertyValue("--canvas-edge").trim() || "#1e1e1e"];
}

/** Composite: radial background + WebGL frame (+ legend). Returns a PNG data URL. */
export async function composeSnapshot(
  opts: { front?: boolean; scale?: number; legend?: Scene["legend"] | null; stops?: Stop[]; jpeg?: boolean } = {},
) {
  const raw = reg.snapshot ? await reg.snapshot({ front: opts.front, scale: opts.scale }) : reg.canvas?.toDataURL("image/png");
  if (!raw) throw new Error("3D view not ready");
  const img = new Image();
  img.src = raw;
  await img.decode();
  const out = document.createElement("canvas");
  out.width = img.width;
  out.height = img.height;
  const g = out.getContext("2d")!;
  const [c0, c1] = bg();
  const grad = g.createRadialGradient(out.width / 2, out.height * 0.45, 0, out.width / 2, out.height * 0.45, Math.hypot(out.width, out.height) * 0.45);
  grad.addColorStop(0, c0);
  grad.addColorStop(1, c1);
  g.fillStyle = grad;
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(img, 0, 0);
  const stops = opts.legend?.stops ?? opts.stops;
  if (stops) {
    const s = out.width / 1200;
    const w = 300 * s, h = 12 * s, x = 24 * s, y = out.height - 64 * s;
    g.fillStyle = "rgba(15,16,18,0.78)";
    g.fillRect(x - 12 * s, y - 30 * s, w + 24 * s, 76 * s);
    for (let i = 0; i < w; i++) {
      g.fillStyle = colorFor(i / w, stops);
      g.fillRect(x + i, y, 1.5, h);
    }
    g.fillStyle = "#F2F0ED";
    g.font = `${13 * s}px Inter, system-ui, sans-serif`;
    g.fillText("Artery colour = probability of ≥50% stenosis", x, y - 10 * s);
    g.font = `${11 * s}px Inter, system-ui, sans-serif`;
    g.fillText("0%", x, y + h + 16 * s);
    g.fillText("100%", x + w - 28 * s, y + h + 16 * s);
    for (const [v, t] of Object.entries(opts.legend?.threshold_markers ?? {})) {
      g.fillRect(x + t * w, y - 3 * s, 1.5 * s, h + 6 * s);
      g.fillText(v.toUpperCase(), x + t * w - 10 * s, y + h + 30 * s);
    }
  }
  return opts.jpeg ? out.toDataURL("image/jpeg", 0.86) : out.toDataURL("image/png");
}

export function downloadDataUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
