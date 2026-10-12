import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freshApp, hook, waitForColours } from "./helpers";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts");

async function ready(page: import("@playwright/test").Page, theme: "dark" | "light" = "dark") {
  await freshApp(page, "/", { theme });
  await page.goto("/?case=multi");
  await waitForColours(page);
  await page.waitForTimeout(600);
}

test("no horizontal scroll at 375 / 768 / 1024 / 1280 / 1440 / 1920", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "viewport sweep runs once");
  await ready(page);
  for (const w of [375, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: w < 800 ? 844 : 900 });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    expect(Math.max(o.sw, o.bw), `width ${w}`).toBeLessThanOrEqual(o.cw);
  }
});

test("axe-core: no serious or critical violations (dark, light, model card)", async ({ page }) => {
  const results: Record<string, unknown[]> = {};
  const scan = async (name: string) => {
    const r = await new AxeBuilder({ page } as never).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    results[name] = bad.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
    return { bad, all: r.violations.length };
  };
  await ready(page, "dark");
  const d = await scan("dark");
  await ready(page, "light");
  const l = await scan("light");
  let mc = { bad: [] as unknown[], all: 0 };
  if (test.info().project.name === "desktop") {
    await page.getByTestId("open-model-card").click();
    await expect(page.getByTestId("metrics-table")).toBeVisible();
    mc = await scan("model_card");
    await page.keyboard.press("Escape");
  }
  fs.writeFileSync(path.join(OUT, `axe_${test.info().project.name}.json`), JSON.stringify(results, null, 1));
  console.log(`axe [${test.info().project.name}] serious/critical: dark ${d.bad.length}, light ${l.bad.length}, model card ${mc.bad.length}`);
  expect(d.bad, JSON.stringify(results.dark)).toHaveLength(0);
  expect(l.bad, JSON.stringify(results.light)).toHaveLength(0);
  expect(mc.bad, JSON.stringify(results.model_card)).toHaveLength(0);
});

test("prefers-reduced-motion: no heartbeat, no pulses, instant fly-to", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "once");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const scales: number[] = [];
  for (let i = 0; i < 8; i++) {
    scales.push(await hook(page, (h) => (h as unknown as { getHeartScale: () => number }).getHeartScale()));
    await page.waitForTimeout(120);
  }
  expect(Math.max(...scales)).toBe(1);
  // demand frameloop: idle canvas renders (almost) no frames
  await page.waitForTimeout(1500);
  expect(await hook(page, (h) => h.getFps())).toBeLessThan(10);
  // fly-to is instant: the camera has arrived right after the key press
  const a = await hook(page, (h) => JSON.stringify(h.projectAnchor("Heart")));
  await page.keyboard.press("3");
  await page.waitForTimeout(60);
  const b = await hook(page, (h) => JSON.stringify(h.projectAnchor("Heart")));
  await page.waitForTimeout(700);
  const c = await hook(page, (h) => JSON.stringify(h.projectAnchor("Heart")));
  expect(b).not.toBe(a);
  expect(c).toBe(b);
});
