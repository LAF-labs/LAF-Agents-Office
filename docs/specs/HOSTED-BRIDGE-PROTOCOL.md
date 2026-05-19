# Hosted Bridge Protocol

Status: Bridge-only hosted execution contract

## Invariant

Projects, tasks, execution plans, delivery receipts, wiki write results, and
`agent-memory/v1` packets are product state. LAF Bridge is the only local
execution component. The hosted API must never execute agents, create local
worktrees, or trust browser-provided filesystem paths.

## Pairing

The hosted UI creates a short-lived setup code through:

- `POST /bridge/pairing/start`

The user runs only the LAF Bridge command and pastes the setup code when the
CLI prompts for it:

```sh
npx laf-bridge pair
```

The Bridge claims the code through:

- `POST /bridge/pairing/claim`

Bridge tokens are returned once and stored only as hashes. Bridge-authenticated
routes use `Authorization: Bearer <bridge-token>`. The claim response also
returns `plan_signing_public_key`; Bridge stores that key locally and verifies
every signed execution plan before running local CLI work.

## Device Lifecycle

Bridge reports device state and local capability checks through:

- `POST /bridge/devices/{device_id}/heartbeat`
- `GET /bridge/devices`
- `POST /bridge/devices/{device_id}/revoke`
- `GET /bridge/availability`

Capabilities include OS/arch and detected provider runtimes such as `codex` and
`claude-code`. The UI must show a clear unavailable state when no online Bridge
with a supported local CLI is connected.

## Execution Plans

Browser actions create execution plans; Bridge devices poll and complete them:

- `POST /execution/plans`
- `GET /bridge/devices/{device_id}/pending-plans`
- `POST /execution/plans/{plan_id}/events`
- `POST /execution/plans/{plan_id}/complete`

Hosted Bridge execution targets the current user's paired Bridge. Project plans
include the signed GitHub repository URL and hosted project slug from the
hosted project record; Bridge clones or reuses a project-specific managed
checkout under its Bridge workspace directory and runs Codex/Claude there.
Browser-supplied local filesystem paths and project local-binding APIs are not part of the hosted product contract.
Workspace/team execution must not introduce a separate local product, installer,
command, or queue; it still routes through LAF Bridge devices using this same
Bridge protocol.

## CLI Surface

Hosted onboarding must expose only LAF Bridge:

- `npx laf-bridge pair`

Do not show legacy local-execution commands, URL handlers, native installers, or
legacy execution APIs in product onboarding.

## Hosted API Facade

`api/[...path].js` is the Vercel/Supabase control-plane facade. It performs
Supabase Auth membership checks for browser routes, stores durable project/task
and execution records through PostgREST, authenticates Bridge routes with Bridge
token hashes, and deliberately performs no execution, git, GitHub, worktree, or
canonical wiki filesystem work.

Hosted project execution uses the signed GitHub repository URL and Bridge
managed checkout. The Vercel facade must not expose project local-binding
routes, accept local-binding execution requests, or require any local folder
state from the browser.
