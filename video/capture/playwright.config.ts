import { defineConfig } from "@playwright/test";

// One spec per scene; scenes run one at a time so timing is never disturbed by a parallel browser.
export default defineConfig({
  testDir: ".",
  testMatch: /s\d\d.*\.spec\.ts/,
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    // Edge plays the app's H.264 opening video (s00, s05a); CAPTURE_CHANNEL=chromium for other scenes if Edge misbehaves
    channel: process.env.CAPTURE_CHANNEL === "chromium" ? undefined : "msedge",
    headless: true,
    launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb"] },
  },
});
