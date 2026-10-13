import { BASE, scene } from "./lib";

// First visit: the opening animation, then the 3-step tour (Next, Next, Done).
scene("s05a_open", async (d) => {
  const p = d.page;
  await d.prefs({ opening: true, tourDone: false });
  await p.goto("data:text/html,<body style='margin:0;background:#000'></body>");
  await d.start();
  await p.goto(BASE + "/");
  const tour = p.getByTestId("tour");
  await tour.waitFor({ timeout: 15_000 });
  await d.mark("tour", tour);
  await d.until(Math.max(d.now() + 1.2, 5.6));
  await d.click(p.getByRole("button", { name: "Next" }));
  await d.until(d.now() + 1.5);
  await d.click(p.getByRole("button", { name: "Next" }));
  await d.until(d.now() + 1.5);
  await d.click(p.getByRole("button", { name: "Done" }));
  await d.park(1180, 860);
  await d.end();
});
