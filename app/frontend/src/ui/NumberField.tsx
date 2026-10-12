import { useEffect, useState } from "react";
import { cx } from "./cx";

/** Number entry: commits on blur / Enter; arrow keys step (Shift = x10). */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  unit,
  label,
  invalid,
  id,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  unit?: string;
  label: string;
  invalid?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(v)) return setText(String(value));
    if (v !== value) onCommit(v);
  };
  return (
    <div
      className={cx(
        "flex h-8 items-center rounded-md border bg-s2 pr-2 focus-within:ring-2 focus-within:ring-[rgb(var(--focus))]",
        invalid ? "border-[rgb(var(--warning))]" : "border-line",
      )}
    >
      <input
        id={id}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="num w-full min-w-0 bg-transparent px-2 text-right text-sm text-t1 outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (step ?? 1) * (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
            let v = Number(text) + d;
            if (min != null) v = Math.max(min, v);
            if (max != null) v = Math.min(max, v);
            onCommit(Number(v.toFixed(4)));
          }
        }}
      />
      {unit && <span className="shrink-0 font-mono text-[11px] text-t3">{unit}</span>}
    </div>
  );
}
