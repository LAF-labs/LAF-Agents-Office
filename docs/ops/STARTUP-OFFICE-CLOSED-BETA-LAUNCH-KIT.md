# Startup Office Closed Beta Launch Kit

This is the sales, trust, support, and operating kit for the pure-cloud Startup
Office beta. It assumes one account owns one company workspace and every
high-impact AI action remains founder-controlled through approvals and receipts.

## Commercial Positioning

The beta offer is a founder-controlled AI Startup Office for non-technical or
AI-new founders who want the leverage of an operating team without losing
control. The public comparison is:

- Polsia validates the autonomous-company demand.
- Startup Office wins on safer autonomy, visible memory, approval gates,
  exportable receipts, workspace-level cost controls, and explicit support
  access.
- The promise is not "AI runs your company silently." The promise is "AI prepares
  operating work, the founder approves the risky moves, and every material step
  leaves evidence."

## Paid Beta Billing

Closed beta workspaces use manual billing unless Stripe is explicitly enabled
later. Operators mark each workspace with:

- `billing_provider`: `manual` or `stripe`
- `payment_status`: `trial`, `paid`, `paused`, or `blocked`
- `billing_state`: operational state such as `trial`, `active`, `past_due`,
  `paused`, `comped`, or `canceled`
- `beta_agreement_url`: signed agreement, invoice, or manual payment reference
- `blocked_reason`: visible reason when access is blocked

AI runs stop when `billing_state` is `past_due`, `paused`, or `canceled`, or
when `payment_status` is `paused` or `blocked`.

## Privacy And Data Processing Terms

Beta sales must include and record acceptance of
`docs/legal/STARTUP-OFFICE-BETA-TERMS.md`. The product stores the current terms,
privacy, DPA, AI use, retention, and deletion version bundle in
`startup_office_terms_acceptances`; paid beta cannot be commercially cleared
until the current bundle is accepted.

The plain-language data position is:

- The workspace stores company profile, memory pages, assets, customers,
  metrics, signals, runs, approvals, receipts, usage events, notifications, and
  support access records.
- Customer data is used to operate the requested Startup Office features and to
  generate AI outputs for that workspace.
- Model calls may send workspace context, approved memory, uploaded materials,
  and user prompts to the configured model provider.
- The service does not train public models on customer workspace data unless a
  future provider contract explicitly says so and the customer opts in.
- Receipts are append-only by default. Deletion requests are queued, exported if
  requested, and then processed across Startup Office tables.
- Support access must be explicit, logged, time-bound, and visible to owners.

## Safety Boundaries

Startup Office can draft legal, financial, medical, compliance, refund,
contract, tax, employment, or regulated-market materials, but those outputs are
not professional advice. The founder must route regulated decisions to a
qualified expert before publishing, signing, spending, charging, or relying on
them externally. Public claims, customer promises, payments, and sensitive legal
language stay approval-gated.

## Beta Onboarding Email Sequence

1. Welcome: confirm the company workspace, beta agreement, support channel, and
   first outcome target.
2. Setup: ask the founder to complete company profile, ICP, offer, stage, and
   priority.
3. First loop: prompt the founder to run Idea Validation and review the pending
   approval.
4. Approval: explain approve, revise, reject, receipts, and memory promotion.
5. Selling motion: guide Offer Package or Customer Discovery toward a paid beta
   conversation.
6. Review: summarize usage, receipts, open approvals, support notes, and next
   loop.

## Acceptance Criteria

Invite a founder only when all are true:

- They are building or validating a real company, not just testing agents.
- They can name a target customer and an urgent business decision.
- They accept founder approval gates for public claims, spend, outbound
  messages, and customer promises.
- They agree to manual beta billing or a signed beta agreement.
- They understand the product is cloud-hosted and not a local development tool.

A workspace is ready when profile, first loop, first approval decision, first
receipt, export path, support policy, and billing state are visible.

## Founder Success Checklist

Operators mark a beta founder successful when:

- Company profile has ICP, offer, positioning, stage, and priority.
- Idea Validation has run at least once.
- The founder has approved, revised, or rejected one approval.
- At least one receipt is visible and exportable.
- The next loop is Offer Package, Customer Discovery, Launch Campaign, or Weekly
  Operator Review.
- Billing state is `paid`, `trial`, `paused`, or `blocked` with clear notes.

## Support Playbook

`GET /startup-office/admin/beta-dashboard` returns `support_playbooks` so an
operator sees the right rescue path next to failed runs, stuck jobs, pending
approvals, outbox state, billing state, and activation progress.

Failed run recovery:

1. Check beta dashboard for failed runs, stuck worker jobs, dead-letter outbox,
   model-spend warnings, and recent notifications.
2. If provider configuration or transient model failure caused it, retry the job
   from the admin endpoint.
3. If the draft is low quality, ask the founder to request revision with a
   concrete note.
4. Record the customer-facing explanation in support notes and confirm the next
   receipt is visible.

Confused approval rescue:

1. Open the support timeline for the approval and related run.
2. Explain approve, reject, revise, and receipt outcomes using the approval
   title, risk level, memory diff, and recent receipts.
3. Ask for a concrete revision note when the artifact is useful but not ready.
4. Reject instead of revise when the artifact should not be reused as company
   memory.
5. Confirm the approval decision writes a receipt and activation milestone.

Notification delivery recovery:

1. Inspect failed outbox rows and recent notification payloads before resending.
2. Fix SMTP/webhook configuration and let the outbox worker retry eligible rows.
3. If a notification is dead-lettered, manually notify the founder and keep the
   receipt trace intact.

Support access:

1. Owner/admin grants explicit access with reason and expiry.
2. Support action is logged as `granted`, `accessed`, or `revoked`.
3. Owner can read the access events.
4. Silent impersonation is prohibited.

## Workspace Deletion Processing

1. Owner/admin requests deletion with `DELETE STARTUP OFFICE`.
2. Operator offers `GET /startup-office/export` before destructive purge.
3. Owner/admin confirms purge with `PURGE STARTUP OFFICE` against the deletion
   request.
4. `purge_startup_office_workspace` runs through service role only, sets
   `app.allow_receipt_delete=on` for the transaction, deletes the workspace via
   the `teams` cascade, and returns the deletion manifest.
5. `startup_office_deletion_tombstones` retains only minimal proof: workspace
   ID, deletion request ID, requester, manifest version, purged table list, and
   purge timestamp.

## Export Coverage

`GET /startup-office/export` returns `startup-office-export.v2` and an
`export_manifest` derived from the active schema. The export includes company
profile, team metadata, memberships, invites without token hashes, workspace
settings and billing state, channel messages, skills, wiki index/write
requests, loops, runs, artifacts, approvals, receipts, assets, customers,
metrics, signals, memory pages, support access events, deletion requests,
terms acceptances, activation events, usage events, notifications, audit
events, and billing documents.

Internal queue state is intentionally omitted: outbox events and worker jobs are
represented by customer-visible runs, receipts, notifications, and usage
events. Deletion tombstones are post-deletion legal proof, not pre-deletion
workspace export content.

## Incident Response

`shared/startup-office-incident-response.json` is the Release-Gated Incident
Response contract. It sets a 60 minute first response SLA, identifies the
operator owner, and requires each incident record to include incident class,
severity, operator owner, affected workspace IDs, UTC start and resolution
timestamps, commands run and results, customer notification decision, and
post-incident corrective action.

`data_leak_or_cross_tenant_access`:

1. Freeze deploys and disable loop/outbox workers.
2. Preserve audit events, support access events, affected workspace IDs, and
   timestamps.
3. Rotate service role keys if service-side access is suspected.
4. Notify affected founders with scope, mitigation, and deletion/export options.
5. Run `npm run startup-office:tenant-isolation`,
   `npm run startup-office:rls-verification`, `npm run startup-office:schema`,
   and `npm run beta:release-gate` on the fix commit.

`provider_or_secret_breach`:

1. Rotate affected provider credentials.
2. Run production preflight with redacted output.
3. Review subprocessor and model-provider disclosure impact.
4. Record whether customer notice is required.
5. Run `npm run startup-office:secret-rotation`,
   `npm run startup-office:subprocessors`, `npm run hosted-env:preflight:test`,
   and `npm run beta:release-gate`.

`worker_or_outbox_outage`:

1. Keep ops monitor enabled as the incident signal.
2. Pause only the affected worker if jobs are compounding.
3. Inspect support timeline evidence before retrying or canceling jobs.
4. Use admin recovery endpoints for safe retry/cancel decisions.
5. Run `npm run startup-office:ops-monitor:test`,
   `npm run startup-office:support-timeline`,
   `npm run startup-office:support-playbooks`, and
   `npm run startup-office:loop-concurrency`.

`billing_abuse_or_commercial_block`:

1. Mark `payment_status=blocked` and write a `blocked_reason`.
2. Preserve usage events, receipts, billing documents, and agreement references.
3. Confirm entitlements before restoring paid beta access.
4. Record customer-facing explanation in support notes.
5. Run `npm run startup-office:commercial-billing`,
   `npm run startup-office:paid-beta-package`,
   `npm run startup-office:plan-limits`, and
   `npm run startup-office:support-playbooks`.

## Backup And Restore Drill

Before every paid beta handoff:

1. Confirm Supabase point-in-time recovery or daily backups cover all active
   Startup Office tables in `supabase/schema/current.json`.
2. Export one staging workspace through `GET /startup-office/export`.
3. Verify the export includes company profile, memory pages, assets, customers,
   metrics, runs, approvals, receipts, and beta ops.
4. Restore rehearsal uses a non-production workspace and preserves tenant IDs,
   approval decisions, receipt traces, and memory slugs.

## Demo Workspace Reset

`POST /startup-office/demo-seed` is idempotent and writes deterministic demo
profile, loops, runs, artifacts, approvals, and receipts. In production it stays
disabled unless `LAF_OFFICE_ENABLE_DEMO_SEED=true`, so internal operators can
reset demo evidence without destructive SQL against production customer data.

## QA Gates

The first beta flow must be covered by:

- Playwright spec for signup, company profile, first loop, approval, receipt,
  and logout.
- Accessibility checks for keyboard focus, role labels, approval buttons, and
  readable status text.
- Mobile viewport checks for approval review and receipt visibility.
- Korean and English copy checks for onboarding, Growth Center, approvals,
  activity, beta ops, and receipts.
- Quality evaluation harness for loop outputs, source citations, risk labels,
  assumptions, and unsafe external-action language.

## Production Deployment And DNS

Production can only be marked complete after:

- `npm run beta:release-gate` passes on the deploy commit.
- `npm run hosted-env:preflight -- --no-env-file` passes against production
  variables.
- Supabase migrations are applied to the production project.
- The app is reachable on the production domain.
- Loop worker, outbox worker, and ops monitor workflows are enabled and pass one
  manual run.
- A staging workspace completes current beta terms acceptance, profile, loop,
  approval, receipt, notification, export, and logout on the production domain.

## First Closed Beta Sale

The final readiness proof is external: one real founder pays or signs an
explicit beta agreement, receives a company workspace, runs the first loop, and
approves or revises the first output after accepting the current beta terms.
This cannot be completed by repository changes alone.
