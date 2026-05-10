# Hosted Deployment Runbook

Status: v1 execution-ready scaffold

## Vercel

The repo now contains a root `vercel.json` that builds the Vite web app from
`web/`, serves `web/dist`, and routes `/api/*` to the hosted control-plane
facade in `api/[...path].js`.

Required Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

The API facade intentionally performs no agent execution, no git operations,
and no filesystem work. It only validates Supabase users/team membership,
mirrors project/task records, manages runner registrations and job leases, and
accepts validated runner job/wiki results.

## Supabase

Apply the Supabase migrations in order:

```sh
supabase/migrations/20260509_hosted_control_plane.sql
supabase/migrations/20260510_runner_job_claim_hardening.sql
supabase/migrations/20260510_runner_pairing_codes.sql
```

The hosted API uses the service role from Vercel server functions, but every
browser-facing route still performs explicit membership checks before reading or
mutating team-scoped records. Runner routes authenticate with the one-time
runner token hash stored in `public.runners`; pass it as a bearer token, not a
query parameter. Job leasing uses the `claim_runner_job` RPC so concurrent
runners cannot claim the same queued job.

## Local Runner Against Hosted

After logging in to the hosted UI, open Settings -> Runner, generate a setup
code, then click `Connect this computer`. The runner installer must register
the `laf-runner://` URL scheme so the browser can invoke:

```text
laf-runner://pair?api_url=https%3A%2F%2F<your-vercel-app>%2Fapi&code=<setup-code>&connect=1
```

If the URL handler is not installed yet, use the fallback command:

```sh
laf-runner pair --api-url https://<your-vercel-app>/api --code <setup-code> --connect
```

`laf-office runner ...` remains supported for local workspace installs, but
hosted onboarding should present `laf-runner` as the primary command.

Installer and protocol registration helpers live under:

- `packaging/README.md`
- `packaging/windows/build-runner-msi.ps1`
- `packaging/windows/laf-runner.wxs`
- `packaging/windows/build-runner-dev-package.ps1`
- `packaging/windows/install-runner.ps1`
- `packaging/windows/install-runner-protocol.ps1`
- `packaging/windows/uninstall-runner.ps1`
- `packaging/macos/build-runner-pkg.sh`
- `packaging/macos/install-runner-protocol.sh`

Windows development packages can be built without external installer tooling:

```powershell
.\packaging\windows\build-runner-dev-package.ps1
```

The resulting zip includes `laf-runner.exe` and a GUI-friendly
`laf-runner-installer.exe`; the user double-clicks the installer, returns to
the browser, and clicks `Connect this computer`. The installer also creates a
per-user login startup entry for `laf-runner connect` so paired runners survive
reboot without requiring PowerShell.

Unsigned Windows MSI builds require WiX:

```powershell
.\packaging\windows\build-runner-msi.ps1
```

With WiX 7, accept the WiX OSMF EULA yourself first or pass
`-AcceptWix7Eula` after confirming the terms. The MSI installs per-user and
registers `laf-runner://` under HKCU. Windows Installer ProductVersion has
three fields; four-part repo versions are encoded into the third field
(`0.0.7.1` -> `0.0.7001`) so upgrades remain monotonic.

For `laf-runner://` pairing, the local runner accepts only trusted API origins:
official `laf-office.team` hosts, loopback development hosts, the already saved
runner API origin, or entries in `LAF_OFFICE_RUNNER_TRUSTED_API_HOSTS`.
Self-hosted deployments should set that environment variable on the runner host
or use the fallback command for first pairing.

macOS packages must be built on macOS with Xcode command line tools:

```sh
packaging/macos/build-runner-pkg.sh
```

Set `MACOS_INSTALLER_SIGN_IDENTITY` to sign the package. Release archives also
include the protocol-only helpers for development and emergency support until
the signed native installer pipeline is fully automated.

For macOS/Linux release tarballs, the existing install script can install only
the runner binary:

```sh
LAF_OFFICE_INSTALL_BINARY=laf-runner sh scripts/install.sh
```

The runner keeps using local `gh auth`, local provider credentials, and local
git worktrees. Hosted state records only runner capability, job events, delivery
receipt metadata, and wiki index results.

Runner host prerequisites:

- `git`
- `gh auth login` when PR creation or repo readiness checks are required
- at least one provider CLI matching the jobs it should lease: `codex`,
  `claude`, or `opencode`
