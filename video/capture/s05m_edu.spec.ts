import { scene } from "./lib";

// Educational overlay (general, sourced facts; never changes the heart), then the light theme.
scene("s05m_edu", async (d) => {
  const p = d.page;
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.5);
  await d.click(p.getByTestId("education-toggle"));
  const card = p.getByTestId("education-card");
  await card.waitFor();
  await d.mark("edu", card);
  await d.moveToLoc(card, 0.5, 0.4);
  await d.at("light", -0.3);
  await d.click(p.getByRole("button", { name: "Close educational content" }));
  await d.click(p.getByRole("button", { name: "Switch to light theme" }));
  await d.mark("light");
  await d.park(1180, 900);
  await d.end();
});
