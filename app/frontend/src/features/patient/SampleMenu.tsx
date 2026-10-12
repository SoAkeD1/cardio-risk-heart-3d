import * as DM from "@radix-ui/react-dropdown-menu";
import { ChevronDown, UserRound } from "lucide-react";
import { useExamples } from "../../api/hooks";
import type { Example } from "../../api/types";
import { useStore, type Val } from "../../state/store";
import { Button } from "../../ui/Button";

export function loadExample(e: Example) {
  const feats: Record<string, Val> = {};
  for (const [k, v] of Object.entries(e.features)) if (v !== null && v !== undefined) feats[k] = v as Val;
  useStore.getState().loadCase(e.id, feats);
  const url = new URL(window.location.href);
  url.searchParams.set("case", e.id);
  window.history.replaceState(null, "", url);
}

export function SampleMenu({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useExamples();
  const caseId = useStore((s) => s.caseId);
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <Button variant={compact ? "secondary" : "primary"} size={compact ? "sm" : "md"} data-tour="samples" disabled={isLoading}>
          <UserRound aria-hidden className="h-4 w-4" />
          {compact ? "Load sample" : "Sample patients"}
          <ChevronDown aria-hidden className="h-4 w-4 opacity-70" />
        </Button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-[70] w-[min(340px,calc(100vw-24px))] rounded-lg border border-line bg-s1 p-1 shadow-soft"
        >
          <DM.Label className="px-3 pb-1 pt-2 text-xs text-t3">De-identified hold-out patients</DM.Label>
          {(data?.examples ?? []).map((e) => (
            <DM.Item
              key={e.id}
              onSelect={() => loadExample(e)}
              className="flex cursor-pointer flex-col rounded-md px-3 py-2 outline-none data-[highlighted]:bg-s2"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-t1">
                {e.title}
                {caseId === e.id && <span className="text-xs font-normal text-t3">(loaded)</span>}
              </span>
              <span className="text-xs text-t2">{e.subtitle}</span>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
