import * as A from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export const AccordionRoot = A.Root;

export function AccordionItem({
  value,
  title,
  aside,
  children,
}: {
  value: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <A.Item value={value} className="border-b border-line">
      <A.Header className="sticky top-0 z-[2] m-0 bg-s1">
        <A.Trigger className="group flex h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold text-t1 hover:bg-s2">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {aside}
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-t3 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
          />
        </A.Trigger>
      </A.Header>
      <A.Content className="overflow-hidden">
        <div className="px-4 pb-3 pt-1">{children}</div>
      </A.Content>
    </A.Item>
  );
}
