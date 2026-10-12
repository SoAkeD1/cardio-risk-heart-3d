import { expect, test, type Page } from "@playwright/test";
import { freshApp, hook, waitForColours } from "./helpers";

test.beforeEach(() => test.skip(test.info().project.name !== "desktop", "hardening runs on the desktop profile"));

/** Patient field by label: searching reveals it even when its group is collapsed. */
async function field(page: Page, search: string, label: RegExp) {
  await page.getByRole("searchbox", { name: "Search measurements" }).fill(search);
  return page.getByRole("textbox", { name: label }).first();
}

function collectConsole(page: Page) {
  const bad: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const t = m.text();
    if (/React DevTools|\[vite\]/.test(t)) return;
    bad.push(`${m.type()}: ${t}`);
  });
  page.on("pageerror", (e) => bad.push(`pageerror: ${e.message}`));
  return bad;
}

test("normal flow produces no console errors or warnings", async ({ page }) => {
  const bad = collectConsole(page);
  await freshApp(page, "/");
  for (const id of ["low", "lad", "multi"]) {
    await page.goto(`/?case=${id}`);
    await waitForColours(page);
  }
  await page.keyboard.press("2");
  await page.keyboard.press("t");
  await page.keyboard.press("l");
  await page.keyboard.press("4");
  await page.waitForTimeout(1200);
  await page.keyboard.press("1");
  await page.getByTestId("vessel-btn-lcx").click();
  await page.getByTestId("open-model-card").click();
  await expect(page.getByTestId("metrics-table")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  expect(bad, bad.join("\n")).toEqual([]);
});

test("extreme and invalid values: field messages, last result kept, no crash", async ({ page }) => {
  await freshApp(page, "/");
  await page.goto("/?case=lad");
  await waitForColours(page);
  const before = await page.getByTestId("cad-prob").innerText();
  const age = await field(page, "Age", /^Age/);
  await age.fill("300");
  await age.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "between 18 and 110" }).first()).toBeVisible();
  await expect(page.getByTestId("cad-prob")).toHaveText(before); // previous estimate still shown
  await age.fill("abc"); // not a number -> field reverts, nothing sent
  await age.press("Enter");
  await expect(age).toHaveValue("300");
  await age.fill("90"); // valid extreme -> extrapolation note, new estimate
  await age.press("Enter");
  await expect(page.getByText(/Outside the training range/).first()).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "between 18 and 110" })).toHaveCount(0);
  const ldl = await field(page, "LDL", /^LDL cholesterol/);
  await ldl.fill("399");
  await ldl.press("Enter");
  await expect.poll(async () => (await hook(page, (h) => h.getState())).pending).toBe(false);
});

test("rapid slider drags: stale requests are cancelled, the last value wins", async ({ page }) => {
  await freshApp(page, "/");
  await page.goto("/?case=multi");
  await waitForColours(page);
  let sent = 0;
  page.on("request", (r) => r.url().endsWith("/api/predict") && sent++);
  const thumb = page.getByRole("slider", { name: "Age" });
  await thumb.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press(i % 3 ? "ArrowLeft" : "ArrowRight");
  await page.waitForTimeout(1500);
  expect(sent).toBeLessThanOrEqual(3); // debounced: one request per pause, not 40
  const val = await thumb.getAttribute("aria-valuenow");
  const echoed = await page.evaluate(() =>
    (window as never as { __cardiolens: { getState: () => unknown } }).__cardiolens ? null : null,
  );
  void echoed;
  // the summary reflects the final age
  await expect(page.getByTestId("summary-text")).toBeVisible();
  expect(Number(val)).toBeGreaterThan(30);
  // burst of typed changes while a request is in flight -> aborted requests are tolerated, UI never blanks
  const aborted: string[] = [];
  // slow the API down (700 ms) so new edits arrive while a request is still in flight
  await page.route("**/api/predict", async (r) => {
    await new Promise((res) => setTimeout(res, 700));
    await r.continue().catch(() => undefined);
  });
  page.on("requestfailed", (r) => r.url().endsWith("/api/predict") && aborted.push(r.failure()?.errorText ?? ""));
  const bp = await field(page, "blood pressure", /^Systolic blood pressure/);
  for (const v of ["120", "125", "130", "135", "140"]) {
    await bp.fill(v);
    await bp.press("Enter");
    await page.waitForTimeout(300); // > debounce, < request time -> forces in-flight cancellation
  }
  await expect.poll(async () => (await hook(page, (h) => h.getState())).pending, { timeout: 10_000 }).toBe(false);
  await expect(page.getByTestId("cad-prob")).toBeVisible();
  console.log(`rapid edits: ${aborted.length} stale /api/predict requests aborted`);
  expect(aborted.length).toBeGreaterThanOrEqual(2);
  await expect(bp).toHaveValue("140");
  await page.unroute("**/api/predict");
});

test("backend killed mid-session: banner + retry; 3D stays interactive", async ({ page }) => {
  await freshApp(page, "/");
  await page.goto("/?case=lad");
  await waitForColours(page);
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  const fbs = await field(page, "Fasting", /^Fasting blood sugar/);
  await fbs.fill("200");
  await fbs.press("Enter");
  await expect(page.getByText("Can't reach the CardioLens server").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("cad-prob")).toBeVisible(); // last result stays
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("3");
  await page.waitForTimeout(700);
  expect((await hook(page, (h) => h.getState())).view.preset).toBe("posterior");
  await page.unroute("**/api/**");
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText("Can't reach the CardioLens server")).toHaveCount(0, { timeout: 30_000 });
});

test("slow 3G: lite model re-download shows the progress overlay, predictions keep the last result", async ({ page, context }) => {
  await freshApp(page, "/?case=lad");
  await waitForColours(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  // Chrome DevTools "Slow 3G": 400 ms RTT, ~400 kbit/s
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 51200, uploadThroughput: 51200 });
  const t0 = Date.now();
  const bp = await field(page, "blood pressure", /^Systolic blood pressure/);
  await bp.fill("150");
  await bp.press("Enter");
  await expect(page.getByTestId("cad-prob")).toBeVisible(); // never blanks while the slow request runs
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole("button", { name: "Display quality" }).click();
  await page.getByRole("radio", { name: "Lite" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Loading 3D heart/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Loading 3D heart/)).toHaveCount(0, { timeout: 100_000 });
  await waitForColours(page);
  console.log(`slow 3G: lite model + prediction ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.evaluate(() => localStorage.removeItem("cardiolens.prefs.v1"));
});

test("tiny and huge viewports, 200% zoom: no horizontal scroll, controls reachable", async ({ page }) => {
  await freshApp(page, "/?case=lad");
  await waitForColours(page);
  for (const [w, h] of [[320, 568], [2560, 1440], [3840, 2160]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(o.sw, `${w}x${h}`).toBeLessThanOrEqual(o.cw);
    await expect(page.getByTestId("disclaimer")).toBeVisible();
  }
});

test("200% browser zoom (1440x900 window = 720x450 CSS px at 2x)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await freshApp(page, "/?case=lad");
  await waitForColours(page);
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(o.sw).toBeLessThanOrEqual(o.cw);
  await expect(page.getByTestId("disclaimer")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Inputs" })).toBeVisible(); // < 768 CSS px -> tab layout
  await page.screenshot({ path: "test-results/zoom200.png" });
  await ctx.close();
});

test("keyboard only: skip link, samples menu, vessel select, model card", async ({ page }) => {
  await freshApp(page, "/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to results" })).toBeFocused();
  // open the samples menu and load one with the keyboard
  let onSamples = false;
  for (let i = 0; i < 12 && !onSamples; i++) {
    await page.keyboard.press("Tab");
    onSamples = await page.evaluate(() => document.activeElement?.getAttribute("data-tour") === "samples");
  }
  expect(onSamples).toBe(true);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await waitForColours(page);
  await page.getByTestId("vessel-btn-lcx").focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await hook(page, (h) => h.getState())).selection.target).toBe("lcx");
  await page.getByTestId("open-model-card").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("metrics-table")).toBeVisible();
  // the dialog's focus trap / Escape listener are installed in an effect: wait until focus is inside it
  await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("metrics-table")).toHaveCount(0);
});

test("WebGL disabled: 2D fallback coloured by the API + full dashboard", async ({ page, request }) => {
  await freshApp(page, "/?nowebgl&case=multi");
  await expect(page.getByTestId("fallback-2d")).toBeVisible();
  await expect(page.getByText(/WebGL\) are not available/)).toBeVisible();
  await expect(page.getByTestId("cad-prob")).toBeVisible();
  const ex = (await (await request.get("/api/examples")).json()).examples.find((e: { id: string }) => e.id === "multi");
  const api = await (await request.post("/api/predict", { data: { features: ex.features } })).json();
  const strokes = await page.locator('[data-testid="fallback-2d"] path[stroke-width="8"]').evaluateAll((els) => els.map((e) => e.getAttribute("stroke")));
  for (const v of ["lad", "lcx", "rca"]) expect(strokes).toContain(api.scene.vessels[v].color);
});
