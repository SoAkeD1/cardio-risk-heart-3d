// View switching driven by anatomy_map.viewer.views (keys, labels, modes, shortcuts).
import { useStore } from "../state/store";
import { firstView, viewMode } from "./anatomy";

export function goToView(key: string) {
  if (!key) return;
  const s = useStore.getState();
  s.setView({ preset: key, mode: viewMode(key) });
  s.requestFly({ preset: key });
}

/** Toggle between the heart and the body mode (first view of each mode). */
export function toggleBodyMode() {
  goToView(firstView(useStore.getState().view.mode === "body" ? "heart" : "body"));
}

/** Re-frame the current view. */
export function resetView() {
  const v = useStore.getState().view;
  useStore.getState().requestFly({ preset: v.preset || firstView(v.mode) });
}
