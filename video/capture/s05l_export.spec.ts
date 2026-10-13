import fs from "node:fs";
import path from "node:path";
import { scene, VIDEO } from "./lib";

// Export: PDF report (saved; the editor shows its pages), copy summary, PNG screenshot.
scene("s05l_export", async (d) => {
  const p = d.page;
  await d.ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await d.prefs();
  await d.goto("/?case=multi&notour");
  await d.start();
  await d.until(0.4);
  await d.click(p.getByTestId("export-menu"));
  await d.mark("menu", p.getByRole("menu"));
  await d.until(1.6);
  const dl = p.waitForEvent("download");
  await d.click(p.getByTestId("export-pdf"));
  const file = await dl;
  fs.mkdirSync(path.join(VIDEO, "raw", "export"), { recursive: true });
  await file.saveAs(path.join(VIDEO, "raw", "export", "report.pdf"));
  await d.mark("pdf");
  await d.at("copy", -0.4);
  await d.click(p.getByTestId("export-menu"));
  await d.until(d.now() + 0.5);
  await d.click(p.getByRole("menuitem", { name: /Copy summary/ }));
  await d.mark("copied");
  await d.until(d.now() + 1.4);
  await d.click(p.getByTestId("export-menu"));
  await d.until(d.now() + 0.5);
  const png = p.waitForEvent("download");
  await d.click(p.getByRole("menuitem", { name: /PNG|screenshot/i }));
  await (await png).saveAs(path.join(VIDEO, "raw", "export", "screenshot.png"));
  const summary = await p.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  fs.writeFileSync(path.join(VIDEO, "raw", "export", "summary.txt"), summary);
  await d.park(1180, 900);
  await d.end();
});
