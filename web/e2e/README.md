# web/e2e

Playwright smoke tests against the real laf-office web UI. Two specs, two phases:

| Spec | Phase | Precondition |
|---|---|---|
| `tests/wizard.spec.ts` | fresh install | **no** `~/.laf-office/onboarded.json` — laf-office serves the onboarding wizard |
| `tests/smoke.spec.ts` | post-onboarding shell | `~/.laf-office/onboarded.json` is **seeded** — laf-office serves the shell, with sidebar + agent panel |

CI runs both in `.github/workflows/ci.yml :: web-e2e` by booting laf-office twice (once with each precondition).

## Running locally

Use `web/e2e/run-local.sh`. It pins `LAF_OFFICE_RUNTIME_HOME` to a per-run tempdir so your real `~/.laf-office/onboarded.json` and `~/.laf-office/team/broker-state.json` are never touched.

```bash
# both phases (wizard, then shell — what CI does)
web/e2e/run-local.sh

# just one
web/e2e/run-local.sh wizard
web/e2e/run-local.sh shell

# alternate ports if 27891 collides locally
PORT=37891 web/e2e/run-local.sh
```

The script:

- Builds `web/dist` and the `laf-office` binary if missing.
- Pins `LAF_OFFICE_RUNTIME_HOME` to a per-run tempdir, sandboxing all on-disk state.
- For the shell phase, seeds `<RUNTIME_HOME>/.laf-office/onboarded.json` (same JSON CI writes — see `ci.yml :: seed onboarding state`) before launching.
- Launches laf-office on `27891` (configurable) and `27890` (broker port = web port − 1) so it never collides with a developer's normally-running `7891` laf-office.
- Cleans up on exit (kills laf-office, removes the tempdir).

## Why this script exists at all

The smoke spec assumes `onboarded.json` is seeded — without it, laf-office serves the wizard and `.agent-panel` (a shell-only component) never mounts, so the tests fail with a 10s locator timeout that looks like a UI regression but is really a missing precondition. The CI workflow handles this in shell; this script is the local-friendly equivalent so devs don't have to read the workflow YAML to figure out the contract.
