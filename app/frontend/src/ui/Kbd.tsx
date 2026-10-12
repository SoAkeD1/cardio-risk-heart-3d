import type { ReactNode } from "react";

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line bg-s2 px-1.5 py-px font-mono text-[11px] text-t2">{children}</kbd>
);
