import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freshApp, waitForColours } from "./helpers";

const FIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts/figures");
test.beforeEach(() => test.skip(test.info().project.name !== "desktop", "live-response tests run on the desktop profile"));

type Spec = { name: string; label: string; type: string; min?: number; max?: number; allowed_values?: (string | number)[]; value_labels?: Record<string, string> | null; used_by_model: boolean };

async function loadCase(page: Page, id: string) {
  await freshApp(page, `/?case=${id}`);
  await page.waitForFunction((x) => (window as never as { __cardiolens: { getState: () => { caseId?: string } } }).__cardiolens.getState().caseId === x, id);
  await waitForColours(page);
}

async function reveal(page: Page, label: string) {
  await page.getByRole("searchbox", { name: "Search measurements" }).fill(label);
}

/** Change one field through its real UI control; returns the new value the API must receive. */
async function changeField(page: Page, f: Spec, current: unknown): Promise<string | number> {
  await reveal(page, f.label);
  const row = page.locator(`[data-field="${f.name}"]`);
  if (f.type === "binary" && !f.value_labels) {
    await row.getByRole("switch").click();
    return Number(current) === 1 ? 0 : 1;
  }
  if (f.type === "numeric") {
    const v = Math.round(((f.min ?? 0) + (f.max ?? 1)) / 2) === Number(current) ? Math.round(f.max ?? 1) : Math.round(((f.min ?? 0) + (f.max ?? 1)) / 2);
    const box = row.getByRole("textbox");
    await box.fill(String(v));
    await box.press("Enter");
    return v;
  }
  const opts = (f.allowed_values ?? []).map(String);
  const next = opts.find((o) => o !== String(current)) ?? opts[0]!;
  const label = f.value_labels?.[next] ?? next;
  const radio = row.getByRole("radio", { name: label, exact: true });
  if (await radio.count()) await radio.click();
  else await row.locator("select").selectOption(next);
  return (f.allowed_values ?? []).some((a) => typeof a === "number") ? Number(next) : next;
}

test("10 random feature changes each fire /api/predict with the new value", async ({ page, request }) => {
  const schema = (await (await request.get("/api/schema")).json()).features as Spec[];
  await loadCase(page, "moderate");
  const usable = schema.filter((f) => f.used_by_model);
  // deterministic "random" pick (seeded LCG) so the test is reproducible
  let seed = 20261013;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const picked = new Set<Spec>();
  while (picked.size < 10) picked.add(usable[Math.floor(rnd() * usable.length)]!);
  for (const f of picked) {
    const before = (await page.evaluate(() => (window as never as { __cardiolens: { lastResolved: () => Record<string, unknown> } }).__cardiolens.lastResolved()))[f.name];
    const reqP = page.waitForRequest((r) => r.url().endsWith("/api/predict") && r.method() === "POST" && String(r.postDataJSON()?.features?.[f.name]) !== String(before), { timeout: 10_000 });
    const expected = await changeField(page, f, before);
    const req = await reqP;
    expect(String(req.postDataJSON().features[f.name]), f.name).toBe(String(expected));
    await page.waitForResponse((r) => r.url().endsWith("/api/predict") && r.status() === 200);
  }
});

test("toggling HTN shows a change toast whose values equal the API delta", async ({ page, request }) => {
  await loadCase(page, "moderate");
  const before = await page.evaluate(() => (window as never as { __cardiolens: { lastPrediction: () => { prediction: Record<string, { prob: number }>; resolved_features: Record<string, unknown> } } }).__cardiolens.lastPrediction());
  const schema = (await (await request.get("/api/schema")).json()).features as Spec[];
  const htn = schema.find((f) => f.label === "Hypertension")!;
  const respP = page.waitForResponse((r) => r.url().endsWith("/api/predict") && r.status() === 200);
  await changeField(page, htn, before.resolved_features[htn.name]);
  const after = await (await respP).json();
  const toast = page.getByTestId("change-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Hypertension →");
  const shown = await toast.locator("[data-delta]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-delta"), Number(e.getAttribute("data-value"))]));
  expect(shown.length).toBeGreaterThan(0);
  for (const [k, v] of shown) {
    const api = after.prediction[k as string].prob - before.prediction[k as string]!.prob;
    expect(Math.abs((v as number) - api), `${k}`).toBeLessThan(1e-9);
  }
  // independent check through the API with the same inputs
  const direct = await (await request.post("/api/predict", { data: { features: after.resolved_features } })).json();
  expect(direct.prediction.cad.prob).toBe(after.prediction.cad.prob);
  await page.screenshot({ path: path.join(FIG, "app_change_toast.png") });
});

test("smoking ON -> the lungs region chip appears (region looked up from anatomy_map)", async ({ page, request }) => {
  await loadCase(page, "lad");
  const map = await (await request.get("/api/anatomy-map")).json();
  const schema = (await (await request.get("/api/schema")).json()).features as Spec[];
  const smoker = schema.find((f) => f.label === "Current smoker")!;
  const region = map.body_regions.find((r: { features: string[] }) => r.features.includes(smoker.name));
  const cur = (await page.evaluate(() => (window as never as { __cardiolens: { lastResolved: () => Record<string, unknown> } }).__cardiolens.lastResolved()))[smoker.name];
  expect(Number(cur)).toBe(0);
  await changeField(page, smoker, cur);
  const chip = page.getByTestId(`region-chip-${region.region}`);
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(region.display_name);
  await expect(chip).toContainText("contributing risk factor");
  await page.screenshot({ path: path.join(FIG, "app_smoking_lungs.png") });
  // "What changed" lists it; clicking reverts
  await page.waitForTimeout(2600);
  const wc = page.getByTestId("what-changed");
  await expect(wc).toContainText("Current smoker");
  await wc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(FIG, "app_what_changed.png") });
  const respP = page.waitForResponse((r) => r.url().endsWith("/api/predict") && r.status() === 200);
  await wc.getByRole("button", { name: /Current smoker/ }).click();
  const j = await (await respP).json();
  expect(Number(j.resolved_features[smoker.name])).toBe(0);
});

function listenerPid(port: number): string | null {
  const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
  const line = out.split(/\r?\n/).find((l) => l.includes(`:${port} `) && /LISTENING/.test(l));
  return line?.trim().split(/\s+/).pop() ?? null;
}

test("backend killed -> banner + stale badge -> restarted automatically -> banner clears -> fresh result", async ({ page }) => {
  test.setTimeout(240_000);
  await loadCase(page, "lad");
  const pid = listenerPid(8000);
  expect(pid).toBeTruthy();
  execSync(`taskkill /F /T /PID ${pid}`);
  // an edit while the server is down: last real result is kept and marked stale
  await reveal(page, "Fasting");
  const box = page.locator('[data-field="fbs"]').getByRole("textbox");
  await box.fill("150");
  await box.press("Enter");
  await expect(page.getByText(/Can't reach the CardioLens server/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("stale-badge")).toBeVisible();
  await page.screenshot({ path: path.join(FIG, "app_stale_state.png") });
  // dev.py's watchdog restarts the API; the app re-checks health every 3 s, clears the banner and re-sends
  const fresh = page.waitForResponse((r) => r.url().endsWith("/api/predict") && r.status() === 200, { timeout: 200_000 });
  await expect(page.getByText(/Can't reach the CardioLens server/)).toHaveCount(0, { timeout: 200_000 });
  const j = await (await fresh).json();
  expect(Number(j.resolved_features.fbs)).toBe(150);
  await expect(page.getByTestId("stale-badge")).toHaveCount(0);
});
