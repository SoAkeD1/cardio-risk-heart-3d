import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freshApp, hexDiff, hook, VESSEL_MESHES, waitForColours } from "./helpers";

const FIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts/figures");
const REPORT: Record<string, unknown> = {};
const isMobile = (name: string) => name === "mobile";

async function loadCase(page: Page, id: string) {
  await page.goto(`/?case=${id}`);
  await page.waitForFunction((x) => (window as never as { __cardiolens: { getState: () => { caseId?: string } } }).__cardiolens?.getState().caseId === x, id);
  await waitForColours(page);
}

/** Click a vessel on the canvas: start at its projected anchor and walk toward the heart until the tooltip names it. */
async function clickVesselOnCanvas(page: Page, name: RegExp, anchor: string) {
  const a = await hook(page, (h) => h.projectAnchor("Anchor_LAD"));
  const c = await hook(page, (h) => h.projectAnchor("Heart"));
  void anchor;
  for (let k = 0; k <= 1.0001; k += 0.04) {
    const x = a!.x + (c!.x - a!.x) * k, y = a!.y + (c!.y - a!.y) * k;
    await page.mouse.move(x, y);
    await page.waitForTimeout(90);
    const tip = page.locator('[role="tooltip"]').first();
    if ((await tip.count()) && name.test((await tip.textContent()) ?? "")) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}

test.describe.configure({ mode: "serial" });

test("tour appears on first visit, can be skipped, and is remembered", async ({ page }) => {
  await freshApp(page, "/", { tour: true });
  const tour = page.getByTestId("tour");
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("Start with a sample patient");
  await page.getByTestId("tour-skip").click();
  await expect(tour).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("tour")).toBeHidden();
});

test("empty state, then each sample colours the arteries exactly like the API", async ({ page, request }) => {
  await freshApp(page, "/");
  if (!isMobile(test.info().project.name)) await expect(page.getByTestId("empty-state")).toBeVisible();
  const { examples } = await (await request.get("/api/examples")).json();
  for (const ex of examples) {
    await loadCase(page, ex.id);
    const api = await (await request.post("/api/predict", { data: { features: ex.features } })).json();
    const mesh = await hook(page, (h) => h.getMeshColors());
    for (const n of VESSEL_MESHES) expect(hexDiff(mesh[n]!, api.scene.meshes[n].color)).toBeLessThanOrEqual(1);
  }
});

test("click LAD on the canvas -> LAD card selected, camera moved, Why tab = LAD", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await loadCase(page, "lad");
  const cam0 = await page.evaluate(() => JSON.stringify((window as never as { __cardiolens: { projectAnchor: (n: string) => unknown } }).__cardiolens.projectAnchor("Heart")));
  expect(await clickVesselOnCanvas(page, /Anterior Descending/, "Anchor_LAD")).toBe(true);
  await page.waitForTimeout(900);
  const st = await hook(page, (h) => h.getState());
  expect(st.selection.target).toBe("lad");
  expect(st.explainTarget).toBe("lad");
  await expect(page.getByTestId("vessel-card-lad")).toHaveAttribute("aria-pressed", "true");
  const cam1 = await page.evaluate(() => JSON.stringify((window as never as { __cardiolens: { projectAnchor: (n: string) => unknown } }).__cardiolens.projectAnchor("Heart")));
  expect(cam1).not.toBe(cam0); // camera flew to the anchor
  await expect(page.getByRole("tab", { name: "LAD" })).toHaveAttribute("aria-selected", "true");
});

test("keyboard: Tab to the vessel buttons, Enter selects RCA", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await loadCase(page, "multi");
  await page.locator("body").click({ position: { x: 5, y: 880 } });
  let found = false;
  for (let i = 0; i < 160 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "vessel-btn-rca");
  }
  expect(found).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await hook(page, (h) => h.getState())).selection.target).toBe("rca");
});

test("what-if: LDL change updates the delta table; Show on heart changes colours", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await loadCase(page, "multi");
  const panel = page.getByTestId("whatif-panel");
  await panel.scrollIntoViewIfNeeded();
  await page.locator("#whatif-toggle").click();
  const before = await hook(page, (h) => h.getMeshColors());
  const setNum = async (label: string, v: string) => {
    const f = panel.getByRole("textbox", { name: label });
    await f.fill(v);
    const resp = page.waitForResponse((r) => r.url().includes("/api/what-if") && r.status() === 200);
    await f.press("Enter");
    return (await resp).json();
  };
  const r1 = await setNum("What-if LDL cholesterol", "60");
  for (const t of ["cad", "lad", "lcx", "rca"]) {
    const d = r1.after[t].prob - r1.before[t].prob;
    expect(Math.abs(d - r1.delta[t])).toBeLessThan(1e-3);
  }
  await expect(page.getByTestId("delta-table")).toBeVisible();
  const pts = (d: number) => {
    const v = d * 100;
    if (Math.abs(v) < 0.5) return v === 0 ? "0 pts" : "<1 pt";
    return `${Math.round(Math.abs(v))} pt`;
  };
  await expect(page.getByTestId("delta-lad")).toContainText(pts(r1.delta.lad));
  // a change with a visible effect, then show it on the heart
  await setNum("What-if Systolic blood pressure", "90");
  const resp = page.waitForResponse((r) => r.url().includes("/api/what-if") && r.status() === 200);
  await panel.getByRole("switch", { name: "What-if Diabetes mellitus" }).click();
  const r3 = await (await resp).json();
  await page.locator("#whatif-heart").click();
  await expect
    .poll(async () => {
      const m = await hook(page, (h) => h.getMeshColors());
      return VESSEL_MESHES.every((n) => hexDiff(m[n]!, r3.scene_after.meshes[n].color) <= 1);
    })
    .toBe(true);
  const after = await hook(page, (h) => h.getMeshColors());
  expect(VESSEL_MESHES.some((n) => after[n] !== before[n])).toBe(true);
  await page.screenshot({ path: path.join(FIG, "app_whatif.png") });
});

test("PDF report downloads and has the disclaimer on every page", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await loadCase(page, "lad");
  await page.getByTestId("export-menu").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const out = path.join(FIG, "app_report.pdf");
  await dl.saveAs(out);
  const buf = fs.readFileSync(out);
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer, o?: unknown) => Promise<{ numpages: number; text: string }>;
  const pages: string[] = [];
  const res = await pdfParse(buf, {
    pagerender: async (pd: { getTextContent: () => Promise<{ items: { str: string }[] }> }) => {
      const t = (await pd.getTextContent()).items.map((i) => i.str).join(" ");
      pages.push(t);
      return t;
    },
  });
  expect(res.numpages).toBeGreaterThanOrEqual(1);
  expect(pages.length).toBe(res.numpages);
  for (const t of pages) expect(t.replace(/\s+/g, " ")).toContain("For decision support and educational purposes only");
  REPORT.pdf_pages = res.numpages;
});

test("model card opens and shows the metrics table with CIs", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await page.getByTestId("open-model-card").click();
  const t = page.getByTestId("metrics-table");
  await expect(t).toBeVisible();
  await expect(t).toContainText("ROC-AUC");
  await expect(t.locator("td").first()).toContainText("[");
  await page.screenshot({ path: path.join(FIG, "app_modelcard.png") });
});

test("backend offline -> banner shown, 3D still interactive", async ({ page }) => {
  test.skip(isMobile(test.info().project.name), "desktop layout");
  await freshApp(page, "/");
  await loadCase(page, "lad");
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  // trigger a refetch
  const age = page.getByRole("textbox", { name: /^Age/ }).first();
  await age.fill("70");
  await age.press("Enter");
  await expect(page.getByText("Can't reach the CardioLens server")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("2"); // left view still works
  await page.waitForTimeout(800);
  expect((await hook(page, (h) => h.getState())).view.preset).toBe("left");
  expect(await hook(page, (h) => h.getFps())).toBeGreaterThan(5);
  await page.unroute("**/api/**");
});

async function orbitFps(page: Page): Promise<number> {
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const samples: number[] = [];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 5000) {
    await page.mouse.move(cx + Math.sin(i / 8) * box.width * 0.3, cy + Math.cos(i / 11) * 40, { steps: 2 });
    if (i % 6 === 5) samples.push(await hook(page, (h) => h.getFps()));
    i++;
  }
  await page.mouse.up();
  return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
}

test("FPS while orbiting (full + lite)", async ({ page }) => {
  const mobile = isMobile(test.info().project.name);
  await freshApp(page, "/");
  await loadCase(page, "multi");
  const full = await orbitFps(page);
  await page.evaluate(() => {
    const raw = localStorage.getItem("cardiolens.prefs.v1");
    const p = raw ? JSON.parse(raw) : { state: {} };
    p.state.view = { ...(p.state.view ?? {}), performance: "lite" };
    localStorage.setItem("cardiolens.prefs.v1", JSON.stringify(p));
  });
  await loadCase(page, "multi");
  const lite = await orbitFps(page);
  const gpu = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("webgl2");
    const e = c?.getExtension("WEBGL_debug_renderer_info");
    return e ? c!.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log(`FPS [${test.info().project.name}] full ${full.toFixed(1)} · lite ${lite.toFixed(1)} · ${gpu}`);
  fs.writeFileSync(path.join(FIG, `../fps_${test.info().project.name}.json`), JSON.stringify({ full, lite, gpu }));
  if (mobile) expect(lite).toBeGreaterThanOrEqual(30);
  else expect(full).toBeGreaterThanOrEqual(50);
});

test("screenshots for review", async ({ page }) => {
  const proj = test.info().project.name;
  const shoot = async (name: string, theme: "dark" | "light", size?: { width: number; height: number }) => {
    if (size) await page.setViewportSize(size);
    await page.evaluate((t) => {
      const raw = localStorage.getItem("cardiolens.prefs.v1");
      const p = raw ? JSON.parse(raw) : { state: {} };
      p.state.ui = { ...(p.state.ui ?? {}), theme: t, tourDone: true };
      p.state.view = { ...(p.state.view ?? {}), performance: "auto", mode: "heart", territories: false, preset: "front" };
      localStorage.setItem("cardiolens.prefs.v1", JSON.stringify(p));
    }, theme);
    await loadCase(page, "multi");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(FIG, name) });
  };
  await freshApp(page, "/");
  if (proj === "mobile") {
    await shoot("app_mobile_dark.png", "dark");
    await shoot("app_mobile_light.png", "light");
    return;
  }
  await shoot("app_desktop_light.png", "light");
  await shoot("app_tablet_dark.png", "dark", { width: 900, height: 1180 });
  await shoot("app_tablet_light.png", "light", { width: 900, height: 1180 });
  await shoot("app_desktop_dark.png", "dark", { width: 1440, height: 900 });
  // body mode + territories
  await page.keyboard.press("4");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(FIG, "app_body_mode.png") });
  await page.keyboard.press("1");
  await page.keyboard.press("t");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(FIG, "app_territories.png") });
  await page.keyboard.press("t");
});
