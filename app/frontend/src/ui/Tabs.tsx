import * as T from "@radix-ui/react-tabs";
import { cx } from "./cx";

export const TabsRoot = T.Root;
export const TabsContent = T.Content;

export function TabsList({
  items,
  label,
  className,
}: {
  items: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <T.List aria-label={label} className={cx("flex gap-1 rounded-md bg-s2 p-0.5", className)}>
      {items.map((i) => (
        <T.Trigger
          key={i.value}
          value={i.value}
          className="h-8 min-w-0 flex-1 truncate rounded-[5px] px-2 text-xs font-medium text-t2 transition-colors duration-150 hover:text-t1 data-[state=active]:bg-s3 data-[state=active]:text-t1"
        >
          {i.label}
        </T.Trigger>
      ))}
    </T.List>
  );
}
