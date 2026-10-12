import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import { testHooksEnabled } from "../../test/hooks";

/** Dev-only debug drawer (Ctrl+Shift+D): last /api/predict payloads, latency, changed features, stale/fresh. */
export function DebugDrawer() {
  const [open, setOpen] = useState(false);
  const log = useStore((s) => s.requestLog);
  const stale = useStore((s) => s.stale);
  const offline = useStore((s) => s.offline);
  const pending = useStore((s) => s.pending);
  useEffect(() => {
    if (!testHooksEnabled()) return;
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  if (!open || !testHooksEnabled()) return null;
  const last = log[0];
  return (
    <aside
      data-testid="debug-drawer"
      className="fixed bottom-10 right-3 z-[95] max-h-[60vh] w-[min(440px,calc(100vw-24px))] overflow-auto rounded-md border border-line bg-s1 p-3 font-mono text-[11px] text-t2 shadow-soft"
    >
      <div className="mb-2 flex items-center justify-between font-sans text-xs font-semibold text-t1">
        Debug (dev only · Ctrl+Shift+D)
        <span className={stale ? "text-warn" : "text-t2"}>{offline ? "OFFLINE · stale" : pending ? "pending…" : stale ? "stale" : "fresh"}</span>
      </div>
      {last && (
        <>
          <div className="text-t1">
            last: {last.status} · {last.latencyMs ?? "–"} ms · changed: {last.changed.join(", ") || "–"}
          </div>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-s2 p-2">{JSON.stringify(last.payload, null, 1)}</pre>
        </>
      )}
      <ul className="mt-2 space-y-0.5">
        {log.slice(1, 12).map((r, i) => (
          <li key={`${r.at}-${i}`}>
            {new Date(r.at).toLocaleTimeString()} {r.status} {r.latencyMs ?? "–"} ms [{r.changed.slice(0, 4).join(", ")}]
          </li>
        ))}
      </ul>
    </aside>
  );
}
