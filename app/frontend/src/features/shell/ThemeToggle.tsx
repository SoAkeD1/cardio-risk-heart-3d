import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "../../state/store";
import { IconButton } from "../../ui/IconButton";

export function useApplyTheme() {
  const theme = useStore((s) => s.ui.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#040c1b" : "#faf8f4");
  }, [theme]);
}

export function ThemeToggle() {
  const theme = useStore((s) => s.ui.theme);
  const setUi = useStore((s) => s.setUi);
  return (
    <IconButton
      label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setUi({ theme: theme === "dark" ? "light" : "dark" })}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </IconButton>
  );
}
