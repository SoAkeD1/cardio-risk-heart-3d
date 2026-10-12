import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[80] max-w-[280px] rounded-md border border-line bg-s3 px-2.5 py-1.5 text-xs leading-snug text-t1 shadow-soft"
        >
          {content}
          <T.Arrow className="fill-[rgb(var(--surface-3))]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
