import { expect, test } from "@playwright/test";

test("first closed beta founder flow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/email/i).fill("founder@example.com");
  await page.getByLabel(/password/i).fill("closed-beta-password");
  await page.getByRole("button", { name: /sign in|log in|continue/i }).click();

  await expect(page.getByRole("heading", { name: /Startup Office|스타트업 오피스/i })).toBeVisible();
  await page.getByRole("button", { name: /Edit profile|프로필 수정/i }).click();
  await page.getByLabel(/Company name|회사명/i).fill("Beta Founder Co");
  await page.getByLabel(/ICP/i).fill("Solo founders selling B2B software");
  await page.getByLabel(/Offer|오퍼/i).fill("Founder-controlled AI Startup Office");
  await page.getByLabel(/Positioning|포지셔닝/i).fill("Safer transparent operator office");
  await page.getByRole("button", { name: /Save profile|프로필 저장/i }).click();

  await page.getByRole("button", { name: /Run Idea Validation loop|아이디어 검증.*실행/i }).click();
  await expect(page.getByRole("heading", { name: /Approval Desk|승인 데스크/i })).toBeVisible();
  await page.getByRole("button", { name: /Approve|승인/i }).first().click();
  await expect(page.getByRole("heading", { name: /Receipts|영수증/i })).toBeVisible();
  await expect(page.getByText(/receipt|영수증|approved|승인/i)).toBeVisible();

  await page.getByRole("button", { name: /logout|sign out|로그아웃/i }).click();
});
