import { expect, test } from "@playwright/test";
import { freshApp, hexDiff, hook, VESSEL_MESHES, waitForColours } from "./helpers";

// Phase 4 gate: loading each sample updates the 3D colours to EXACTLY the API scene colours (±1/255).
test("each sample patient colours LAD/LCX/RCA exactly as the API scene", async ({ page, request }) => {
  const { examples } = await (await request.get("/api/examples")).json();
  expect(examples).toHaveLength(6);
  await freshApp(page, "/");
  for (const ex of examples) {
    await page.goto(`/?case=${ex.id}`);
    await page.waitForFunction((id) => (window as unknown as { __cardiolens: { getState: () => { caseId?: string } } }).__cardiolens?.getState().caseId === id, ex.id);
    const api = await (await request.post("/api/predict", { data: { features: ex.features } })).json();
    await waitForColours(page);
    const mesh = await hook(page, (h) => h.getMeshColors());
    for (const n of VESSEL_MESHES) {
      expect(hexDiff(mesh[n]!, api.scene.meshes[n].color), `${ex.id} ${n}`).toBeLessThanOrEqual(1);
    }
  }
});
