# Startup Office Production Handoff

This handoff separates repository-controlled readiness from proof that must come
from production infrastructure or a real customer. Do not commit secret values,
customer private data, payment instruments, or provider tokens to this file.
The machine-readable evidence contract lives in
`shared/startup-office-production-handoff.json` and is enforced by
`npm run startup-office:production-handoff`.

## Repository-Controlled Readiness

The current codebase is ready for a closed beta production rehearsal when all of
these commands pass on the deploy commit:

- `npm run beta:release-gate`
- `npm run startup-office:release-health`
- `npm run startup-office:release-versioning`
- `npm run startup-office:secret-rotation`
- `npm run startup-office:migration-recovery`
- `npm run startup-office:rls-live`
- `npm run hosted-env:preflight -- --no-env-file` against production variables
- `npx supabase migration list` shows local and remote at the same latest
  migration, currently at least `20260526090000`

The repository now contains:

- Pure-cloud Startup Office schema and RLS.
- Hosted auth, one-company workspace model, team invites, role permissions, and
  admin-only beta operations.
- Company profile, operating loops, runs, artifacts, approvals, receipts,
  assets, customers, metrics, signals, memory pages, usage events,
  notifications, support access events, deletion requests, and deletion
  tombstones.
- Versioned beta terms, privacy, DPA, AI use, retention, and deletion
  acceptance records in `startup_office_terms_acceptances`.
- Cloud loop worker, outbox worker, ops monitor, model provider abstraction,
  quality rubric, browser research, citation enforcement, idempotency, rate
  limits, payload limits, cost metering, plan limits, and secure asset upload
  intent.
- Founder-facing Growth Center UI for company pulse, profile editing, operating
  loops, approval desk, artifacts, receipts, beta operations, and workspace
  activity.

## Release Versioning

`shared/startup-office-release-versioning.json` defines the SaaS release ID:
`startup-office@{package.version}+schema.{latestMigration}+commit.{shortSha}`.
Every production handoff must record the package version, deployed commit,
latest applied migration, release gate result, release health result, secret
rotation result, rollback decision and owner, and post-release monitor window
result.

## G099 Production Deployment Evidence

Mark G099 complete only after storing an external deployment record with these
fields in the operator system of record:

- Deploy commit SHA.
- Package version.
- Production app URL.
- Production API base URL.
- DNS provider and record type, without credentials.
- Supabase project ref and latest applied migration.
- Redacted `npm run hosted-env:preflight -- --no-env-file` result.
- Release gate result for the deploy commit.
- Release health contract result.
- Secret rotation contract result.
- Loop worker workflow run ID.
- Outbox worker workflow run ID.
- Ops monitor workflow run ID.
- Synthetic monitor workflow run ID.
- Production smoke workspace ID.
- Current beta terms acceptance ID and terms version.
- First production smoke run ID.
- First production approval ID.
- First production receipt ID.
- Rollback decision and owner.
- Post-release monitor window result.
- Screenshot or browser-test artifact proving profile, loop, approval, receipt, notification, export, and logout work on the production domain.

If any field is missing, G099 remains blocked by external deployment proof.

## G100 First Customer Evidence

Mark G100 complete only after storing an external customer record with these
fields in the operator system of record:

- Customer company name.
- Founder contact owner.
- Signed beta agreement URL or payment/invoice reference.
- Current beta terms acceptance ID and terms version.
- Workspace ID.
- Billing provider.
- Payment status, one of `trial`, `paid`, `paused`, or `blocked`.
- First loop slug.
- First customer run ID.
- First approval ID.
- First receipt ID.
- Founder decision: approved, revised, or rejected.
- Success note describing what business outcome the founder received.

If payment, signed agreement, or first approved/revised run evidence is missing,
G100 remains blocked by external customer proof.

## Final Cutover Order

1. Confirm the deploy commit is pushed and protected.
2. Run the release gate and RLS live verification.
3. Apply Supabase migrations to production.
4. Deploy web/API.
5. Configure production secrets and variables.
6. Run production preflight.
7. Enable and dispatch loop worker, outbox worker, and ops monitor workflows.
8. Create a staging workspace, accept the current beta terms, and complete the
   production smoke flow.
9. Record G099 evidence.
10. Invite the first beta founder, record agreement or payment evidence, run the
    first loop, confirm current beta terms acceptance, and record G100 evidence.

After step 10, the only remaining work should be ongoing customer operations,
not source-code readiness.
