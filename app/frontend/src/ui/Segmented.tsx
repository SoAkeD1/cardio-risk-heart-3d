import * as TG from "@radix-ui/react-toggle-group";
import { cx } from "./cx";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="inline-flex w-full rounded-md border border-line bg-s2 p-0.5"
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className={cx(
            "min-w-0 flex-1 truncate rounded-[5px] px-2 text-t2 transition-colors duration-150 hover:text-t1 data-[state=on]:bg-s3 data-[state=on]:font-medium data-[state=on]:text-t1",
            size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
          )}
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}
