import { test, expect, type Page } from '@playwright/test';

// Fresh-install onboarding smoke. Assumes laf-office was started WITHOUT a
// pre-seeded ~/.laf-office/onboarded.json. The current web flow requires team
// access first, then App.tsx routes the authenticated fresh user to the Wizard
// (see App.tsx — onboardingComplete=false → <Wizard>).
//
// This is the path Garry Tan's sudden traffic would have hit. If the
// wizard crashes on first paint for a fresh user, they bounce.

function collectReactErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Minified React error') || text.includes('Error boundary')) {
        errors.push(text);
      }
    }
  });
  return () => errors;
}

async function waitForReactMount(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root) return false;
      if (document.getElementById('skeleton')) return false;
      return root.children.length > 0;
    },
    { timeout: 10_000 },
  );
}

async function expectNoReactErrors(
  page: Page,
  getErrors: () => string[],
  context: string,
): Promise<void> {
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);

  // Avoid networkidle here: onboarding also opens the long-lived broker SSE
  // stream, so the page is expected to keep an active request.
  const errors = getErrors();
  expect(errors, `Uncaught errors ${context}:\n  ${errors.join('\n  ')}`).toHaveLength(0);
}

async function signUpIfNeeded(page: Page): Promise<void> {
  const createButton = page.getByRole('button', { name: 'Create account' });
  if ((await createButton.count()) === 0) return;

  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  await page.getByRole('textbox', { name: 'Email' }).fill(`wizard-${suffix}@example.com`);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Wizard Smoke');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('textbox', { name: 'Team name' }).fill('Wizard Smoke Team');
  await createButton.click();
}

// The wizard flow is welcome → identity → agent naming. Fill the two required
// identity fields so the primary CTA enables and we can advance.
async function advanceToAgentNamingStep(page: Page): Promise<void> {
  await expect(page.locator('.wizard-step').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.wizard-step button.btn-primary').first().click();
  await page.locator('#wiz-company').fill('Smoke Test Co');
  await page.locator('#wiz-description').fill('Smoke test description');
  await page.locator('.wizard-step button.btn-primary').first().click();
}

test.describe('laf-office onboarding wizard smoke', () => {
  test('fresh install lands on the welcome step without crashing', async ({ page }) => {
    const getErrors = collectReactErrors(page);

    await page.goto('/');
    await waitForReactMount(page);
    await signUpIfNeeded(page);

    // The Wizard renders `.wizard-step` as its root container
    // (see web/src/components/onboarding/Wizard.tsx — WelcomeStep).
    await expect(page.locator('.wizard-step').first()).toBeVisible({ timeout: 10_000 });
    await expectNoReactErrors(page, getErrors, 'rendering wizard');
  });

  test('advancing from welcome → identity → agent naming step does not crash', async ({ page }) => {
    // Verifies the wizard state machine actually transitions. Flow is:
    // welcome → identity (company + description required) → agent naming.
    // Assert via `.agent-name-card`, the current unit of the starter roster.
    const getErrors = collectReactErrors(page);

    await page.goto('/');
    await waitForReactMount(page);
    await signUpIfNeeded(page);

    await advanceToAgentNamingStep(page);

    await expect(page.locator('.agent-name-card').first()).toBeVisible({ timeout: 10_000 });
    await expectNoReactErrors(page, getErrors, 'advancing wizard');
  });

  test('agent naming step shows the shipped starter roster', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForReactMount(page);
    await signUpIfNeeded(page);

    await advanceToAgentNamingStep(page);

    const cards = page.locator('.agent-name-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const count = await cards.count();
    expect(
      count,
      'expected starter roster agent cards on the agent naming step',
    ).toBeGreaterThanOrEqual(4);
  });
});
