import * as S from "@radix-ui/react-slider";

/** Slider with an optional normal-range band drawn on the track. */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  band,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  band?: [number, number] | null;
  onCommit?: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(Math.max(v, min), max);
  const pos = (v: number) => ((clamp(v) - min) / (max - min)) * 100;
  return (
    <S.Root
      className="relative flex h-6 w-full touch-none select-none items-center"
      min={min}
      max={max}
      step={step}
      value={[clamp(value)]}
      onValueChange={(v) => onChange(v[0]!)}
      onValueCommit={(v) => onCommit?.(v[0]!)}
      aria-label={label}
    >
      <S.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-s3">
        {band && band[1] > min && band[0] < max && (
          <span
            aria-hidden
            title="Typical adult range"
            className="absolute inset-y-0 bg-[rgb(var(--accent)/0.4)]"
            style={{ left: `${pos(band[0])}%`, width: `${pos(band[1]) - pos(band[0])}%` }}
          />
        )}
        <S.Range className="absolute h-full bg-[rgb(var(--text-2)/0.5)]" />
      </S.Track>
      <S.Thumb className="block h-4 w-4 rounded-full border-2 border-[rgb(var(--text-1))] bg-s1 shadow transition-transform duration-100 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus))]" />
    </S.Root>
  );
}
