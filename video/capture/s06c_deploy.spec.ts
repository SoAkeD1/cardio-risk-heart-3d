import { scene } from "./lib";

// The live deployment on Vercel (same app, one container service). The editor frames it with the URL.
const LIVE = "https://havoc-rho.vercel.app";

scene("s06c_deploy", async (d) => {
  const p = d.page;
  await d.prefs();
  // warm the container first (cold starts load the models)
  await p.request.get(LIVE + "/api/health", { timeout: 90_000 });
  await p.goto(LIVE + "/?case=lad&notour");
  await d.waitColours().catch(() => {});
  await p.waitForTimeout(1500);
  await d.start();
  await d.until(0.8);
  await d.orbit(-220, 20, 1800);
  await d.until(4.5);
  await d.orbit(220, -20, 1800);
  await d.park(1180, 900);
  await d.end();
});
