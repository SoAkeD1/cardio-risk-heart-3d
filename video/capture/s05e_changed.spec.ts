import { scene } from "./lib";

// "What changed": the edits made so far, each revertible with one click.
scene("s05e_changed", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.openDock(false);
  await p.getByRole("button", { name: /^Risk factors/ }).click();
  await p.locator('[data-field="htn"]').getByRole("switch").click();
  await p.waitForTimeout(1500);
  await p.locator('[data-field="current_smoker"]').getByRole("switch").click();
  await p.waitForTimeout(1500);
  const wc = p.getByTestId("what-changed");
  await wc.scrollIntoViewIfNeeded();
  if ((await wc.getByRole("button").first().getAttribute("aria-expanded")) === "false") await wc.getByRole("button").first().click();
  await p.waitForTimeout(3000); // let toasts clear
  await d.start();
  await d.mark("panel", wc);
  await d.moveToLoc(wc, 0.5, 0.3);
  await d.until(2.6);
  const revert = wc.getByTitle("Revert this change").first();
  await d.moveToLoc(revert);
  await d.until(3.6);
  await d.click(revert);
  await d.mark("revert", wc);
  await d.park(1180, 900);
  await d.end();
});
