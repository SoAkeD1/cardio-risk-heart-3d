import { cx } from "./cx";

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cx("animate-pulse rounded-md bg-s2", className)} />
);
