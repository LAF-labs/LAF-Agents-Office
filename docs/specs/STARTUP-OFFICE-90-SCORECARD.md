# AI Startup Office 90 Point Scorecard

This scorecard records phase-by-phase evidence against the three 90-point
questions.

## Current Scores

| Phase | Sellable service | Code clarity | Launch readiness | Notes |
| --- | ---: | ---: | ---: | --- |
| Baseline after plan freeze | 82 | 74 | 45 | Direction is clear, but the product still needed a concrete paid-beta wedge and demoable seed state. |
| Phase 1: First Wedge And Offer Lock | 85 | 76 | 48 | The product now has explicit paid-beta validation copy, a guarded Startup Office wedge copy module, and an admin/dev demo seed endpoint. |
| Phase 2: Startup Office Frontend Extraction | 88 | 84 | 55 | Startup Office now has a dedicated cloud product surface with live summary API, operating loops, approvals, receipts, artifacts, company memory preview, drawers, and isolated tests. |
| Phase 3: Backend Domain Extraction | 89 | 88 | 60 | Startup Office server behavior is separated into loop definitions, serializers, repository access, and service helpers, which gives the AI worker and memory phases a clean integration boundary. |
| Phase 4: Cloud AI Loop Execution | 91 | 90 | 75 | Idea Validation and sibling loops now run through a cloud AI worker boundary with model provider config, structured templates, quality checks, async job state, receipts, run detail, failure state, retry/cancel, and cost metadata. |
| Phase 5: Company Memory And Retrieval | 93 | 90 | 80 | Approved outputs now promote into canonical company memory pages with provenance, sources, assumptions, memory diffs, UI preview, and retrieval into future AI runs. |
| Phase 6: Business Operations Objects | 93 | 90 | 84 | Assets, customers, metrics, and signals are now first-party Startup Office objects with CRUD, artifact actions, export, summary counts, and UI visibility. |
| Phase 7: Trust And Approval Policy | 94 | 90 | 88 | Founder control now has an approval policy API, citation requirement defaults, visible support access policy, revision request flow, audit events, and UI revision controls. |

## Phase 1 Evidence

- First wedge fixed as paid beta validation for solo founders.
- Startup Office copy now says what outcome the founder gets.
- Onboarding and auth copy point at paid beta validation instead of broad company operation.
- `POST /startup-office/demo-seed` creates:
  - AI Startup Office demo company profile.
  - Idea Validation pending approval.
  - Offer Package artifact.
  - Customer Discovery receipt.
- Demo seed is owner/admin gated and disabled in production unless explicitly enabled.
- Surface guard blocks local bridge, project/task, connector-first, and full-autonomy positioning in primary hosted copy.

## Remaining Before 90+

- Add billing, usage limits, admin operations, and release gate.

## Phase 2 Evidence

- `SkillsApp.tsx` is back to skill management only; it no longer imports Startup Office API calls or renders the operating console.
- Startup Office API calls live in `web/src/api/startupOffice.ts`.
- The growth route lazy-loads `web/src/components/startup-office/StartupOfficeApp.tsx`.
- Dedicated panels now cover Company Pulse, Operating Loops, Approval Desk, Receipts, Artifacts, and Company Memory preview.
- Founder actions remain explicit: run loop, approve/reject, inspect run detail, inspect artifact, and edit company profile.
- `/startup-office/growth-summary` now returns recent artifacts so the product surface can show real generated outputs.
- Phase 2 test coverage:
  - `StartupOfficeApp.test.tsx` verifies the dedicated surface, loop execution, approval, run/artifact drawers, and profile editing.
  - `SkillsApp.test.tsx` verifies skill management without importing Startup Office surface code.
  - Hosted API tests verify `recent_artifacts` in summary responses.
- Browser smoke covered desktop and mobile widths through the Vite app with mocked hosted API responses. The panel rendered without blank states or overlapping primary content; mocked dev-only EventSource/API-token console errors were expected from the isolated browser harness.

## Phase 3 Evidence

- Startup Office loop definitions now live in `api/lib/startup-office/loopDefinitions.js`.
- Public response shaping and status normalizers now live in `api/lib/startup-office/serializers.js`.
- Supabase table reads, fallback default loops, approval lookup, receipt creation, and slug generation now live in `api/lib/startup-office/repositories.js`.
- Company profile patching and the temporary record-only run draft now live in `api/lib/startup-office/services.js`.
- `api/[...path].js` delegates Startup Office domain behavior through those modules instead of carrying all product logic inline.
- Hosted API tests now pin the module boundaries and still cover profile persistence, loop execution, approvals, receipts, demo seed, and summary artifacts.

## Phase 4 Evidence

- `workers/startup-office/modelClient.js` adds an OpenAI Responses API provider, fake provider for deterministic tests, text/structured generation, optional embeddings, and per-run usage/cost metadata.
- `workers/startup-office/loopRunner.js` moves loop execution through queued, running, waiting approval, failed, canceled, and retryable states.
- Five loop templates now exist for Idea Validation, Offer Package, Customer Discovery, Launch Campaign, and Weekly Operator Review.
- Quality checks require summary, next action, risk level, source/assumption discipline, and no implied external action execution.
- `startup_office_worker_jobs` migration adds durable async job state with attempts, errors, timestamps, indexes, and RLS.
- `POST /startup-office/loops/:id/run` now creates an AI artifact and approval instead of a hard-coded record-only draft.
- `GET /startup-office/runs/:id`, `POST /startup-office/runs/:id/retry`, and `POST /startup-office/runs/:id/cancel` are implemented.
- Startup Office UI now surfaces model/provider and token usage in run detail and treats AI worker failures as visible errors.
- Phase 4 test coverage:
  - Worker unit tests cover successful artifact/approval/receipt creation and failed model calls with receipted failure states.
  - Hosted API tests cover fake AI execution, worker job completion, cost metadata, run detail, deferred queue, cancel, and retry.
- Startup Office UI tests cover run detail model and token usage.

## Phase 5 Evidence

- `startup_office_memory_pages` migration adds canonical approved/draft/archived memory with provenance, sources, assumptions, last verification time, indexes, and RLS.
- Approval now promotes approved artifacts into seven canonical pages: Company Profile, ICP, Offer, Validation Log, Customer Discovery Log, Decisions, and Risks.
- Memory promotion stores artifact/run/approval provenance and writes the changed memory page list into the approval receipt trace.
- Pending approvals carry a `memory_diff`, so the founder can see which memory pages will change before approval.
- Future AI runs retrieve approved memory pages through `contextBuilder`; API tests assert the second run sees the seven approved memory pages.
- Startup Office summary now returns memory pages; the UI previews approved memory, shows memory diffs in approvals, and adds a "Why this output" panel with memory/source/assumption counts.
- Phase 5 test coverage:
  - Migration tests verify the memory schema and RLS.
  - Hosted API tests verify memory writes on approval, provenance, memory receipt trace, summary memory pages, and retrieval into the next run.
- Startup Office UI tests verify memory preview, memory diff, and why-this-output metadata.

## Phase 6 Evidence

- `GET/POST/PATCH /startup-office/assets`, `/customers`, `/metrics`, and `/signals` are implemented as tenant-scoped first-party operating objects.
- Artifact actions now save an artifact as an asset or record an artifact-derived signal without using external connectors.
- `GET /startup-office/export` returns assets, customers, metrics, signals, runs, approvals, receipts, and memory pages as one export bundle.
- Startup Office summary includes recent object counts, and the UI shows an Operating Objects panel.
- Hosted API tests cover CRUD, archive, artifact-to-object actions, and export.
- Startup Office UI tests verify object counts are visible in the main cloud office surface.

## Phase 7 Evidence

- `GET/PATCH /startup-office/policy` exposes founder approval policy defaults and workspace-level overrides.
- Default policy requires founder approval for public claims, outbound messages, pricing changes, customer promises, spend, and legal-sensitive language.
- Public-claim citation requirements are enabled by default, and support access is visible, logged, and time-bound in policy state.
- Approval actions now support `revise`, storing a `revision_requested` approval state, queued run state, revision note metadata, receipt, and audit event.
- Startup Office UI now offers Approve, Reject, and Revise controls on pending approvals.
- Hosted API tests cover policy read/update and revision request behavior.
- Startup Office UI tests cover the revision request call path.
