import { scene } from "./lib";

// The patient panel: dock, schema-driven groups with "N changed" chips, search, help tooltip, effect meter,
// Alt+click reset of one field, Reset all + Undo.
scene("s05c_panel", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.6);
  await d.openDock();
  await d.mark("dock", p.locator("#patient-overview-sidebar"));
  await d.until(3.4);
  const search = p.getByRole("searchbox", { name: "Search measurements" });
  await d.type(search, "chol");
  await d.mark("search", search);
  await d.until(6.6);
  await d.click(p.getByRole("button", { name: "Clear search" }));
  // help tooltip on Age, then its effect meter
  await d.at("field", -0.3);
  const age = p.locator('[data-field="age"]');
  await d.moveToLoc(age.getByRole("button", { name: "About Age" }));
  await d.mark("help", age);
  await d.until(d.cue("field", 3.0));
  await d.moveToLoc(age.getByRole("img", { name: /Effect on the estimate/ }));
  await d.mark("meter", age.getByRole("img", { name: /Effect on the estimate/ }));
  // Alt+click a label resets that field; Reset + Undo
  await d.at("alt", -0.2);
  const weight = p.locator('[data-field="weight"]');
  await d.click(weight.getByText("Weight", { exact: true }).first(), { modifiers: ["Alt"] });
  await d.mark("alt", weight);
  await d.until(d.cue("alt", 2.0));
  await d.click(p.getByRole("button", { name: "Reset all inputs to defaults" }));
  const undo = p.getByRole("button", { name: "Undo" });
  await undo.waitFor();
  await d.mark("undo", undo);
  await d.until(d.now() + 1.1);
  await d.click(undo);
  await d.park(1180, 900);
  await d.end();
});
