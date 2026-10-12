import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, WifiOff, MonitorX, TriangleAlert } from "lucide-react";
import { useHealth } from "../../api/hooks";
import { useStore } from "../../state/store";
import { Button } from "../../ui/Button";

/** Backend offline / model load failure / no WebGL. Status colours are info / warning, never risk colours. */
export function StatusBanner({ noWebGL, modelError, onRetryModel }: { noWebGL: boolean; modelError: boolean; onRetryModel: () => void }) {
  const health = useHealth();
  const offlineFlag = useStore((s) => s.offline);
  const qc = useQueryClient();
  const offline = offlineFlag || (health.isError && !health.data);
  const items: { icon: JSX.Element; text: string; action?: { label: string; run: () => void } }[] = [];
  if (offline)
    items.push({
      icon: <WifiOff className="h-4 w-4" />,
      text: "Can't reach the CardioLens server. Showing the last result; the 3D view still works.",
      action: {
        label: "Retry",
        run: () => {
          useStore.getState().setOffline(false);
          qc.invalidateQueries();
          const s = useStore.getState();
          s.restorePatient({ ...s.patient }, s.hasPatient);
        },
      },
    });
  if (modelError)
    items.push({
      icon: <TriangleAlert className="h-4 w-4" />,
      text: "The 3D model could not be loaded. The dashboard still works.",
      action: { label: "Retry", run: onRetryModel },
    });
  if (noWebGL)
    items.push({
      icon: <MonitorX className="h-4 w-4" />,
      text: "3D graphics (WebGL) are not available in this browser, so a 2D coronary diagram is shown instead.",
    });
  if (!items.length) return null;
  return (
    <div role="status" className="flex flex-col gap-px border-b border-line bg-s2">
      {items.map((i) => (
        <div key={i.text} className="flex items-center gap-2 px-4 py-2 text-sm text-t1">
          <span className="text-warn">{i.icon}</span>
          <span className="min-w-0 flex-1">{i.text}</span>
          {i.action && (
            <Button size="sm" onClick={i.action.run}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {i.action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
