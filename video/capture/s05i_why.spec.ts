import { scene } from "./lib";

// Why? SHAP waterfall per target (CAD -> LAD -> RCA, show all), then the physiological breakdown and the
// measurement table sorted by contribution.
scene("s05i_why", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  const why = p.getByTestId("why-panel");
  await d.start();
  await d.until(0.4);
  await d.scrollTo(p.locator("#why"), 12, 1100);
  await d.mark("why", why);
  const tabs = p.getByRole("tablist", { name: "Explain which estimate" });
  await d.until(3.2);
  await d.click(tabs.getByRole("tab").nth(1));
  await d.until(5.0);
  await d.click(tabs.getByRole("tab").nth(3));
  await d.at("table", -1.0);
  await d.scrollTo(p.getByText("Physiological breakdown").first(), 12, 1100);
  await d.mark("breakdown");
  await d.until(d.cue("table", 3.2));
  const table = p.getByTestId("measurement-table");
  await d.scrollTo(table, 40, 900);
  await d.mark("table", table);
  await d.until(d.now() + 1.2);
  const valueHeader = table.getByRole("columnheader").nth(1);
  await d.click(valueHeader);
  await d.until(d.now() + 1.6);
  await d.click(table.getByRole("columnheader").filter({ hasText: /Contrib/ }).first());
  await d.park(1180, 900);
  await d.end();
});
