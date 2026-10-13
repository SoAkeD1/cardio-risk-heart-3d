import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, FONT } from "./theme";
import { FontFaces } from "./ui";

// 1280x720: the realistic heart with risk-coloured arteries on the dark background + title + subtitle. No clickbait.
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.t1 }}>
    <FontFaces />
    <div style={{ position: "absolute", left: -120, top: -40, width: 900, height: 820, background: "radial-gradient(circle, rgba(228,87,46,0.22) 0%, rgba(228,87,46,0.05) 45%, transparent 70%)" }} />
    <div style={{ position: "absolute", left: -140, top: 40, width: 880, height: 550, WebkitMaskImage: "radial-gradient(ellipse 46% 50% at 50% 50%, #000 58%, transparent 100%)" }}>
      <Img src={staticFile("figs/heart_demo_risk.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
    <div style={{ position: "absolute", left: 640, top: 210, width: 600 }}>
      <div style={{ fontSize: 26, letterSpacing: "0.14em", color: C.accent, fontWeight: 600 }}>TEAM HAVOC · TRACK A</div>
      <div style={{ fontSize: 104, fontWeight: 750, letterSpacing: "-0.035em", marginTop: 8 }}>CardioLens</div>
      <div style={{ fontSize: 35, color: "#D2CEC8", marginTop: 6, lineHeight: 1.2, whiteSpace: "nowrap" }}>3D cardiac risk from routine data</div>
      <div style={{ height: 10, width: 300, borderRadius: 5, marginTop: 40, background: "linear-gradient(90deg,#E8E2D8,#F2B45A 30%,#E4572E 60%,#8E1B1B)" }} />
    </div>
  </AbsoluteFill>
);
