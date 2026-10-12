// Lighthouse (desktop preset) against the production build:  node e2e/lighthouse.mjs [url]
// Chromium is started by Playwright with a remote-debugging port; Lighthouse attaches to it.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const url = process.argv[2] ?? "http://localhost:8000/?case=lad";
const port = 9333;
const browser = await chromium.launch({
  args: [`--remote-debugging-port=${port}`, "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  const r = await lighthouse(url, { port, output: ["html", "json"], logLevel: "error" }, desktopConfig);
  const [html, json] = r.report;
  fs.writeFileSync("../../artifacts/lighthouse.html", html);
  fs.writeFileSync("../../artifacts/lighthouse.json", json);
  const c = r.lhr.categories;
  const scores = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(JSON.stringify(scores));
  for (const a of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"])
    console.log(a, r.lhr.audits[a].displayValue);
  for (const [k, v] of Object.entries(c))
    for (const ref of v.auditRefs) {
      const a = r.lhr.audits[ref.id];
      if (ref.weight > 0 && a.score !== null && a.score < 0.9) console.log(`  [${k}] ${a.id}: ${a.score} ${a.displayValue ?? ""}`);
    }
} finally {
  await browser.close();
}
