import { scene } from "./lib";

// What-if: modifiable factors only. LDL 70, BP 120, smoking off (the "diabetic" sample is a smoker) ->
// before/after table -> show on heart -> hold to compare -> sensitivity chart.
scene("s05j_whatif", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=diabetic&notour");
  const panel = p.getByTestId("whatif-panel");
  await d.start();
  await d.until(0.3);
  await d.scrollTo(p.locator("#whatif"), 12, 1000);
  await d.click(p.locator("#whatif-toggle"));
  await d.mark("caveat", panel);
  await d.at("set", -0.3);
  await d.type(panel.getByRole("textbox", { name: "What-if LDL cholesterol" }), "70", { enter: true });
  await p.waitForTimeout(250);
  await d.type(panel.getByRole("textbox", { name: "What-if Systolic blood pressure" }), "120", { enter: true });
  await p.waitForTimeout(250);
  await d.click(panel.getByRole("switch", { name: "What-if Current smoker" }));
  const delta = p.getByTestId("delta-table");
  await delta.waitFor();
  await d.scrollTo(delta, 120, 700);
  await d.mark("delta", delta);
  await d.at("show", -0.3);
  await d.click(p.locator("#whatif-heart"));
  await d.mark("show");
  await d.until(d.cue("show", 2.2));
  const hold = p.getByRole("button", { name: /Hold to compare/ });
  await d.moveToLoc(hold);
  await p.mouse.down();
  await d.mark("hold", hold);
  await d.until(d.cue("show", 3.9));
  await p.mouse.up();
  await d.at("sens", -0.4);
  const sens = p.getByTestId("sens-legend");
  await d.scrollTo(sens, 260, 900);
  await d.mark("sens", sens);
  await d.until(d.now() + 0.8);
  await d.moveToLoc(sens, 0.5, -1.5);
  await d.park(1180, 900);
  await d.end();
});
