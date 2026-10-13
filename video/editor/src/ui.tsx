import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, MONO, SAFE } from "./theme";

export const FontFaces: React.FC = () => (
  <style>{`
    @font-face { font-family: "Inter"; src: url("${staticFile("fonts/inter-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; }
    @font-face { font-family: "JetBrains Mono"; src: url("${staticFile("fonts/jetbrains-mono-latin-400-normal.woff2")}") format("woff2"); font-weight: 400; }
    @font-face { font-family: "JetBrains Mono"; src: url("${staticFile("fonts/jetbrains-mono-latin-500-normal.woff2")}") format("woff2"); font-weight: 500; }
  `}</style>
);

const io = Easing.bezier(0.42, 0, 0.58, 1);
const out = Easing.bezier(0.2, 0.8, 0.2, 1);

/** seconds since the start of the current Sequence */
export function useT() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
}

/** 0..1 ramp starting at `at` (s) over `dur` (s) */
export function ramp(t: number, at: number, dur = 0.4, ease = out) {
  return interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

/** element that fades/slides in at `at` seconds (and optionally out at `until`) */
export const Reveal: React.FC<{ at: number; until?: number; dy?: number; dur?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, until, dy = 18, dur = 0.45, style, children }) => {
  const t = useT();
  const k = ramp(t, at, dur);
  const o = until !== undefined ? 1 - ramp(t, until, 0.3, io) : 1;
  return <div style={{ opacity: k * o, transform: `translateY(${(1 - k) * dy}px)`, ...style }}>{children}</div>;
};

/** number that counts up (400 ms) from 0 when first shown */
export const CountUp: React.FC<{ at: number; value: number; digits?: number; suffix?: string; style?: React.CSSProperties }> = ({ at, value, digits = 0, suffix = "", style }) => {
  const t = useT();
  const k = ramp(t, at, 0.4, io);
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{(value * k).toFixed(digits)}{suffix}</span>;
};

export const Page: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ background: C.bg, color: C.t1, fontFamily: FONT, ...style }}>{children}</AbsoluteFill>
);

/** chapter-scene heading: small overline + title, left-aligned at the safe margin */
export const Heading: React.FC<{ over: string; title: string; at?: number }> = ({ over, title, at = 0 }) => (
  <div style={{ position: "absolute", left: SAFE + 32, top: SAFE + 24, right: SAFE }}>
    <Reveal at={at}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent }}>{over}</div>
    </Reveal>
    <Reveal at={at + 0.1}>
      <div style={{ fontSize: 56, fontWeight: 650, letterSpacing: "-0.02em", marginTop: 10 }}>{title}</div>
    </Reveal>
  </div>
);

export const Panel: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: C.s1, border: `2px solid ${C.line}`, borderRadius: 16, ...style }}>{children}</div>
);

/** artifact figure on a dark card with a caption; Ken Burns <= 1.1x */
export const Figure: React.FC<{ src: string; at: number; until?: number; x: number; y: number; w: number; h: number; caption?: string; fit?: "contain" | "cover"; bg?: string; kb?: boolean }> = ({ src, at, until, x, y, w, h, caption, fit = "contain", bg = "#FFFFFF", kb = true }) => {
  const t = useT();
  const k = ramp(t, at, 0.5);
  const o = until !== undefined ? 1 - ramp(t, until, 0.35, io) : 1;
  const s = kb ? 1 + 0.06 * Math.min(1, Math.max(0, (t - at) / 8)) : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, opacity: k * o, transform: `translateY(${(1 - k) * 20}px)` }}>
      <div style={{ width: w, height: h, borderRadius: 14, overflow: "hidden", background: bg, border: `2px solid ${C.line}` }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: fit, transform: `scale(${s})`, transformOrigin: "50% 50%" }} />
      </div>
      {caption && <div style={{ marginTop: 10, fontSize: 22, color: C.t2, lineHeight: 1.35 }}>{caption}</div>}
    </div>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.accent, style }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, border: `2px solid ${color}55`, background: `${color}18`, color: C.t1, fontSize: 24, fontWeight: 550, ...style }}>{children}</span>
);

/** a box in an animated diagram: appears at `at` */
export const Box: React.FC<{ at: number; x: number; y: number; w: number; h: number; title: string; sub?: string[]; dark?: boolean; mono?: boolean }> = ({ at, x, y, w, h, title, sub = [], dark, mono }) => {
  const t = useT();
  const k = ramp(t, at, 0.35);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: k, transform: `scale(${0.96 + 0.04 * k})`, borderRadius: 14, background: dark ? "#13332F" : C.s1, border: `2px solid ${dark ? C.accent : C.line}`, padding: "18px 20px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 28, fontWeight: 650, fontFamily: mono ? MONO : FONT }}>{title}</div>
      {sub.map((s) => (
        <div key={s} style={{ fontSize: 21, color: C.t2, marginTop: 6, lineHeight: 1.3 }}>{s}</div>
      ))}
    </div>
  );
};

/** an arrow that draws in over 400 ms */
export const Arrow: React.FC<{ at: number; x1: number; y1: number; x2: number; y2: number; color?: string }> = ({ at, x1, y1, x2, y2, color = C.accent }) => {
  const t = useT();
  const k = ramp(t, at, 0.4, io);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ex = x1 + (x2 - x1) * k, ey = y1 + (y2 - y1) * k;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={3} strokeDasharray={len} />
      {k > 0.95 && (
        <polygon points="0,-8 16,0 0,8" fill={color} transform={`translate(${x2 - Math.cos(ang) * 14},${y2 - Math.sin(ang) * 14}) rotate(${(ang * 180) / Math.PI})`} />
      )}
    </svg>
  );
};

/** a terminal window whose lines type in (real command output, shown as text) */
export const Terminal: React.FC<{ at: number; x: number; y: number; w: number; h: number; title: string; lines: { text: string; color?: string }[]; cps?: number }> = ({ at, x, y, w, h, title, lines, cps = 90 }) => {
  const t = useT();
  const k = ramp(t, at, 0.35);
  let budget = Math.max(0, (t - at - 0.3) * cps);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: k, borderRadius: 14, background: "#0A0B0D", border: `2px solid ${C.line}`, overflow: "hidden" }}>
      <div style={{ height: 40, background: C.s2, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
        {["#E4572E", "#F2B45A", "#5FB3A8"].map((c) => <i key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.7, display: "block" }} />)}
        <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 18, color: C.t2 }}>{title}</span>
      </div>
      <div style={{ padding: "16px 20px", fontFamily: MONO, fontSize: 22, lineHeight: 1.5, whiteSpace: "pre" }}>
        {lines.map((l, i) => {
          const n = Math.min(l.text.length, Math.floor(budget));
          budget -= l.text.length + 6;
          if (n <= 0 && i > 0) return null;
          return <div key={i} style={{ color: l.color ?? C.t1 }}>{l.text.slice(0, Math.max(0, n))}</div>;
        })}
      </div>
    </div>
  );
};
