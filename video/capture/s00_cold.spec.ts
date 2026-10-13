import { BASE, scene } from "./lib";

// Cold open: the app's own opening animation -> neutral heart -> Sample patients -> "High risk · multi-vessel"
// -> the arteries take on their risk colours. No talking for the first seconds (lead 4.6 s).
scene("s00_cold", async (d) => {
  const p = d.page;
  await d.prefs({ opening: true, tourDone: true });
  await p.goto("data:text/html,<body style='margin:0;background:#000'></body>");
  await d.start();
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: /Sample patients/ }).first().waitFor();
  await d.until(3.3);
  await d.click(p.getByRole("button", { name: /Sample patients/ }).first());
  const item = p.getByRole("menuitem", { name: /multi-vessel/ });
  await item.waitFor();
  await d.moveToLoc(item);
  await d.at("colour", -0.35);
  await d.click(item);
  await d.mark("loaded");
  await d.waitColours();
  await d.park(1180, 900);
  await d.end();
});
