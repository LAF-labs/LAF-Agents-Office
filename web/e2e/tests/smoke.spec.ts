import { test, expect, type Page } from '@playwright/test';

// Guards the class of regression that broke for users after the Garry Tan RT:
// React render-time crash ("Minified React error #31 — Objects are not valid
// as a React child") on first agent click. PR #101 fixed the specific bug;
// this test makes sure the next one gets caught in CI instead of in Slack.
//
// Boots an authenticated, completed workspace in the real laf-office shell.
// Wizard coverage lives in wizard.spec.ts.

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

// Wait for React's first commit: the static #skeleton placeholder is gone
// and React has committed something into #root.
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

async function signUpAndCompleteOnboarding(page: Page): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signup = await page.request.post('/api/auth/signup', {
    data: {
      email: `e2e-${suffix}@example.com`,
      name: 'E2E Founder',
      password: 'password123',
      team_action: 'create',
      team_name: `E2E Team ${suffix}`,
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();

  const complete = await page.request.post('/api/onboarding/complete', {
    data: {
      skip_task: true,
      task: '',
      blueprint: '',
      agents: ['ceo', 'fe', 'be', 'reviewer'],
    },
  });
  expect(complete.ok(), await complete.text()).toBeTruthy();
}

async function openAuthenticatedShell(page: Page): Promise<void> {
  await signUpAndCompleteOnboarding(page);
  await page.goto('/');
  await waitForReactMount(page);

  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.home-composer textarea')).toBeVisible({ timeout: 10_000 });
}

async function openCommandPalette(page: Page): Promise<void> {
  // Browser chrome can intercept Ctrl/Cmd+K before Playwright delivers it to
  // the page. Dispatch the same app-level keydown so the shortcut handler is
  // still covered without depending on host-browser accelerator behavior.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function openAgentFromPalette(page: Page, query = 'ceo'): Promise<void> {
  await openCommandPalette(page);
  const paletteInput = page.locator('.search-input');
  await expect(paletteInput).toBeVisible({ timeout: 10_000 });
  await paletteInput.fill(query);

  const agentItem = page.locator('.cmd-palette-item').filter({
    has: page.locator('.cmd-palette-item-meta', { hasText: '@ceo' }),
  });
  await expect(agentItem.first()).toBeVisible({ timeout: 10_000 });
  await agentItem.first().click();
}

test.describe('laf-office web UI smoke (shell)', () => {
  test('initial page render does not trip the React error boundary', async ({ page }) => {
    const getErrors = collectReactErrors(page);

    await openAuthenticatedShell(page);

    await expect(page.getByTestId('error-boundary')).toHaveCount(0);

    const errors = getErrors();
    expect(
      errors,
      `Uncaught errors during initial render:\n  ${errors.join('\n  ')}`,
    ).toHaveLength(0);
  });

  test('command palette renders the seeded agents (broker wired)', async ({ page }) => {
    await openAuthenticatedShell(page);

    await openCommandPalette(page);
    const paletteInput = page.locator('.search-input');
    await expect(paletteInput).toBeVisible({ timeout: 10_000 });
    await paletteInput.fill('ceo');
    await expect(page.locator('.cmd-palette-item-meta', { hasText: '@ceo' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('opening an agent does not crash the UI (React #31 guard)', async ({ page }) => {
    // The React #31 crash surfaced on first "click CEO". Reproduce that
    // path through the current command palette agent entry and assert no crash.
    const getErrors = collectReactErrors(page);

    await openAuthenticatedShell(page);
    await openAgentFromPalette(page);

    // Deterministic post-click signal: opening a palette agent sets
    // activeAgentSlug in the store, which mounts <AgentPanel> → `.agent-panel`
    // (see components/agents/AgentPanel.tsx). Waiting on the panel — instead
    // of networkidle, which never settles due to the live SSE stream — gives
    // the panel a cycle to render and any errors a cycle to fire.
    await expect(page.locator('.agent-panel').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);

    const errors = getErrors();
    expect(
      errors,
      `Uncaught errors after agent click:\n  ${errors.join('\n  ')}`,
    ).toHaveLength(0);
  });
});
