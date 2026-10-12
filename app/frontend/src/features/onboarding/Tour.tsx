import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "../../ui/Button";

const STEPS = [
  { sel: '[data-tour="samples"]', title: "Start here", text: "Start with a sample patient — or enter your own." },
  { sel: '[data-tour="canvas"]', title: "The 3D heart", text: "Each artery is coloured by its predicted stenosis risk. Click one." },
  { sel: '[data-tour="why"], [data-tour="whatif"], [data-tour="results"]', title: "Why, and what if", text: "See what drives the estimate, and explore what-if changes." },
];

function visible(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** 3-step coach marks; skippable, Esc closes, remembered via ui.tourDone (set by the caller on close). */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i]!;

  useLayoutEffect(() => {
    const upd = () => setRect(visible(step.sel)?.getBoundingClientRect() ?? null);
    upd();
    window.addEventListener("resize", upd);
    const t = setInterval(upd, 500);
    return () => {
      window.removeEventListener("resize", upd);
      clearInterval(t);
    };
  }, [step.sel]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 6;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad } : null;
  const cardW = Math.min(320, vw - 24);
  let left = vw / 2 - cardW / 2, top = vh / 2 - 80;
  if (box) {
    const below = box.top + box.height + 12;
    const big = box.height > vh * 0.5;
    top = big ? Math.min(box.top + 24, vh - 200) : below + 170 < vh ? below : Math.max(12, box.top - 170);
    left = big ? Math.max(12, Math.min(box.left + 24, vw - cardW - 12)) : Math.max(12, Math.min(box.left + box.width / 2 - cardW / 2, vw - cardW - 12));
  }
  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="tour">
      <svg className="absolute inset-0 h-full w-full" aria-hidden onClick={onClose}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.left} y={box.top} width={box.width} height={box.height} rx="10" fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        {box && <rect x={box.left} y={box.top} width={box.width} height={box.height} rx="10" fill="none" stroke="rgb(var(--focus))" strokeWidth="2" />}
      </svg>
      <div className="absolute rounded-lg border border-line bg-s1 p-4 shadow-soft" style={{ left, top, width: cardW }}>
        <div className="num text-xs text-t3">
          Step {i + 1} of {STEPS.length}
        </div>
        <h2 id="tour-title" className="mt-1 text-base font-semibold">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-t2">{step.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="tour-skip">
            Skip tour
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" autoFocus onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onClose())}>
              {i < STEPS.length - 1 ? "Next" : "Done"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
