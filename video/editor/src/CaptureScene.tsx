import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import data from "./data.gen.json";
import type { Clip, SceneT } from "./Master";
import { OVERLAYS, type Ref } from "./overlays";
import { C, FONT, MONO, SAFE } from "./theme";
import { ramp, Reveal, useT } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D = data as any;
const FPS = 30;
const io = Easing.bezier(0.42, 0, 0.58, 1);

function resolve(sc: SceneT, clip: Clip | undefined, r: Ref): number {
  if (typeof r === "number") return r;
  if (r.startsWith("mark:")) return clip?.marks.find((m) => m.name === r.slice(5))?.t ?? 0;
  return sc.cues[r] ?? 0;
}

const Video: React.FC<{ clip: Clip; style?: React.CSSProperties }> = ({ clip, style }) => (
  <OffthreadVideo src={staticFile(clip.src)} startFrom={Math.round(clip.handle * FPS)} playbackRate={clip.rate ?? 1} muted style={{ width: "100%", height: "100%", ...style }} />
);

const Callout: React.FC<{ rect: { x: number; y: number; w: number; h: number }; label?: string; at: number; dur: number }> = ({ rect, label, at, dur }) => {
  const t = useT();
  const k = ramp(t, at, 0.2) * (1 - ramp(t, at + dur - 0.25, 0.25));
  if (k <= 0) return null;
  const pad = 8;
  const below = rect.y < 140;
  return (
    <div style={{ position: "absolute", left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2, border: `2px solid ${C.accent}`, borderRadius: 12, opacity: k, boxShadow: "0 0 0 4000px rgba(0,0,0,0.0)" }}>
      {label && (
        <div style={{ position: "absolute", left: 0, [below ? "top" : "bottom"]: "calc(100% + 8px)", whiteSpace: "nowrap", background: C.accent, color: "#062421", fontFamily: FONT, fontSize: 22, fontWeight: 650, padding: "5px 12px", borderRadius: 8 } as React.CSSProperties}>{label}</div>
      )}
    </div>
  );
};

const LowerThird: React.FC<{ text: string; at: number; dur: number }> = ({ text, at, dur }) => (
  <Reveal at={at} until={at + dur - 0.25} dur={0.25} dy={10} style={{ position: "absolute", left: SAFE, bottom: 168 }}>
    <div style={{ background: "rgba(15,16,18,0.92)", border: `2px solid ${C.line}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 10, padding: "10px 18px", fontFamily: FONT, fontSize: 25, color: C.t1 }}>{text}</div>
  </Reveal>
);

/** zoom transform for the main clip: <= 1.35x around a focus point, eased in/out over 700 ms */
function zoomAt(sc: SceneT, clip: Clip, t: number) {
  const zs = OVERLAYS[sc.id]?.zooms ?? [];
  for (const z of zs) {
    const a = resolve(sc, clip, z.at);
    const k = interpolate(t, [a, a + 0.7, a + z.dur - 0.7, a + z.dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: io });
    if (k > 0) {
      const f = typeof z.focus === "object" ? z.focus : (() => {
        const m = clip.marks.find((x) => x.name === String(z.focus).replace("mark:", ""))?.rect;
        return m ? { x: m.x + m.w / 2, y: m.y + m.h / 2 } : { x: 960, y: 540 };
      })();
      return { s: 1 + (Math.min(1.35, z.scale) - 1) * k, ox: f.x, oy: f.y };
    }
  }
  return { s: 1, ox: 960, oy: 540 };
}

const Devices: React.FC<{ sc: SceneT }> = ({ sc }) => {
  const t = useT();
  const tab = sc.clips.find((c) => c.clip.endsWith("tablet"));
  const phone = sc.clips.find((c) => c.clip.endsWith("phone"));
  const pk = ramp(t, (sc.cues.phone ?? 1.5) - 0.2, 0.5);
  const frame = (w: number, h: number, clip: Clip | undefined, x: number, y: number, s: number, o = 1) => (
    <div style={{ position: "absolute", left: x, top: y, width: w * s + 28, height: h * s + 28, borderRadius: 34, background: "#050506", border: `2px solid ${C.line}`, padding: 14, opacity: o, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
      <div style={{ width: w * s, height: h * s, borderRadius: 22, overflow: "hidden" }}>{clip && <Video clip={clip} />}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {frame(810, 1080, tab, 380, 70, 0.78)}
      <div style={{ position: "absolute", left: 1080, top: 120, opacity: pk, transform: `translateY(${(1 - pk) * 30}px)` }}>{frame(390, 844, phone, 0, 0, 0.92)}</div>
      <div style={{ position: "absolute", left: 380, top: 960, fontFamily: FONT, fontSize: 24, color: C.t2 }}>Tablet 810 × 1080 · bottom sheet</div>
      <div style={{ position: "absolute", left: 1080, top: 960, fontFamily: FONT, fontSize: 24, color: C.t2, opacity: pk }}>Phone 390 × 844 · tabs</div>
    </AbsoluteFill>
  );
};

const Browser: React.FC<{ sc: SceneT }> = ({ sc }) => {
  const t = useT();
  const clip = sc.clips[0]!;
  const other = sc.cues.other ?? 4;
  const k = ramp(t, other, 0.5);
  const s = 1 - 0.38 * k;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: 960 - (1920 * 0.86 * s) / 2 - 300 * k, top: 70 + 40 * k, width: 1920 * 0.86 * s, borderRadius: 14, overflow: "hidden", border: `2px solid ${C.line}`, boxShadow: "0 30px 90px rgba(0,0,0,0.5)" }}>
        <div style={{ height: 52 * Math.max(0.7, s), background: C.s2, display: "flex", alignItems: "center", gap: 12, padding: "0 18px" }}>
          {["#E4572E", "#F2B45A", "#5FB3A8"].map((c) => <i key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.7, display: "block" }} />)}
          <div style={{ marginLeft: 16, flex: 1, height: 32 * Math.max(0.7, s), borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", padding: "0 14px", fontFamily: MONO, fontSize: 22 * Math.max(0.7, s), color: C.t1 }}>
            <span style={{ color: C.accent }}>🔒&nbsp;</span>{D.live.replace("https://", "")}/?case=lad
          </div>
        </div>
        <div style={{ width: "100%", aspectRatio: "16 / 9" }}><Video clip={clip} /></div>
      </div>
      <Reveal at={0.6} until={other - 0.2} style={{ position: "absolute", left: SAFE, bottom: 168 }}>
        <div style={{ background: "rgba(15,16,18,0.92)", border: `2px solid ${C.line}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 10, padding: "10px 18px", fontFamily: FONT, fontSize: 25, color: C.t1 }}>Live: React frontend + FastAPI in one Vercel container service</div>
      </Reveal>
      <div style={{ position: "absolute", left: 1220, top: 150, width: 640, opacity: k }}>
        {[
          ["Docker", "docker build -t cardiolens . && docker run -p 8000:8000 cardiolens"],
          ["One-click (Windows)", "Start CardioLens.bat · auto-build · auto-restart"],
          ["Development", "python scripts/dev.py"],
          ["Rebuild everything", "notebook retrains · python blender/make_all.py"],
        ].map(([a, b], i) => (
          <Reveal key={a} at={other + 0.3 + i * 0.5} style={{ marginBottom: 22 }}>
            <div style={{ background: C.s1, border: `2px solid ${C.line}`, borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 650, color: C.t1 }}>{a}</div>
              <div style={{ fontFamily: MONO, fontSize: 19, color: C.t2, marginTop: 6 }}>{b}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const CaptureScene: React.FC<{ sc: SceneT }> = ({ sc }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const ov = OVERLAYS[sc.id] ?? {};
  if (ov.layout === "devices") return <Devices sc={sc} />;
  if (ov.layout === "browser") return <Browser sc={sc} />;
  const clip = sc.clips[0];
  if (!clip) return <AbsoluteFill style={{ background: "#300" }} />;
  const z = zoomAt(sc, clip, t);
  // which callouts are visible now (max 2)
  const calls = (ov.callouts ?? []).map((c) => {
    const m = clip.marks.find((x) => x.name === c.mark);
    return m?.rect ? { ...c, rect: m.rect, at: m.t - (c.lead ?? 0.2), dur: c.dur ?? 2.6 } : null;
  }).filter(Boolean) as { rect: { x: number; y: number; w: number; h: number }; label?: string; at: number; dur: number }[];
  const visible = calls.filter((c) => t >= c.at && t < c.at + c.dur).slice(0, 2);
  const pdfAt = ov.layout === "export" ? resolve(sc, clip, "mark:pdf") + 0.3 : -1;
  const pages = (D.report_pages as number | undefined) ?? 0;
  const pk = pdfAt > 0 ? ramp(t, pdfAt, 0.45) * (1 - ramp(t, pdfAt + 3.0, 0.4)) : 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ transform: `scale(${z.s})`, transformOrigin: `${z.ox}px ${z.oy}px` }}>
        <Video clip={clip} />
        {visible.map((c, i) => <Callout key={i} {...c} />)}
      </AbsoluteFill>
      {(ov.lower ?? []).map((l, i) => <LowerThird key={i} text={l.text} at={resolve(sc, clip, l.at)} dur={l.dur ?? 3} />)}
      {pk > 0 && (
        <AbsoluteFill style={{ background: `rgba(0,0,0,${0.55 * pk})`, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 30 }}>
          {Array.from({ length: Math.min(3, pages) }, (_, i) => (
            <Img key={i} src={staticFile(`export/report_p${i + 1}.png`)} style={{ height: 760, opacity: pk, transform: `translateY(${(1 - pk) * 30 + i * 0}px)`, borderRadius: 6, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }} />
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
