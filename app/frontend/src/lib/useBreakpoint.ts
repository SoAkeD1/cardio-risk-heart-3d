import { useEffect, useState } from "react";

export type Layout = "desktop" | "laptop" | "tablet" | "mobile";

/** >=1280 desktop (3 columns) · 1024-1279 laptop (left drawer) · 768-1023 tablet (bottom sheet) · <768 mobile (tabs) */
export function layoutFor(w: number): Layout {
  return w >= 1280 ? "desktop" : w >= 1024 ? "laptop" : w >= 768 ? "tablet" : "mobile";
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
