// Ad-hoc screenshot helper for visual review:  node e2e/shot.mjs <url> <out.png> [width] [height] [theme]
import { chromium } from "@playwright/test";

const [url = "http://localhost:5173/?notour&case=multi", out = "shot.png", w = "1440", h = "900", theme = "dark"] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: theme });
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem("cardiolens.prefs.v1", JSON.stringify({ state: { ui: { theme: t, tourDone: true } }, version: 0 }));
  } catch {}
}, theme);
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(+(process.env.WAIT ?? 4000));
if (process.env.ACTION) await new Function("page", `return (async () => { ${process.env.ACTION} })()`)(page);
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ fps: window.__cardiolens?.getFps?.(), gl: (() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c?.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })() }));
console.log(JSON.stringify(info));
console.log(logs.slice(0, 15).join("\n"));
await browser.close();
