import { useRef, useState, type ReactNode } from "react";

const SNAPS = [0.3, 0.6, 0.92];

/** Tablet (768-1023): results as a bottom sheet with 30 / 60 / 92 % snap points (drag or keyboard). */
export function BottomSheet({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const h = drag ?? SNAPS[snap]! * vh;
  return (
    <div
      id="results"
      role="region"
      aria-label="Results"
      className="absolute inset-x-0 bottom-9 z-30 flex flex-col rounded-t-lg border-t border-line bg-s1 shadow-soft"
      style={{ height: Math.min(h, vh - 120), transition: drag === null ? "height 280ms cubic-bezier(0.2,0.8,0.2,1)" : "none" }}
    >
      <button
        aria-label={`Resize results panel (currently ${Math.round(SNAPS[snap]! * 100)}%)`}
        className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, h };
        }}
        onPointerMove={(e) => start.current && setDrag(Math.max(120, start.current.h + (start.current.y - e.clientY)))}
        onPointerUp={() => {
          if (drag !== null) {
            const r = drag / vh;
            setSnap(SNAPS.reduce((b, s, i) => (Math.abs(s - r) < Math.abs(SNAPS[b]! - r) ? i : b), 0));
          } else setSnap((s) => (s + 1) % SNAPS.length);
          setDrag(null);
          start.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setSnap((s) => Math.min(SNAPS.length - 1, s + 1));
          if (e.key === "ArrowDown") setSnap((s) => Math.max(0, s - 1));
        }}
      >
        <span className="h-1 w-10 rounded-full bg-s3" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
