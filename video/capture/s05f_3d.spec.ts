import { scene } from "./lib";

// 3D: orbit, zoom, hover LAD (tooltip), click LAD (fly-to + two-way selection), hover the left main ("not modelled").
scene("s05f_3d", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.7);
  await d.orbit(-260, 30, 1500);
  await d.until(2.8);
  await d.orbit(260, -30, 1500);
  const c = (await p.locator("canvas").first().boundingBox())!;
  await d.until(5.0);
  await d.wheel(c.x + c.width * 0.5, c.y + c.height * 0.5, -120, 10);
  await p.waitForTimeout(700);
  await d.hoverAnchor("Anchor_LAD");
  await d.mark("hover_lad");
  await d.at("click", -0.25);
  await p.mouse.down();
  await p.waitForTimeout(70);
  await p.mouse.up();
  await d.mark("click_lad", p.getByTestId("vessel-cards"));
  await p.waitForTimeout(1600); // camera flies
  await d.at("lm", -0.6);
  await d.hoverAnchor("Coronary_LM");
  await d.mark("hover_lm");
  await d.until(d.length - 0.6);
  await d.park(1180, 960);
  await d.end();
});
