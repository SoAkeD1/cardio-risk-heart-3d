import { scene } from "./lib";

// Body mode (B) with region glows + x-ray slider, then territories (T) back on the heart.
scene("s05h_body", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.4);
  await d.click(p.getByRole("button", { name: /^Body mode/ }));
  await d.mark("body");
  const xray = p.getByRole("slider", { name: "Body transparency (x-ray)" });
  await xray.waitFor();
  await d.until(3.6);
  const b = (await xray.boundingBox())!;
  await d.drag(b.x + b.width * 0.3, b.y + b.height / 2, b.x + b.width * 0.9, b.y + b.height / 2, 1000);
  await d.until(5.8);
  await d.drag(b.x + b.width * 0.9, b.y + b.height / 2, b.x + b.width * 0.45, b.y + b.height / 2, 800);
  await d.at("terr", -0.6);
  await d.key("b");
  await p.waitForTimeout(700);
  await d.key("t");
  await d.mark("territories");
  await d.park(1180, 900);
  await d.end();
});
