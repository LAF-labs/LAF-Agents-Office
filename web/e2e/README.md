# web/e2e

Playwright smoke tests against the real laf-office web UI. Two specs, two phases:

| Spec | Phase | Precondition |
|---|---|---|
| `tests/wizard.spec.ts` | fresh install | **no** `~/.laf-office/onboarded.json` — spec creates a local team account, then laf-office serves the onboarding wizard |
| `tests/smoke.spec.ts` | post-onboarding shell | Spec creates a test account, completes onboarding through the API, then verifies the shell, command palette, and agent panel |

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
- For the shell phase, starts from the same sandboxed runtime; the smoke spec creates its own authenticated test user and completes onboarding through laf-office's HTTP API.
- Launches laf-office on `27891` (configurable) and `27890` (broker port = web port - 1) so it never collides with a developer's normally-running `7891` laf-office.
- Cleans up on exit (kills laf-office, removes the tempdir).

## Why this script exists at all

The smoke spec used to depend on a pre-seeded `onboarded.json`, which made failures look like UI regressions when the real missing precondition was auth/onboarding state. It now creates an authenticated test user and completes onboarding itself, so CI and local runs exercise the same setup path before opening the shell.
