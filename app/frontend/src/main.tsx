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
