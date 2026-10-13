import { scene } from "./lib";

// Live change feedback on the multi-vessel patient: Hypertension off -> toast with per-target deltas;
// Current smoker on -> lungs region chip; Systolic murmur -> honest "little effect".
scene("s05d_live", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.openDock(false);
  await p.getByRole("button", { name: /^Risk factors/ }).click();
  await p.waitForTimeout(500);
  await d.start();
  const htn = p.locator('[data-field="htn"]').getByRole("switch");
  await d.moveToLoc(htn);
  await d.at("htn", -0.4);
  await d.click(htn);
  const toast = p.getByTestId("change-toast").last();
  await toast.waitFor();
  await d.mark("toast_htn", toast);
  await d.at("smoke", -0.5);
  const smoker = p.locator('[data-field="current_smoker"]').getByRole("switch");
  await d.click(smoker);
  const chip = p.locator('[data-testid^="region-chip-"]').first();
  await chip.waitFor({ timeout: 8000 });
  await d.mark("chip", chip);
  // reveal Systolic murmur via search just before the cue
  await d.until(d.cue("murmur", -1.8));
  await d.type(p.getByRole("searchbox", { name: "Search measurements" }), "murmur");
  await d.at("murmur", -0.1);
  await d.click(p.locator('[data-field="systolic_murmur"]').getByRole("switch"));
  const little = p.getByTestId("toast-little").last();
  await little.waitFor({ timeout: 8000 });
  await d.mark("little", little);
  await d.park(1180, 900);
  await d.end();
});
