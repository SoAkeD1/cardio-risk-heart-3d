import { expect, test } from "@playwright/test";
import { freshApp } from "./helpers";

test("patient sidebar uses the viewport default on initial load and reload", async ({ page }) => {
  await freshApp(page);
  const openByDefault = page.viewportSize()!.width >= 960;
  const toggle = page.getByRole("button", { name: "Toggle patient overview" });
  await expect(toggle).toHaveAttribute("aria-expanded", String(openByDefault));
  await expect(page.getByRole("button", { name: "Model card", exact: true })).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(!openByDefault));
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", String(openByDefault));
});
