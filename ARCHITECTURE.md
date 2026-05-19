# ARCHITECTURE

How LAF-Office works under the hood, anchored to files you can open. One page. Read it, then the code makes sense.

## The Shape

```
          +----------------------+        +----------------------+
 human -> | Hosted Web Workspace | -----> | Hosted API + DB      |
          | Vercel UI            |        | Vercel + Supabase    |
          +----------------------+        +----------+-----------+
                                                    ^
                                                    |
                                      heartbeat, poll, upload
                                                    |
                                         +----------+-----------+
                                         | LAF Bridge           |
                                         | npx laf-bridge pair  |
                                         +----------+-----------+
                                                    |
                              +---------------------+------------------+
                              | Codex CLI / Claude Code, git, files    |
                              | on the user's computer                  |
                              +-----------------------------------------+
```

The hosted web app never executes a user's local CLI directly. It stores projects, pairing state, execution plans, logs, and receipts. LAF Bridge is the only local execution component: it pairs outbound to the hosted API, advertises available CLIs, receives signed work, runs it locally, and uploads results.

## Core Components

| File | Role |
|---|---|
| `cmd/laf-bridge/` | Local Bridge CLI entrypoint. `npx laf-bridge pair` is the user-facing setup path. |
| `internal/bridge/` | Pairing, heartbeat, provider detection, plan polling, local CLI execution, and completion upload. |
| `api/[...path].js` | Hosted API facade for auth-backed projects, Bridge pairing, device state, execution plans, events, and receipts. |
| `supabase/migrations/` | Hosted schema. Bridge-only cleanup migration removes the previous split local-execution schema. |
| `web/src/components/apps/SettingsApp.tsx` | Bridge connection UI, pairing command, CLI status, and hosted settings behavior. |
| `web/src/components/apps/TasksApp.tsx` | Hosted task creation, Bridge availability guidance, execution state, logs, and receipts. |
| `cmd/laf-office/` | Local desktop/developer entrypoint retained for local workspace workflows and compatibility. |
| `internal/team/` | Local workspace runtime used by `laf-office`; hosted execution reaches local CLIs through Bridge instead. |

## Three Load-Bearing Choices

1. **Bridge is the only local execution component.** Users do not install or start a second local product. The setup surface is one command: `npx laf-bridge pair`.

2. **Hosted API is orchestration, not execution.** Vercel/Supabase owns auth, project records, pairing codes, signed execution plans, logs, and receipts. Local filesystem, git, Codex CLI, and Claude Code access stay on the user's machine.

3. **Outbound local connection.** Bridge calls the hosted API for pairing, heartbeat, pending work, and completion upload. The hosted app does not require inbound access to the user's computer and does not depend on a localhost Go server in production.

## Data Flow Of One Hosted Task

1. User logs into the hosted web workspace and creates or opens a project.
2. Settings shows `npx laf-bridge pair`; the user runs it on their computer.
3. Bridge claims the pairing code, stores device credentials, detects Codex CLI and Claude Code, and starts heartbeat/polling.
4. The web UI shows Bridge status and available local CLIs.
5. User asks for an AI development task in the web UI.
6. Hosted API creates a signed execution plan for the paired Bridge.
7. Bridge polls, verifies the plan, runs the requested local CLI in the selected project workspace, captures logs and file/git summary, then uploads events and the final receipt.
8. The web UI renders progress, result text, changed-files summary, and PR or receipt metadata.

## What's Intentionally Not Here

- No separate local execution product, installer, or start command.
- No web-hosted direct shell access to the user's filesystem or CLI tools.
- No production flow that requires the local Go server to be running.
- No unsupported hosted CLI runtime exposed in onboarding or settings.

## Next Stops

- [`README.md`](README.md) - user-facing hosted Bridge setup.
- [`docs/specs/HOSTED-BRIDGE-PROTOCOL.md`](docs/specs/HOSTED-BRIDGE-PROTOCOL.md) - hosted API and Bridge contract.
- [`docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md`](docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md) - release, Vercel, Supabase, and smoke-test checklist.
