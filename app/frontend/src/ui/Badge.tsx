import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

/** Neutral badge; risk badges pass an explicit colour from anatomy_map via `style`. */
export function Badge({
  children,
  className,
  style,
  icon,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  icon?: ReactNode;
}) {
  return (
    <span
      style={style}
      className={cx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-s2 px-2 text-xs font-medium text-t1 [&>svg]:h-3.5 [&>svg]:w-3.5",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
