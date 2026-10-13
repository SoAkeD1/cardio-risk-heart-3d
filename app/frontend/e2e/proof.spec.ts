// Proof that nothing is hardcoded: run a second backend on a TEMPORARY copy of artifacts/ in which an
// anatomy_map colour (+ the top colour-scale stop), one threshold and one feature label are changed, point a second
// Vite dev server at it, and assert that the UI shows the changed values with zero frontend code changes.
// The real artifacts/ directory is never modified; the temp copy is deleted afterwards.
import { expect, test } from "@playwright/test";
import { openPatientPanel } from "./helpers";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const FE = path.resolve(HERE, "..");
const API_PORT = 8010;
const WEB_PORT = 5180;
const BASE = `http://localhost:${WEB_PORT}`;
const NEW_NEUTRAL = "#00B3FF";
const NEW_TOP_STOP = "#5B2A86";
const NEW_LAD_THR = 0.555;
const NEW_LABEL = "LDL-C (proof label)";

let tmp = "";
const procs: ChildProcess[] = [];

async function waitFor(url: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timeout waiting for ${url}`);
}

test.describe.configure({ mode: "serial" });
test.beforeEach(() => test.skip(test.info().project.name !== "desktop", "proof runs once"));

test.beforeAll(async () => {
  if (test.info().project.name !== "desktop") return;
  test.setTimeout(300_000);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cardiolens-proof-"));
  const src = path.join(ROOT, "artifacts");
  fs.cpSync(src, tmp, {
    recursive: true,
    filter: (p) => !/[\\/](figures|cache|review)([\\/]|$)/.test(path.relative(src, p) ? "/" + path.relative(src, p) : ""),
  });
  // --- the three modifications (temp copy only)
  const amapP = path.join(tmp, "anatomy_map.json");
  const amap = JSON.parse(fs.readFileSync(amapP, "utf8"));
  for (const ns of amap.neutral_structures) if (ns.unmodelled_coronary) ns.color = NEW_NEUTRAL;
  amap.style.color_scale.stops[amap.style.color_scale.stops.length - 1][1] = NEW_TOP_STOP;
  fs.writeFileSync(amapP, JSON.stringify(amap));
  const thrP = path.join(tmp, "thresholds.json");
  const thr = JSON.parse(fs.readFileSync(thrP, "utf8"));
  thr.lad.threshold = NEW_LAD_THR;
  fs.writeFileSync(thrP, JSON.stringify(thr));
  const schP = path.join(tmp, "feature_schema.json");
  const sch = JSON.parse(fs.readFileSync(schP, "utf8"));
  sch.features.find((f: { name: string }) => f.name === "ldl").label = NEW_LABEL;
  fs.writeFileSync(schP, JSON.stringify(sch));
  // --- second backend + second Vite pointing at it
  const env = { ...process.env, CARDIO_ARTIFACTS: tmp, CARDIOLENS_ARTIFACTS_DIR: tmp };
  const py = path.join(ROOT, ".venv", "Scripts", "python.exe");
  procs.push(spawn(py, ["-m", "uvicorn", "app.backend.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)], { cwd: ROOT, env, stdio: "ignore" }));
  procs.push(
    spawn(`npx vite --port ${WEB_PORT} --strictPort`, {
      cwd: FE,
      env: { ...process.env, CARDIOLENS_API_URL: `http://127.0.0.1:${API_PORT}`, CARDIOLENS_WEB_PORT: String(WEB_PORT) },
      stdio: "ignore",
      shell: true,
    }),
  );
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 240_000);
  await waitFor(`${BASE}/api/health`, 120_000);
});

test.afterAll(() => {
  for (const p of procs) if (p.pid) execSync(`taskkill /F /T /PID ${p.pid}`, { stdio: "ignore" });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); // "restore": the real artifacts were never touched
});

test("changed artifacts show up in the UI with zero frontend code changes", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cardiolens.prefs.v1", JSON.stringify({ state: { ui: { tourDone: true, legendOpen: true } }, version: 0 }));
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/?case=lad`);
  await page.waitForFunction(() => !!(window as never as { __cardiolens?: unknown }).__cardiolens);
  // 1. threshold tick from thresholds.json (via the API)
  const pct = `${Math.round(NEW_LAD_THR * 100)}%`;
  await expect(page.getByTestId("legend-ticks")).toContainText(pct);
  // 2. colours from anatomy_map: legend scale top stop + the unmodelled-vessel (left main) colour on the 3D mesh
  const legendBar = page.getByTestId("legend").locator("div[style*='linear-gradient']").first();
  // browsers normalise inline colours to rgb(): compare in that form
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(NEW_TOP_STOP.slice(i, i + 2), 16));
  await expect.poll(async () => (await legendBar.getAttribute("style")) ?? "").toContain(`rgb(${r}, ${g}, ${b}) 100%`);
  await page.waitForFunction(
    (c) => Object.values((window as never as { __cardiolens: { getMeshColors: () => Record<string, string> } }).__cardiolens.getMeshColors()).includes(c),
    NEW_NEUTRAL,
    { timeout: 60_000 },
  );
  // 3. feature label from feature_schema.json
  await openPatientPanel(page);
  await page.getByRole("searchbox", { name: "Search measurements" }).fill("proof label");
  await expect(page.getByText(NEW_LABEL).first()).toBeVisible();
});
