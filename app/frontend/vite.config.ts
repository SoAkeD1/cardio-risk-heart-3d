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
        // path-based (not the object form, which would also pull shared deps like zustand into the 3D chunk and
        // make the entry depend on three.js): the 3D stack only loads with the lazy Viewer
        manualChunks(raw: string) {
          const id = raw.split("\\").join("/");
          const nm = (pkgs: string) => new RegExp("/node_modules/(" + pkgs + ")/").test(id);
          if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) return "react"; // tiny runtime helpers
          if (!id.includes("/node_modules/")) return undefined;
          if (nm("three")) return "three";
          if (
            nm(
              "@react-three/[^/]+|three-stdlib|three-mesh-bvh|maath|camera-controls|@monogrid/[^/]+|troika-[^/]+|meshline|stats-gl|suspend-react|its-fine|react-reconciler|@use-gesture/[^/]+|detect-gpu|hls[.]js|glsl-noise|@mediapipe/[^/]+|tunnel-rat|utility-types|lamina|three-[^/]+",
            )
          )
            return "r3f";
          if (nm("jspdf|html2canvas|canvg|dompurify|fflate|core-js|rgbcolor|stackblur-canvas|svg-pathdata")) return "pdf";
          if (nm("react|react-dom|scheduler")) return "react";
          return "vendor"; // everything else shared (radix, zustand, tanstack, lucide...) -> one vendor chunk
        },
      },
    },
  },
  define: { __TEST_HOOKS__: JSON.stringify(process.env.CARDIOLENS_TEST_HOOKS === "1") },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
} as never);
