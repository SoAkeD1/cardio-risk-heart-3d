import { scene } from "./lib";

// Offline: the API becomes unreachable (requests aborted in the browser), an edit shows the banner and the
// last result stays; the route is restored and the app recovers by itself. Then the shortcut sheet (?).
scene("s05o_offline", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=lad&notour");
  await d.openDock(false);
  await d.start();
  await p.route("**/api/**", (r) => r.abort("connectionrefused"));
  await d.until(0.5);
  const age = p.locator('[data-field="age"]').getByRole("textbox");
  await d.type(age, "70", { enter: true });
  const banner = p.getByText(/Can't reach the CardioLens server/);
  await banner.waitFor({ timeout: 15_000 });
  await d.mark("banner", banner);
  await d.until(4.6);
  await p.unroute("**/api/**");
  await banner.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await d.mark("recovered");
  await d.at("keys", -0.2);
  await p.locator("canvas").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await d.key("?");
  await d.mark("shortcuts", p.getByRole("dialog"));
  await d.park(1500, 980);
  await d.end();
});
