import { HeartPulse } from "lucide-react";
import { useExamples, useHealth } from "../../api/hooks";
import { Button } from "../../ui/Button";
import { loadExample } from "../patient/SampleMenu";

/** First visit: invite the user to load a sample (the heart stays neutral until then). */
export function EmptyState() {
  const { data } = useExamples();
  const health = useHealth();
  if (!health.data)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center" data-testid="waiting-service">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-s3 border-t-accent" aria-hidden />
        <h2 className="text-base font-semibold">Waiting for prediction service</h2>
        <p className="max-w-[280px] text-sm text-t2">No estimate is shown until the model server answers. The heart stays neutral.</p>
      </div>
    );
  const first = data?.examples.find((e) => e.featured) ?? data?.examples[0];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center" data-testid="empty-state">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-s2">
        <HeartPulse aria-hidden className="h-6 w-6 text-accent" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Load a sample patient to see risk on the heart</h2>
        <p className="mx-auto mt-1 max-w-[280px] text-sm text-t2">
          Or change any measurement on the left: the estimate updates as you type.
        </p>
      </div>
      <Button variant="primary" onClick={() => first && loadExample(first)} disabled={!first}>
        Load a sample patient
      </Button>
      {first && <p className="text-xs text-t3">{first.title}</p>}
    </div>
  );
}
