import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/55" />
        <D.Content
          className={cx(
            "fixed left-1/2 top-1/2 z-[61] flex max-h-[min(90vh,920px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-s1 shadow-soft outline-none",
            wide ? "max-w-[980px]" : "max-w-[520px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-lg font-semibold">{title}</D.Title>
              <D.Description className={description ? "mt-0.5 text-sm text-t2" : "sr-only"}>
                {description ?? title}
              </D.Description>
            </div>
            <D.Close aria-label="Close" className="rounded-md p-1.5 text-t2 hover:bg-s2 hover:text-t1">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="scroll-y min-h-0 px-5 py-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
