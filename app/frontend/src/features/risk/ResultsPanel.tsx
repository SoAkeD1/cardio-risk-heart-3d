import { useHealth } from "../../api/hooks";

export function ResultsPanel({ only }: { only?: "risk" | "why" | "whatif" }) {
  const h = useHealth();
  return (
    <div className="p-4 text-t2" data-testid="health">
      {only ?? "results"} · API: {h.data ? `ok (${h.data.models.cad})` : h.isError ? "offline" : "…"}
    </div>
  );
}
