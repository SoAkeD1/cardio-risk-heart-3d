import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import timeline from "./timeline.gen.json";
import { C, FONT, MONO, SAFE } from "./theme";
import { FontFaces } from "./ui";
import { CaptureScene } from "./CaptureScene";
import { CARDS } from "./cards";

export type Mark = { name: string; t: number; rect?: { x: number; y: number; w: number; h: number } };
export type Clip = { clip: string; src: string; handle: number; marks: Mark[]; length: number; rate?: number };
export type Caption = { start: number; end: number; lines: string[] };
export type SceneT = {
  id: string; title: string; chapter: number; kind: string; name: string; start: number; duration: number;
  lead: number; tail: number; voice: number; audio: string; cues: Record<string, number>; clips: Clip[]; captions: Caption[];
};
export const TL = timeline as unknown as {
  fps: number; width: number; height: number; durationInFrames: number; scenes: SceneT[];
  chapterCards: { chapter: number; title: string; start: number; duration: number }[];
};

const XF = 9; // 300 ms cross-dissolve (frames)

/** fade a chapter's first/last scene against the chapter card (cross-dissolve) */
const SceneFade: React.FC<{ sc: SceneT; children: React.ReactNode }> = ({ sc, children }) => {
  const f = useCurrentFrame();
  const firstOfChapter = TL.chapterCards.some((c) => c.start + c.duration - XF === sc.start);
  const o = firstOfChapter ? interpolate(f, [0, XF], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const SceneView: React.FC<{ sc: SceneT }> = ({ sc }) => {
  const Card = sc.kind === "card" ? CARDS[sc.name] : undefined;
  return (
    <SceneFade sc={sc}>
      {sc.kind === "capture" ? <CaptureScene sc={sc} /> : Card ? <Card sc={sc} /> : <AbsoluteFill style={{ background: "#300" }} />}
      <Sequence from={Math.round(sc.lead * TL.fps)} layout="none">
        <Audio src={staticFile(sc.audio)} />
      </Sequence>
      <Captions caps={sc.captions} />
    </SceneFade>
  );
};

/** chapter card: small number + title, left aligned, 1.8 s, fades in over the previous scene (cross-dissolve) */
const ChapterCard: React.FC<{ chapter: number; title: string; duration: number }> = ({ chapter, title, duration }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, XF, duration - XF, duration], [0, 1, 1, 1], { extrapolateRight: "clamp" });
  const k = interpolate(f, [XF * 0.5, XF * 2.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: o, fontFamily: FONT, color: C.t1 }}>
      <div style={{ position: "absolute", left: SAFE + 96, top: 430, opacity: k, transform: `translateX(${(1 - k) * -24}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 26, color: C.accent, letterSpacing: "0.14em" }}>CHAPTER {chapter}</div>
        <div style={{ fontSize: 76, fontWeight: 650, letterSpacing: "-0.025em", marginTop: 14 }}>{title}</div>
        <div style={{ width: 140 * k, height: 3, background: C.accent, marginTop: 26 }} />
      </div>
    </AbsoluteFill>
  );
};

/** burned-in captions: Inter 30 px, white 92 % on a 55 % black rounded box, max 2 lines, above the bottom 64 px */
export const Captions: React.FC<{ caps: Caption[] }> = ({ caps }) => {
  const f = useCurrentFrame();
  const t = f / TL.fps;
  const c = caps.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const k = interpolate(t, [c.start, c.start + 0.15, c.end - 0.15, c.end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 72, display: "flex", justifyContent: "center", opacity: k, pointerEvents: "none" }}>
      <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 12, padding: "8px 20px", fontFamily: FONT, fontSize: 30, lineHeight: 1.35, color: "rgba(255,255,255,0.92)", textAlign: "center", maxWidth: 1000 }}>
        {c.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
};

/** 3 px chapter progress bar at the top (accent, 40 %) */
const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const sc = TL.scenes.find((s) => f >= s.start && f < s.start + s.duration);
  const ch = sc?.chapter ?? 0;
  const inCh = TL.scenes.filter((s) => s.chapter === ch);
  const a = inCh[0]!.start, b = inCh[inCh.length - 1]!.start + inCh[inCh.length - 1]!.duration;
  const k = Math.min(1, Math.max(0, (f - a) / (b - a)));
  if (ch === 0) return null;
  return <div style={{ position: "absolute", left: 0, top: 0, height: 3, width: `${k * 100}%`, background: C.accent, opacity: 0.4 }} />;
};

export const Master: React.FC<{ from?: number; to?: number }> = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <FontFaces />
    {TL.scenes.map((sc) => (
      <Sequence key={sc.id} from={sc.start} durationInFrames={sc.duration + XF} name={sc.id}>
        <SceneView sc={sc} />
      </Sequence>
    ))}
    {TL.chapterCards.map((c) => (
      <Sequence key={c.chapter} from={c.start} durationInFrames={c.duration} name={`chapter ${c.chapter}`}>
        <ChapterCard {...c} />
      </Sequence>
    ))}
    <Progress />
  </AbsoluteFill>
);
