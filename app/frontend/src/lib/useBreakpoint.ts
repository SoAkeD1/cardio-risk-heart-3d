import { useEffect, useState } from "react";

export type Layout = "desktop" | "laptop" | "tablet" | "mobile";

/** >=960 three columns · 820-959 left drawer · 768-819 bottom sheet · <768 mobile tabs. */
export function layoutFor(w: number): Layout {
  return w >= 960 ? "desktop" : w >= 820 ? "laptop" : w >= 768 ? "tablet" : "mobile";
}

export function useLayout(): Layout {
  const [l, setL] = useState<Layout>(() => layoutFor(typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setL(layoutFor(window.innerWidth));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return l;
}
