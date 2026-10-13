import React from "react";
import { Composition, Sequence } from "remotion";
import { Master, TL } from "./Master";
import { Thumbnail } from "./Thumbnail";

// One composition per chapter (for review) + the master.
const Chapter: React.FC<{ from: number }> = ({ from }) => (
  <Sequence from={-from} layout="none">
    <Master />
  </Sequence>
);

export const Root: React.FC = () => {
  const chapters = [...new Set(TL.scenes.map((s) => s.chapter))];
  return (
    <>
      <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={TL.fps} width={1280} height={720} />
      <Composition id="Master" component={Master} durationInFrames={TL.durationInFrames} fps={TL.fps} width={TL.width} height={TL.height} />
      {chapters.map((ch) => {
        const ss = TL.scenes.filter((s) => s.chapter === ch);
        const card = TL.chapterCards.find((c) => c.chapter === ch);
        const from = card ? card.start : ss[0]!.start;
        const to = ss[ss.length - 1]!.start + ss[ss.length - 1]!.duration;
        return <Composition key={ch} id={`Chapter${ch}`} component={Chapter} defaultProps={{ from }} durationInFrames={to - from} fps={TL.fps} width={TL.width} height={TL.height} />;
      })}
    </>
  );
};
