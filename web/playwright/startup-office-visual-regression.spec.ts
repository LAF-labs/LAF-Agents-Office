import { expect, test } from "@playwright/test";

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  fullPage: true,
  maxDiffPixelRatio: 0.01,
};

test.describe("Startup Office visual regression", () => {
  test("desktop founder operating dashboard matches baseline", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Startup Office|스타트업 오피스/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Growth Center|그로스 센터/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Approval Desk|승인 데스크/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Receipts|영수증/i })).toBeVisible();
    await expect(page).toHaveScreenshot("startup-office-founder-dashboard-desktop.png", screenshotOptions);
  });

  test("mobile approval desk matches baseline", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Startup Office|스타트업 오피스/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Approval Desk|승인 데스크/i })).toBeVisible();
    await expect(page).toHaveScreenshot("startup-office-mobile-approval-desk.png", screenshotOptions);
  });

  test("approved receipt state matches baseline", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/");

    await page.getByRole("button", { name: /Run Idea Validation loop|아이디어 검증.*실행/i }).click();
    await expect(page.getByRole("heading", { name: /Approval Desk|승인 데스크/i })).toBeVisible();
    await page.getByRole("button", { name: /Approve|승인/i }).first().click();
    await expect(page.getByRole("heading", { name: /Receipts|영수증/i })).toBeVisible();
    await expect(page.getByText(/approved|승인/i)).toBeVisible();
    await expect(page).toHaveScreenshot("startup-office-approved-receipt-desktop.png", screenshotOptions);
  });
});
