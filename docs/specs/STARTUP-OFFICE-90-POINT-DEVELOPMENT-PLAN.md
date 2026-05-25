# AI Startup Office 90 Point Development Plan

Status: new standalone source of truth

This document intentionally ignores previous planning documents. It is the
single execution plan for raising the product to 90/100 or higher on all three
questions:

1. Can we confidently say this service can sell?
2. Is the code clean and clear?
3. If backend and AI APIs are connected, is the service launchable?

The target is not a generic agent platform. The target is a pure-cloud AI
Startup Office: one account owns one company workspace, a founder controls the
company, and AI operators produce business outputs inside our own product.

## 1. Product Decision

### Positioning

Build the safer and more transparent alternative to Polsia:

- Polsia promise: AI runs your company while you sleep.
- Our promise: AI runs a Startup Office that the founder controls.
- Core difference: every important action is visible, sourced, approved, and
  receipted.

### Product Boundary

This product must not compete with local developer agents, Claude Code, Codex,
or existing local workflows. The wedge is not coding. The wedge is business
operation for founders who do not know how to use AI deeply.

Required product boundaries:

- Pure cloud only.
- No local execution setup as a primary experience.
- No connector-first product strategy.
- No external tool dependency in the first paid beta.
- No "bring your Notion/GitHub/Gmail" requirement.
- No project/task developer workflow as the primary model.
- One account starts with one company workspace.
- Team members join a company workspace, not a project board.
- All business assets, memory, approvals, receipts, and operating loops live
  inside our service.

### First Paid Wedge

Do not sell "AI for every business operation" first. Sell:

> AI Startup Office for solo founders validating and launching a paid beta.

The first paid customer should be able to get this result in one session:

1. Create company workspace.
2. Enter idea, ICP, offer, stage, and current constraint.
3. Run Idea Validation.
4. Review sourced artifact.
5. Approve or request revision.
6. Get a receipt.
7. See company memory updated.
8. Run Offer Package or Customer Discovery next.

## 2. What 90/100 Means

### 2.1 Sellable Service Score: 90+

The service earns 90+ only when all of these are true:

- A founder understands the product within 10 seconds of the first screen.
- A founder can complete the first value loop within 10 minutes.
- The first loop output is good enough to use in real customer discovery.
- The product shows the next business action, not just a generated document.
- At least five target founders see a demo.
- At least two founders either pay, sign a beta agreement, or explicitly ask to
  use it for their company.
- The sales narrative is specific: "get your first paid beta validation package"
  rather than "run your whole company with AI."

### 2.2 Code Quality Score: 90+

The code earns 90+ only when all of these are true:

- Startup Office UI is separated from generic Skills UI.
- Startup Office API client code is separated from the large generic client.
- Backend Startup Office logic is extracted from the monolithic route file into
  domain modules.
- Every domain module has clear input, output, permission, and error behavior.
- The first beta flow is covered by unit, API, and browser tests.
- No primary hosted surface reintroduces local execution setup, project/task, or
  developer-agent copy.
- No component owns unrelated responsibilities.
- Each phase can be reviewed as a small PR or commit with a narrow purpose.
- Tests can fail for product regressions, not only TypeScript errors.

### 2.3 Launch Readiness Score: 90+

The service earns 90+ only when all of these are true:

- Auth, company workspace, team membership, profile, loops, runs, artifacts,
  approvals, receipts, memory, billing state, usage limits, and admin
  operations are functional.
- AI loops call real model APIs through a server-side provider abstraction.
- Runs are durable and recoverable after worker failure.
- Every important write has an audit trail.
- Tenant isolation is tested.
- Role permissions are tested.
- Usage and cost limits prevent runaway spend.
- Operators can see stuck runs, failed model calls, and pending approvals.
- A founder can export or delete company data.
- A release gate script verifies the whole beta path.

## 3. Target Architecture

### 3.1 Frontend Modules

Create a dedicated Startup Office frontend area:

```text
web/src/api/startupOffice.ts
web/src/components/startup-office/StartupOfficeApp.tsx
web/src/components/startup-office/CompanyPulsePanel.tsx
web/src/components/startup-office/CompanyProfilePanel.tsx
web/src/components/startup-office/OperatingLoopsPanel.tsx
web/src/components/startup-office/ApprovalDeskPanel.tsx
web/src/components/startup-office/ReceiptsTimelinePanel.tsx
web/src/components/startup-office/ArtifactsPanel.tsx
web/src/components/startup-office/RunDetailDrawer.tsx
web/src/components/startup-office/ArtifactViewer.tsx
web/src/components/startup-office/startupOfficeViewModel.ts
web/src/components/startup-office/startupOfficeCopy.ts
web/src/components/startup-office/StartupOfficeApp.test.tsx
```

`SkillsApp.tsx` should return to being skill management only. The Startup
Office may use skills internally, but it should not render inside the Skills
screen.

### 3.2 Backend Modules

Extract Startup Office backend logic into domain files while keeping the
existing deployment entrypoint intact:

```text
api/lib/http/errors.js
api/lib/http/body.js
api/lib/auth/session.js
api/lib/startup-office/repositories.js
api/lib/startup-office/serializers.js
api/lib/startup-office/policies.js
api/lib/startup-office/services.js
api/lib/startup-office/routes.js
api/lib/startup-office/loopDefinitions.js
api/lib/startup-office/receipts.js
api/lib/startup-office/audit.js
```

The Vercel API handler should route requests. It should not contain domain
logic for profiles, loops, approvals, AI execution, or receipts.

### 3.3 Worker Modules

Add a cloud worker boundary:

```text
workers/startup-office/index.js
workers/startup-office/queue.js
workers/startup-office/contextBuilder.js
workers/startup-office/modelClient.js
workers/startup-office/loopEngine.js
workers/startup-office/qualityChecks.js
workers/startup-office/wikiWriter.js
workers/startup-office/receiptWriter.js
workers/startup-office/loopTemplates/
workers/startup-office/loopTemplates/ideaValidation.js
workers/startup-office/loopTemplates/offerPackage.js
workers/startup-office/loopTemplates/customerDiscovery.js
workers/startup-office/loopTemplates/launchCampaign.js
workers/startup-office/loopTemplates/weeklyReview.js
```

The worker should be deployable separately from the web app if needed, but the
first implementation can run as a server-side job endpoint if that is faster.
The domain contract must still treat execution as asynchronous and durable.

### 3.4 Data Model

The product needs these first-party entities:

- `company_profiles`
- `startup_office_loops`
- `startup_office_runs`
- `startup_office_artifacts`
- `startup_office_approvals`
- `startup_office_receipts`
- `startup_office_assets`
- `startup_office_customers`
- `startup_office_metrics`
- `startup_office_signals`
- `startup_office_billing_accounts`
- `startup_office_usage_events`
- `startup_office_audit_events`
- `startup_office_worker_jobs`

Every table must include:

- `team_id`
- durable IDs
- timestamps
- created or updated actor where relevant
- RLS policies
- useful indexes for workspace-scoped reads

### 3.5 AI Execution Contract

Every loop run must follow this state machine:

```text
created
queued
running
waiting_approval
revision_requested
running_revision
approved
completed
failed
canceled
```

Every run must produce:

- run record
- selected loop definition
- context packet
- model call metadata
- artifact
- quality check result
- approval record when needed
- receipt
- optional wiki memory update

No public, financial, legal-sensitive, or customer-facing action may execute
without approval. In the first beta, external actions should remain draft-only.

## 4. Phase Plan

Each phase must end with tests, a commit, and a written score update against
the three 90-point questions.

### Phase 0: Plan Freeze And Quality Bar

Goal:

- Freeze this document as the implementation contract.

Code work:

- Add this document.
- Add a small release checklist script later, but do not modify product code in
  this phase.

Exit criteria:

- Team agrees this document is the current source of truth.
- No old roadmap is required to understand what to build.

Verification:

- `git diff --check`

Expected score movement:

- Sellable: no product score change.
- Code: slight improvement through clarity.
- Launch readiness: no product score change.

### Phase 1: First Wedge And Offer Lock

Goal:

- Make the product sell one concrete outcome: paid beta validation for solo
  founders.

Code work:

- Create a `startupOfficeCopy.ts` file with explicit first-wedge copy.
- Replace broad "growth" copy with Startup Office operating language.
- Add demo seed definitions for:
  - AI Startup Office demo company.
  - Idea Validation pending approval.
  - Offer Package artifact.
  - Customer Discovery receipt.
- Add a seed endpoint or script usable only in development/admin mode:

```text
POST /startup-office/demo-seed
```

- Add surface guard checks that block:
  - local execution setup copy in hosted primary UI
  - project/task copy in hosted primary UI
  - connector-first copy in onboarding
  - "fully autonomous" copy without approval language

Frontend files:

```text
web/src/components/startup-office/startupOfficeCopy.ts
web/src/components/onboarding/Wizard.tsx
web/src/components/auth/AuthScreen.tsx
web/src/components/sidebar/AppList.tsx
scripts/check-startup-office-surface.cjs
```

Backend files:

```text
api/lib/startup-office/demoSeed.js
api/lib/startup-office/routes.js
api/hosted-api.test.js
```

Exit criteria:

- A founder can read the app and understand the first outcome.
- Internal demos can reset to a realistic company workspace.
- Product copy does not overpromise unattended company operation.

Verification:

- `npm run startup-office:surface`
- `npm --prefix web run test -- src/components/onboarding/Wizard.test.tsx`
- `node --test api/hosted-api.test.js`
- Manual demo seed smoke test.

Score target after phase:

- Sellable: 82 to 85.
- Code: 74 to 76.
- Launch readiness: 45 to 48.

### Phase 2: Startup Office Frontend Extraction

Goal:

- Turn the current operating console into a clean, dedicated product surface.

Code work:

- Move Startup Office UI out of `SkillsApp.tsx`.
- Create `StartupOfficeApp`.
- Keep the route ID stable if needed, but expose labels as Startup Office.
- Move Startup Office API calls into `web/src/api/startupOffice.ts`.
- Create view model helpers that normalize empty states, counts, labels, and
  action availability.
- Make the first screen show:
  - Company Pulse
  - Operating Loops
  - Approval Desk
  - Receipts
  - Artifacts
  - Company Memory preview
- Add `RunDetailDrawer`.
- Add `ArtifactViewer`.
- Add profile editing drawer for ICP, offer, positioning, stage, and priority.

Frontend files:

```text
web/src/api/startupOffice.ts
web/src/components/startup-office/StartupOfficeApp.tsx
web/src/components/startup-office/CompanyPulsePanel.tsx
web/src/components/startup-office/CompanyProfilePanel.tsx
web/src/components/startup-office/OperatingLoopsPanel.tsx
web/src/components/startup-office/ApprovalDeskPanel.tsx
web/src/components/startup-office/ReceiptsTimelinePanel.tsx
web/src/components/startup-office/ArtifactsPanel.tsx
web/src/components/startup-office/RunDetailDrawer.tsx
web/src/components/startup-office/ArtifactViewer.tsx
web/src/components/startup-office/startupOfficeViewModel.ts
web/src/components/startup-office/StartupOfficeApp.test.tsx
web/src/components/workspace/WorkspaceApp.tsx
```

Design requirements:

- Dense, operational, Notion-like workspace.
- No marketing hero inside the app.
- No card-inside-card nesting.
- Every action button uses an icon.
- Approval buttons are keyboard accessible.
- Mobile viewport keeps approvals usable.
- Empty states tell the next action, not a generic absence message.

Exit criteria:

- `SkillsApp.tsx` no longer owns Startup Office UI.
- A user can run a loop, inspect a run, approve/reject, and view receipts from
  the Startup Office surface.
- Component names match product concepts.

Verification:

- `npm --prefix web run typecheck`
- `npm --prefix web run test -- src/components/startup-office`
- `npm --prefix web run test -- src/components/apps/SkillsApp.test.tsx`
- Browser smoke at desktop and mobile widths.

Score target after phase:

- Sellable: 85 to 88.
- Code: 76 to 84.
- Launch readiness: 48 to 55.

### Phase 3: Backend Domain Extraction

Goal:

- Make backend Startup Office code clear, testable, and durable.

Code work:

- Extract company profile, loops, runs, approvals, receipts, artifacts, assets,
  customers, metrics, and signals into repository functions.
- Extract permission checks into policy functions.
- Extract public serializers.
- Add idempotency key support for loop run creation.
- Add request size checks for artifacts and rich inputs.
- Add workspace-scoped audit event helper.
- Add rate limits for:
  - loop creation
  - loop run creation
  - approval actions
  - profile updates
- Add role-specific tests:
  - owner
  - admin
  - manager
  - member
  - viewer
- Add tenant isolation tests:
  - workspace A cannot read workspace B records
  - workspace A cannot mutate workspace B records

Backend files:

```text
api/lib/startup-office/repositories.js
api/lib/startup-office/serializers.js
api/lib/startup-office/policies.js
api/lib/startup-office/services.js
api/lib/startup-office/routes.js
api/lib/startup-office/audit.js
api/lib/startup-office/idempotency.js
api/lib/startup-office/rateLimits.js
api/[...path].js
api/hosted-api.test.js
```

Exit criteria:

- The main API route file delegates Startup Office behavior to modules.
- Backend tests cover domain behavior without relying on UI assumptions.
- API errors are stable and safe for UI display.

Verification:

- `node --test api/hosted-api.test.js`
- Focused tests for repositories and services if test harness is split.
- `git diff --check`

Score target after phase:

- Sellable: 88.
- Code: 84 to 90.
- Launch readiness: 55 to 63.

### Phase 4: Real AI Loop Execution

Goal:

- Replace record-only drafts with real cloud AI outputs.

Code work:

- Add model provider abstraction:

```text
generateStructured(input) -> validated JSON
generateText(input) -> text artifact
embed(input) -> optional retrieval vector
```

- Add model configuration via environment variables.
- Add loop template modules:
  - Idea Validation
  - Offer Package
  - Customer Discovery
  - Launch Campaign
  - Weekly Operator Review
- Add context builder:
  - company profile
  - selected loop
  - recent receipts
  - approved wiki memory
  - relevant assets
  - relevant signals
  - previous run summaries
- Add structured output validators per loop.
- Add quality checks:
  - required fields present
  - claims have sources or are marked as assumptions
  - risk level assigned
  - next action included
  - no external-send action executed
- Add worker job table or queue.
- Add retry with capped attempts.
- Add failure receipts.

Worker files:

```text
workers/startup-office/modelClient.js
workers/startup-office/contextBuilder.js
workers/startup-office/loopEngine.js
workers/startup-office/qualityChecks.js
workers/startup-office/receiptWriter.js
workers/startup-office/wikiWriter.js
workers/startup-office/loopTemplates/ideaValidation.js
workers/startup-office/loopTemplates/offerPackage.js
workers/startup-office/loopTemplates/customerDiscovery.js
workers/startup-office/loopTemplates/launchCampaign.js
workers/startup-office/loopTemplates/weeklyReview.js
```

Backend route changes:

```text
POST /startup-office/loops/:id/run
GET /startup-office/runs/:id
POST /startup-office/runs/:id/retry
POST /startup-office/runs/:id/cancel
```

Exit criteria:

- A real model call creates a useful artifact for Idea Validation.
- Run state progresses asynchronously.
- Failure states are visible and receipted.
- Every model run has cost metadata.

Verification:

- Unit tests with fake model client.
- API tests with fake worker.
- One manual run using a real model key in development.
- No test should depend on live model APIs.

Score target after phase:

- Sellable: 88 to 91.
- Code: 90.
- Launch readiness: 63 to 75.

### Phase 5: Company Memory And Retrieval

Goal:

- Make outputs compound into company memory without becoming a hallucination
  sink.

Code work:

- Add canonical company wiki pages:
  - Company Profile
  - ICP
  - Offer
  - Validation Log
  - Customer Discovery Log
  - Decisions
  - Risks
- Write approved run summaries into wiki memory.
- Store artifact-to-wiki provenance.
- Add memory diff before promotion.
- Add retrieval over:
  - wiki pages
  - uploaded assets
  - recent receipts
  - customer records
- Add source and assumption model:
  - source URL or uploaded file reference
  - assumption text
  - confidence level
  - last verified date

Frontend work:

- Company Memory preview in Startup Office.
- Memory diff in approval flow.
- "Why this output" panel in artifact viewer.

Exit criteria:

- Approved runs update company memory.
- Founder can see what memory changed.
- Future runs use approved memory.

Verification:

- Wiki API tests.
- Startup Office run tests assert memory writes.
- UI tests for memory diff.

Score target after phase:

- Sellable: 91 to 93.
- Code: 90.
- Launch readiness: 75 to 80.

### Phase 6: Business Operations Objects

Goal:

- Move from generated documents to a small company operating system.

Code work:

- Implement first-party CRUD and list APIs for:
  - assets
  - customers/leads
  - metrics
  - signals
- Link each object to runs, artifacts, approvals, and receipts.
- Add filters by loop, status, source, owner, and date.
- Add import through manual paste/upload, not external connectors.
- Add export for assets, customers, metrics, signals, runs, approvals, and
  receipts.

Frontend work:

- Assets panel.
- Customers panel.
- Signals inbox.
- Metrics panel.
- Artifact-to-object actions:
  - save as asset
  - add customer segment
  - record signal
  - add metric

Exit criteria:

- A founder can use the product as the home for beta validation data.
- Outputs are not trapped as static text only.
- All objects remain inside the service.

Verification:

- API tests for CRUD and permissions.
- UI tests for list, create, update, archive.
- Export smoke test.

Score target after phase:

- Sellable: 93.
- Code: 90.
- Launch readiness: 80 to 84.

### Phase 7: Trust, Safety, And Approval Policy

Goal:

- Make transparency and founder control real product mechanics.

Code work:

- Add approval policy configuration:
  - public claims
  - outbound messages
  - pricing changes
  - customer promises
  - spend
  - legal-sensitive language
- Add claim checker:
  - separates cited claims, assumptions, and unsupported claims
  - blocks completion if required citations are missing
- Add revision request flow:
  - founder requests revision
  - worker reruns with revision note
  - receipt links old and new artifacts
- Add audit coverage for every Startup Office write.
- Add immutable receipt behavior.
- Add support access policy:
  - visible
  - logged
  - time-bound

Frontend work:

- Approval policy settings.
- Approval revision form.
- Claim/source panel.
- Receipt export view.
- Audit log view for workspace owners.

Exit criteria:

- Founder can trust what happened, who did it, why it happened, and what changed.
- Risky actions cannot bypass approval.
- Receipts can be used for support and accountability.

Verification:

- Policy unit tests.
- Approval bypass tests.
- Receipt immutability tests.
- UI tests for revision flow.

Score target after phase:

- Sellable: 93 to 94.
- Code: 90.
- Launch readiness: 84 to 88.

### Phase 8: Billing, Limits, Admin, And Notifications

Goal:

- Make the service operable for paid closed beta customers.

Code work:

- Add billing state:
  - trial
  - active
  - past_due
  - paused
  - comped
  - canceled
- Support Stripe or manual operator-controlled billing for the first beta.
- Add plan limits:
  - seats
  - monthly runs
  - monthly model spend
  - storage
  - file upload size
- Add usage metering:
  - model tokens
  - model cost
  - worker duration
  - tool calls
  - storage
- Add admin beta dashboard:
  - workspace list
  - billing state
  - run failures
  - stuck jobs
  - pending approvals
  - usage cost
  - support notes
- Add transactional notifications:
  - invite
  - approval waiting
  - run completed
  - run failed
  - billing blocked

Frontend work:

- Workspace billing banner.
- Usage panel.
- Admin dashboard.
- Notification preferences.

Exit criteria:

- Ten paid beta workspaces can be operated without database spelunking.
- Spend cannot exceed configured limits.
- Founders know when they need to act.

Verification:

- Billing state API tests.
- Limit enforcement tests.
- Admin dashboard tests.
- Email provider fake tests.

Score target after phase:

- Sellable: 94.
- Code: 90.
- Launch readiness: 88 to 91.

### Phase 9: Release Gate And End-To-End Quality

Goal:

- Make quality repeatable before every beta release.

Code work:

- Add release gate script:

```text
npm run beta:release-gate
```

The script should run:

- `git diff --check`
- startup office surface guard
- closed beta goal check if still maintained
- backend API tests
- web typecheck
- web tests
- Playwright first beta flow
- environment preflight
- worker fake-model tests
- migration/schema checks

- Add Playwright flow:
  1. signup or login
  2. create company profile
  3. run Idea Validation
  4. wait for fake worker artifact
  5. approve artifact
  6. inspect receipt
  7. inspect memory update
  8. logout

- Add output evaluation harness:
  - test prompts
  - expected rubric
  - fake source fixtures
  - quality threshold

Exit criteria:

- One command proves the product can be demoed.
- E2E flow catches broken onboarding, run, approval, receipt, and memory paths.
- AI output quality has a regression harness.

Verification:

- `npm run beta:release-gate`
- Manual browser pass on desktop and mobile.

Score target after phase:

- Sellable: 94 to 95.
- Code: 90 to 92.
- Launch readiness: 91 to 93.

### Phase 10: Closed Beta Sales And Operation

Goal:

- Prove that the product sells and can be operated.

Code work:

- Add founder success checklist inside admin dashboard.
- Add beta workspace lifecycle:
  - invited
  - onboarded
  - first_run_started
  - first_approval_completed
  - first_value_delivered
  - paid
  - churn_risk
- Add operator notes.
- Add customer feedback capture linked to workspace and run.
- Add demo workspace reset.

Business work:

- Create beta package:
  - Founder Beta Plan
  - one company workspace
  - 3 core loops
  - approval desk
  - receipts
  - company memory
  - optional onboarding call
- Price initial beta at a level that tests willingness to pay.
- Demo five target founders.
- Close two paid or signed beta customers.

Exit criteria:

- At least two real founders agree to pay or sign a beta agreement.
- First customer completes the first approved loop.
- Operator can support the customer without engineering intervention.

Verification:

- Admin records show beta customer state.
- Receipt exists for first approved customer loop.
- Feedback is captured in product.

Score target after phase:

- Sellable: 95+.
- Code: 92.
- Launch readiness: 93+.

## 5. PR And Commit Sequence

Use this sequence to keep changes reviewable:

1. `docs: add startup office 90 point development plan`
2. `feat(web): extract startup office app shell`
3. `feat(web): add startup office profile and run detail views`
4. `feat(api): extract startup office backend services`
5. `feat(api): add startup office idempotency and tenant tests`
6. `feat(worker): add model provider abstraction`
7. `feat(worker): execute idea validation loop`
8. `feat(worker): add offer and discovery loops`
9. `feat(memory): materialize approved runs into company memory`
10. `feat(web): add artifact viewer and memory diff approval`
11. `feat(api): add startup office assets customers metrics signals`
12. `feat(web): add assets customers signals metrics panels`
13. `feat(trust): add approval policy and claim checks`
14. `feat(ops): add billing state usage limits and admin dashboard`
15. `feat(test): add beta release gate and playwright smoke`
16. `feat(beta): add founder success lifecycle`

Each commit must pass the smallest relevant test set before moving on. Every
third commit must pass the full web test suite and full hosted API suite.

## 6. Test Matrix

### Unit Tests

- view model normalization
- copy selection
- approval action labels
- loop status transitions
- policy decisions
- claim checker
- context builder
- model output validators
- usage limit calculations

### API Tests

- company profile read/write
- loop list/create/run
- run read/retry/cancel
- artifact read
- approval approve/reject/revise
- receipt list/export
- assets/customers/metrics/signals CRUD
- tenant isolation
- role permissions
- idempotency
- rate limits
- billing state gates
- admin-only endpoints

### Worker Tests

- fake model success
- fake model invalid JSON
- fake model unsafe claim
- retry then success
- retry exhaustion
- cancellation
- receipt on failure
- memory write on approval

### Browser Tests

- signup/login
- company setup
- first loop run
- approval
- revision request
- receipt inspection
- memory diff inspection
- mobile approval flow
- admin stuck-run inspection

### Manual Beta QA

- founder can understand the app without explanation
- founder can finish first value loop in 10 minutes
- founder can explain what the AI did and why
- founder can identify the next business action
- operator can debug a failed run without database access

## 7. Release Gates

No beta release if any item is false:

- No primary hosted UI shows local execution setup setup.
- No primary hosted UI uses project/task as the central business model.
- No loop output completes without artifact and receipt.
- No approval action can mutate another workspace.
- No model run can exceed workspace spend limit.
- No external action executes without approval.
- No unsupported claim is presented as fact.
- No admin access is silent.
- No data deletion/export path is missing from operator runbook.
- No release proceeds without full release gate passing.

## 8. Non-Goals Until After First Paid Beta

Do not build these before the first paid beta is proven:

- General app marketplace.
- External connector marketplace.
- Full autonomous outbound sending.
- Full CRM replacement.
- Full accounting or legal automation.
- Local developer runtime.
- Code agent workflows.
- Complex multi-company enterprise hierarchy.
- Public funding dashboard.
- Social network mechanics.

These can become later expansion points, but building them now will weaken the
first product and delay proof of demand.

## 9. Key Engineering Principles

- Keep the first user journey narrow.
- Prefer durable records over transient UI state.
- Every model output must be inspectable.
- Every risky action must stop at approval.
- Every approval must create a receipt.
- Every receipt must be linked to run, artifact, actor, and company.
- Every company memory update must be explainable.
- Every workspace read/write must be tenant-scoped.
- Every costly action must be metered.
- Every phase must leave the product more sellable, not merely more complete.

## 10. Final 90+ Acceptance Review

The product can be called 90+ only after this final review:

### Sellable

- Five founder demos completed.
- Two paid or signed beta commitments.
- One founder completes first approved loop.
- The founder can name the next business action produced by the product.

### Code

- Startup Office frontend is modular.
- Startup Office backend is modular.
- Worker is testable with fake model clients.
- Full web and backend tests pass.
- Browser first-flow test passes.
- Surface guard blocks legacy positioning.

### Launch

- Real model provider configured.
- Worker execution durable.
- Billing state and plan limits active.
- Admin dashboard usable.
- Audit logs active.
- Tenant isolation tested.
- Data export and deletion available or covered by operator flow.
- Release gate passes.

If any category fails, the score must remain below 90 no matter how strong the
other categories are.
