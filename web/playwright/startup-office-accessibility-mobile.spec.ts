import { expect, test } from "@playwright/test";

test.describe("Startup Office accessibility and mobile review", () => {
  test("approval desk remains keyboard reachable on mobile", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Startup Office|스타트업 오피스/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Approval Desk|승인 데스크/i })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });

  test("desktop beta operations text remains visible without overlap", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Beta operations|베타 운영/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Workspace activity|워크스페이스 활동/i })).toBeVisible();
  });
});
