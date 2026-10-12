import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "./ui/Tooltip";
import { Toaster } from "./ui/Toast";

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

// warm the HTTP cache for the 3D model + viewer code once the dashboard has painted (the GLB is served with
// immutable cache headers; a <link rel=preload> in index.html would compete with first paint)
// (skipped for ?case= links: there the 3D view mounts right after the case's first estimate has painted)
if (!new URLSearchParams(location.search).has("case"))
  window.addEventListener("load", () => {
    const ric =
      (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ??
      ((f: () => void) => setTimeout(f, 300));
    ric(() => {
      const lite =
        matchMedia("(pointer: coarse)").matches ||
        ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
      void fetch(lite ? "/models/heart_lite.glb" : "/models/heart.glb", { priority: "low" } as RequestInit).catch(
        () => undefined,
      );
      void import("./three/Viewer");
    });
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
