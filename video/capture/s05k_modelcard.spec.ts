import { scene } from "./lib";

// Model card: metrics with CIs, validation, thresholds/tiers, calibration, reliability, limitations, sample outcomes.
scene("s05k_modelcard", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.3);
  await d.click(p.getByTestId("open-model-card"));
  const card = p.getByTestId("model-card");
  await card.waitFor();
  await d.mark("metrics", p.getByTestId("metrics-table"));
  await d.park(1500, 980);
  const heads = card.locator("h3");
  const n = await heads.count();
  const times = [3.2, 5.2, 7.0, 8.6];
  for (let i = 1; i < Math.min(n - 1, 5); i++) {
    await d.until(times[i - 1]!);
    await d.scrollTo(heads.nth(i), 10, 900);
  }
  await d.at("outcomes", -0.6);
  await d.scrollTo(heads.nth(n - 1), 10, 1000);
  await d.mark("outcomes", heads.nth(n - 1));
  await d.end();
});
