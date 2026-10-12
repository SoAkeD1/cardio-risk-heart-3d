import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import { Kbd } from "./Kbd";
import { cx } from "./cx";

type P = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  active?: boolean;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, P>(({ label, shortcut, active, className, children, ...p }, ref) => (
  <Tooltip
    content={
      <span className="inline-flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </span>
    }
  >
    <button
      ref={ref}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-out [&>svg]:h-[18px] [&>svg]:w-[18px]",
        active ? "bg-s3 text-t1 ring-1 ring-inset ring-[rgb(var(--accent)/0.6)]" : "text-t2 hover:bg-s2 hover:text-t1",
        className,
      )}
      {...p}
    >
      {children}
    </button>
  </Tooltip>
));
IconButton.displayName = "IconButton";
