import { Info } from "lucide-react";
import { useModelCard } from "../../api/hooks";
import { useStore } from "../../state/store";

// Fallback is only used if the API cannot be reached at all; the real text always comes from the API
// (config.DISCLAIMER via any prediction response or the model card).
const FALLBACK = "For decision support and educational purposes only. Not a substitute for formal diagnostic imaging or clinical judgement.";

/** Fixed, never dismissible. Text = config.DISCLAIMER from the API. */
export function DisclaimerStrip() {
  const fromPrediction = useStore((s) => s.prediction?.disclaimer);
  const { data } = useModelCard();
  const text = fromPrediction ?? data?.disclaimer ?? FALLBACK;
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
      <p className="hidden shrink-0 text-t3 xl:block">
        3D heart:{" "}
        <a
          className="underline decoration-dotted underline-offset-2 hover:text-t1"
          href="https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089"
          target="_blank"
          rel="noreferrer"
        >
          &lsquo;Realistic Human Heart&rsquo; by neshallads
        </a>
        , CC BY 4.0, modified · Data: Z-Alizadeh Sani (UCI)
      </p>
    </footer>
  );
}
