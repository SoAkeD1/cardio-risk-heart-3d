import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Side drawer (patient panel on tablet / mobile). */
export function Sheet({
  open,
  onOpenChange,
  title,
  side = "left",
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  side?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[55] bg-black/45" />
        <D.Content
          className={cx(
            "fixed inset-y-0 z-[56] flex w-[min(360px,92vw)] flex-col border-line bg-s1 shadow-soft outline-none",
            side === "left" ? "left-0 border-r" : "right-0 border-l",
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <D.Title className="text-base font-semibold">{title}</D.Title>
            <D.Description className="sr-only">{title}</D.Description>
            <D.Close aria-label="Close panel" className="rounded-md p-2 text-t2 hover:bg-s2 hover:text-t1">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
