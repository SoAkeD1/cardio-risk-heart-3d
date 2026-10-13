import type { Page } from "@playwright/test";

export const VESSEL_MESHES = ["Coronary_LAD", "Coronary_LCX", "Coronary_RCA"] as const;

type Hook = {
  getMeshColors: () => Record<string, string>;
  sceneColors: () => Record<string, string>;
  getFps: () => number;
  projectAnchor: (n: string) => { x: number; y: number } | null;
  getState: () => { selection: { target?: string }; explainTarget: string; view: Record<string, unknown>; pending: boolean; caseId?: string };
};

export const hook = <T>(page: Page, fn: (h: Hook) => T) =>
  page.evaluate((src) => new Function("h", `return (${src})(h)`)((window as unknown as { __cardiolens: Hook }).__cardiolens), fn.toString()) as Promise<T>;

export async function freshApp(page: Page, url = "/", opts: { tour?: boolean; theme?: "dark" | "light"; opening?: boolean } = {}) {
  await page.addInitScript(
    ([tourDone, theme, opening]) => {
      try {
        // the once-per-session intro video is covered by its own test; elsewhere it would only steal focus
        if (!opening) sessionStorage.setItem("cardiolens:opening-seen", "1");
        if (!sessionStorage.getItem("__init")) {
          localStorage.setItem("cardiolens.prefs.v1", JSON.stringify({ state: { ui: { theme, tourDone } }, version: 0 }));
          sessionStorage.setItem("__init", "1");
        }
      } catch {
        /* ignore */
      }
    },
    [!opts.tour, opts.theme ?? "dark", !!opts.opening] as const,
  );
  await page.goto(url);
  await page.waitForFunction(() => !!(window as unknown as { __cardiolens?: unknown }).__cardiolens);
}

/** Wait until the 3D binding has tweened to the API scene colours (or time out). */
export async function waitForColours(page: Page) {
  await page.waitForFunction(
    (names) => {
      const h = (window as unknown as { __cardiolens: Hook }).__cardiolens;
      const s = h.sceneColors();
      const m = h.getMeshColors();
      return names.every((n) => s[n] && m[n] && s[n] === m[n]);
    },
    [...VESSEL_MESHES],
    { timeout: 20_000 },
  );
}

export function hexDiff(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
}

/** Desktop starts with the patient dock open; smaller layouts need it opened before using fields. */
export async function openPatientPanel(page: Page) {
  const toggle = page.getByRole("button", { name: "Toggle patient overview" });
  if ((await toggle.count()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByRole("searchbox", { name: "Search measurements" }).waitFor({ state: "visible" });
}
