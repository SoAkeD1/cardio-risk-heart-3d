import { scene } from "./lib";

// View presets, Realistic/Clinical (L), heartbeat (H), turntable, legend, then the always-available tools.
scene("s05g_views", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  const presets = p.getByRole("group", { name: "View presets" });
  await d.start();
  await d.until(0.4);
  await d.click(presets.getByRole("button", { name: "Left" }));
  await d.at("look", -0.2);
  await d.click(p.getByTestId("look-toggle"));
  await d.mark("look");
  await d.until(d.cue("look", 1.3));
  await d.click(presets.getByRole("button", { name: "Front" }));
  await d.at("beat", -0.2);
  await d.click(p.getByRole("button", { name: /^Heartbeat/ }));
  await d.until(d.cue("beat", 1.0));
  await d.click(p.getByRole("button", { name: /^Turntable/ }));
  await d.at("legend", -0.2);
  await d.moveToLoc(p.getByTestId("legend"), 0.5, 0.35);
  await d.mark("legend", p.getByTestId("legend"));
  await d.until(d.cue("legend", 2.6));
  await d.click(p.getByRole("button", { name: /^Turntable/ }));
  await d.key("h");
  await d.click(p.getByTestId("look-toggle"));
  await d.at("tools", -0.2);
  for (const name of [/^Reset view/, /^Fullscreen canvas/, /^Save screenshot/]) {
    await d.moveToLoc(p.getByRole("button", { name }));
    await d.until(d.now() + 0.9);
  }
  await d.click(p.getByRole("button", { name: "Display quality" }));
  await d.mark("quality");
  await d.until(d.now() + 2.0);
  await d.key("Escape");
  await d.key("r");
  await d.park(1180, 900);
  await d.end();
});
