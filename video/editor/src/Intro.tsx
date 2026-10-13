import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import intro from "./intro.gen.json";
import data from "./data.gen.json";
import { Captions } from "./Master";
import { C, FONT, MONO, SAFE } from "./theme";
import { FontFaces, Reveal } from "./ui";

// 15 s intro: real app captures, cut on the narration's cue words, gentle push-ins, one lower-third per shot.
const FPS = 30;
const io = Easing.bezier(0.42, 0, 0.58, 1);
type Shot = { clip: string; from: number; to: number; src: number; lower: string; zoom: { s: number; x: number; y: number } };
const I = intro as unknown as { duration: number; lead: number; endCard: number; audio: string; shots: Shot[]; captions: { start: number; end: number; lines: string[] }[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D = data as any;

const ShotView: React.FC<{ s: Shot }> = ({ s }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const len = s.to - s.from;
  // ease into the push-in over 0.8 s, then keep drifting very slightly (never static)
  const k = interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: "clamp", easing: io });
  const scale = 1 + (s.zoom.s - 1) * k + 0.012 * (t / Math.max(len, 1));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${s.zoom.x}px ${s.zoom.y}px` }}>
        <OffthreadVideo src={staticFile(s.clip)} startFrom={Math.round(s.src * FPS)} muted style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
      <Reveal at={0.15} until={len - 0.25} dur={0.25} dy={10} style={{ position: "absolute", left: SAFE, bottom: 168 }}>
        <div style={{ background: "rgba(15,16,18,0.92)", border: `2px solid ${C.line}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 10, padding: "10px 18px", fontFamily: FONT, fontSize: 27, color: C.t1 }}>{s.lower}</div>
      </Reveal>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 9], [0, 1], { extrapolateRight: "clamp" });
  const k = interpolate(f, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: o, fontFamily: FONT, color: C.t1, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${0.96 + 0.04 * k})`, opacity: k }}>
        <svg viewBox="0 0 32 32" width={110} height={110}><path d="M16 25s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 16 10.9a4.8 4.8 0 0 1 8.5 2.9C24.5 19.8 16 25 16 25z" fill="none" stroke={C.accent} strokeWidth={2} /><path d="M9.5 16h4l1.5-3 2 6 1.5-3h4" fill="none" stroke={C.t1} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: "-0.035em" }}>CardioLens</div>
      </div>
      <div style={{ fontSize: 42, color: C.t2, marginTop: 14, opacity: k }}>See where cardiac risk lives.</div>
      <div style={{ fontFamily: MONO, fontSize: 28, color: C.accent, marginTop: 44, opacity: k }}>{D.live.replace("https://", "")}</div>
      <div style={{ position: "absolute", bottom: 70, fontSize: 24, color: C.t3, opacity: k }}>Team HAVOC · Track A · {D.disclaimer}</div>
    </AbsoluteFill>
  );
};

export const Intro: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <FontFaces />
    {I.shots.map((s, i) => (
      <Sequence key={i} from={Math.round(s.from * FPS)} durationInFrames={Math.round((s.to - s.from) * FPS) + (i === I.shots.length - 1 ? 9 : 0)}>
        <ShotView s={s} />
      </Sequence>
    ))}
    <Sequence from={Math.round(I.endCard * FPS)}>
      <EndCard />
    </Sequence>
    <Sequence from={Math.round(I.lead * FPS)} layout="none">
      <Audio src={staticFile(I.audio)} />
    </Sequence>
    <Captions caps={I.captions} />
  </AbsoluteFill>
);

export const INTRO_FRAMES = Math.round(I.duration * FPS);
