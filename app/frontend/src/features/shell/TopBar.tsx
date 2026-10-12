import { BookOpen, CircleHelp, Keyboard, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { SampleMenu } from "../patient/SampleMenu";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar({
  showPanelToggle,
  onModelCard,
  onShortcuts,
  onHelp,
  exportMenu,
}: {
  showPanelToggle: boolean;
  onModelCard: () => void;
  onShortcuts: () => void;
  onHelp: () => void;
  exportMenu: ReactNode;
}) {
  const setUi = useStore((s) => s.setUi);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-s1 px-2 sm:gap-3 sm:px-4">
      {showPanelToggle && (
        <IconButton label="Patient inputs" onClick={() => setUi({ leftOpen: true })}>
          <PanelLeft />
        </IconButton>
      )}
      <Logo />
      <span className="hidden text-sm text-t3 lg:inline">See where cardiac risk lives.</span>
      <div className="flex-1" />
      <div className="hidden sm:block">
        <SampleMenu />
      </div>
      <Button variant="ghost" onClick={onModelCard} className="hidden md:inline-flex" data-testid="open-model-card">
        <BookOpen aria-hidden className="h-4 w-4" />
        Model card
      </Button>
      <div className="md:hidden">
        <IconButton label="Model card" onClick={onModelCard}>
          <BookOpen />
        </IconButton>
      </div>
      {exportMenu}
      <ThemeToggle />
      <IconButton label="Help: replay the tour" onClick={onHelp}>
        <CircleHelp />
      </IconButton>
      <div className="hidden md:block">
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={onShortcuts}>
          <Keyboard />
        </IconButton>
      </div>
    </header>
  );
}
