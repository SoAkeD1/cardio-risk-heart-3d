import { useEffect } from "react";
import { useStore } from "../../state/store";
import { names } from "../../lib/anatomy";
import { goToView, resetView, toggleBodyMode } from "../../lib/views";
import { Dialog } from "../../ui/Dialog";
import { Kbd } from "../../ui/Kbd";

export const SHORTCUTS: [string, string][] = [
  ["1 / 2 / 3 / 4", "View presets (see the canvas toolbar)"],
  ["L", "Realistic ↔ Clinical look"],
  ["T", "Territories on / off"],
  ["B", "Body mode on / off"],
  ["H", "Heartbeat on / off"],
  ["R", "Reset view"],
  ["F", "Fullscreen canvas"],
  ["Esc", "Clear selection / close dialogs"],
  ["?", "This shortcut sheet"],
  ["Alt + click", "Reset a patient field to its default"],
];


export function toggleFullscreen() {
  const el = document.querySelector<HTMLElement>('[data-tour="canvas"]');
  if (!el) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void el.requestFullscreen?.();
}

export function useGlobalShortcuts({ onShortcuts }: { onShortcuts: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // dialogs / menus own Escape and their keys: never compete with them
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (t && (t.closest("input, textarea, select, [contenteditable=true], [role=slider], [role=dialog]") !== null)) return;
      const s = useStore.getState();
      const k = e.key;
      const view = names()?.views.find((v) => v.shortcut === k);
      if (view) goToView(view.key);
      else if (k === "l" || k === "L") s.setView({ look: s.view.look === "realistic" ? "clinical" : "realistic" });
      else if (k === "t" || k === "T") s.setView({ territories: !s.view.territories });
      else if (k === "b" || k === "B") toggleBodyMode();
      else if (k === "h" || k === "H") s.setView({ heartbeat: !s.view.heartbeat });
      else if (k === "r" || k === "R") resetView();
      else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "?") onShortcuts();
      else if (k === "Escape") {
        s.select(undefined);
        return; // no preventDefault: Escape keeps its native meaning
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onShortcuts]);
}

export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="py-2 pr-4">
                <Kbd>{k}</Kbd>
              </td>
              <td className="py-2 text-t2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
