import { scene } from "./lib";

// The Sample patients menu: all six hold-out samples shown, then the LAD case is loaded.
scene("s05b_samples", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?notour", false);
  await p.getByRole("button", { name: /Sample patients/ }).first().waitFor();
  await p.waitForTimeout(2500); // 3D mounted, neutral heart
  await d.start();
  await d.until(0.7);
  await d.click(p.getByRole("button", { name: /Sample patients/ }).first());
  const items = p.getByRole("menuitem");
  await items.first().waitFor();
  await d.mark("menu", p.getByRole("menu"));
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    await d.moveToLoc(items.nth(i), 0.3, 0.5);
    await d.until(d.now() + 0.55);
  }
  const lad = p.getByRole("menuitem", { name: /single vessel/ });
  await d.moveToLoc(lad, 0.3, 0.5);
  await d.at("pick", -1.4);
  await d.click(lad);
  await d.waitColours();
  await d.mark("pick");
  await d.park(1180, 900);
  await d.end();
});
