import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: /api is proxied to FastAPI on :8000. Build: three.js + R3F in their own chunk.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:8000" } },
  // pre-bundle everything up front: no "optimized dependencies changed, reloading" mid-session in dev
  optimizeDeps: {
    include: [
      "jspdf",
      "three",
      "three-stdlib",
      "@react-three/fiber",
      "@react-three/drei",
      "@radix-ui/react-accordion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-slider",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      "@tanstack/react-query",
      "zustand",
      "zustand/middleware",
      "lucide-react",
    ],
  },
  preview: { port: 4173, proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  define: { __TEST_HOOKS__: JSON.stringify(process.env.CARDIOLENS_TEST_HOOKS === "1") },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
} as never);
