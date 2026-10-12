import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAnatomyMap, useHealth, useModelCard } from "../../api/hooks";
import { creditParts } from "../../lib/anatomy";
import { useStore } from "../../state/store";

// The text always comes from the API (config.DISCLAIMER). If the API is unreachable, /meta.json (generated from the
// same config by scripts/sync_assets.py at build time) is used: the disclaimer is never typed into the frontend.
const useStaticMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: async () => (await (await fetch("/meta.json")).json()) as { disclaimer: string }, staleTime: Infinity });

/** Fixed, never dismissible. Text = config.DISCLAIMER from the API. */
export function DisclaimerStrip() {
  const fromPrediction = useStore((s) => s.prediction?.disclaimer);
  const { data } = useModelCard();
  const health = useHealth();
  const meta = useStaticMeta();
  const { data: map } = useAnatomyMap();
  const credit = creditParts(map, data?.dataset_citation);
  const text = fromPrediction ?? health.data?.disclaimer ?? data?.disclaimer ?? meta.data?.disclaimer ?? "";
  return (
    <footer
      role="contentinfo"
      aria-label="Disclaimer and credits"
      className="flex min-h-9 shrink-0 items-center gap-2 border-t border-line bg-s1 px-3 py-1.5 text-xs text-t2"
    >
      <Info aria-hidden className="h-4 w-4 shrink-0 text-info" />
      <p className="min-w-0 flex-1 leading-snug" data-testid="disclaimer">
        {text}
      </p>
      {credit.model && (
        <p className="hidden shrink-0 text-t3 xl:block">
          3D heart:{" "}
          <a className="underline decoration-dotted underline-offset-2 hover:text-t1" href={credit.model.url} target="_blank" rel="noreferrer">
            &lsquo;{credit.model.name}&rsquo; by {credit.model.author}
          </a>
          , {credit.model.license}, modified{credit.dataset ? ` · Data: ${credit.dataset}` : ""}
        </p>
      )}
    </footer>
  );
}
