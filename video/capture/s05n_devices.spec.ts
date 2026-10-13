import { scene } from "./lib";

// Responsive layouts, both recorded for the full scene; the editor shows them side by side in device frames.
// Tablet (810x1080): bottom sheet. Phone (390x844, touch): tabs.
scene(
  "s05n_devices",
  async (d) => {
    await d.prefs();
    await d.goto("/?case=multi&notour");
    await d.start();
    await d.until(1.0);
    await d.orbit(-160, 0, 1600);
    await d.until(4.6);
    await d.orbit(160, 0, 1600);
    await d.park(780, 1050);
    await d.end();
  },
  { width: 810, height: 1080, hasTouch: true, clip: "s05n_tablet" },
);

scene(
  "s05n_devices",
  async (d) => {
    const p = d.page;
    await d.prefs();
    await d.goto("/?case=multi&notour");
    const tabs = p.getByRole("tablist", { name: "Panels" });
    await d.start();
    await d.until(1.6);
    await d.click(tabs.getByRole("tab", { name: "Risk" }));
    await d.until(4.0);
    await d.click(tabs.getByRole("tab", { name: "Why" }));
    await d.until(6.4);
    await d.click(tabs.getByRole("tab", { name: "What-if" }));
    await d.park(380, 830);
    await d.end();
  },
  { width: 390, height: 844, isMobile: true, hasTouch: true, clip: "s05n_phone" },
);
