import { useCallback, useEffect, useRef, useState } from "react";
import { rememberOpening } from "../../lib/openingSession";

/** Plays once per browser-tab session, then yields to the dashboard. */
export function OpeningAnimation({ onComplete }: { onComplete: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const reveal = useCallback(() => setFading(true), []);
  useEffect(() => {
    rememberOpening();
    // A blocked or stalled video must never prevent access to the dashboard.
    const timeout = window.setTimeout(reveal, 8000);
    void video.current?.play().catch(reveal);
    return () => window.clearTimeout(timeout);
  }, [reveal]);

  useEffect(() => {
    if (!fading) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    const timeout = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(timeout);
  }, [fading, onComplete]);

  return (
    <div className={`opening-animation${fading ? " opening-animation--fading" : ""}`} role="region" aria-label="CardioLens opening animation">
      <video
        ref={video}
        src="/media/cardiolens-opening.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const clip = event.currentTarget;
          if (Number.isFinite(clip.duration) && clip.duration > 0) clip.playbackRate = clip.duration / 2;
        }}
        onEnded={reveal}
        onError={reveal}
        aria-label="CardioLens introduction"
      />
      <button className="opening-skip" onClick={reveal} disabled={fading}>Skip intro</button>
    </div>
  );
}
