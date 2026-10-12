import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "subtle";
const styles: Record<Variant, string> = {
  primary: "bg-accent text-[rgb(var(--on-accent))] hover:brightness-110 font-semibold",
  secondary: "bg-s2 text-t1 border border-line hover:bg-s3",
  ghost: "text-t2 hover:text-t1 hover:bg-s2",
  subtle: "bg-s2 text-t1 hover:bg-s3",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }
>(({ variant = "secondary", size = "md", className, ...p }, ref) => (
  <button
    ref={ref}
    className={cx(
      "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-[background,color,filter] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50",
      size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
      styles[variant],
      className,
    )}
    {...p}
  />
));
Button.displayName = "Button";
