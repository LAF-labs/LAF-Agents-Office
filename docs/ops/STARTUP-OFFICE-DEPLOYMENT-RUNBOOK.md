# Startup Office Deployment Runbook

This runbook keeps the pure-cloud Startup Office deployable without local
runtime assumptions. It covers the web/API deploy, Supabase migrations, the
independent AI loop worker, the outbox worker used for notification delivery,
and the scheduled ops monitor that catches silent queue failure.

## Deploy Order

1. Run `npm run beta:release-gate`.
2. Run `npm run hosted-env:preflight` against the production environment.
3. Apply Supabase migrations with `npx supabase db push`.
4. Deploy the hosted web/API app.
5. Set GitHub Actions variable `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED=true`
   only after production secrets, variables, web/API, and database migrations
   are ready. Keep it unset or `false` before production cutover so scheduled
   jobs skip instead of sending expected failure emails.
6. Enable `.github/workflows/startup-office-loop-worker.yml`.
7. Run the AI loop worker once with `npm run startup-office:loop-worker` or the
   workflow dispatch button.
8. Enable `.github/workflows/startup-office-outbox-worker.yml`.
9. Run the outbox worker once with `npm run startup-office:outbox-worker` or
   the workflow dispatch button.
10. Enable `.github/workflows/startup-office-ops-monitor.yml`.
11. Run the ops monitor once with `npm run startup-office:ops-monitor` or the
   workflow dispatch button.
12. Enable `.github/workflows/startup-office-synthetic-monitor.yml`.
13. Run the synthetic monitor once with
   `npm run startup-office:synthetic-monitor` or the workflow dispatch button.
14. Complete the smoke test below.

## Required Secrets And Variables

GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY` when `LAF_OUTBOX_EMAIL_PROVIDER=resend`
- `LAF_OFFICE_OPENAI_API_KEY` or `OPENAI_API_KEY` when
  `LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai`
- `LAF_SYNTHETIC_EMAIL` for a dedicated closed-beta smoke workspace user
- `LAF_SYNTHETIC_PASSWORD` for that dedicated synthetic user

GitHub Actions variables:

- `LAF_OFFICE_PUBLIC_HOST`
- `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED`, set to `true` only after
  production secrets and deploy checks pass. Missing or `false` makes scheduled
  worker and monitor workflows skip; manual dispatch still runs for validation.
- `LAF_OFFICE_BILLING_MODE`, set to `manual` for the closed beta
- `LAF_OFFICE_ALLOWED_ORIGINS`
- `LAF_OUTBOX_EMAIL_PROVIDER`, either `in_app`, `none`, or `resend`
- `LAF_OUTBOX_BATCH_SIZE`, default `25`
- `LAF_OUTBOX_LOCK_MS`, default `300000`
- `LAF_EMAIL_FROM` when email delivery is enabled
- `LAF_EMAIL_REPLY_TO` when a support reply address is available
- `LAF_LOOP_WORKER_BATCH_SIZE`, default `5`
- `LAF_LOOP_WORKER_LOCK_MS`, default `1800000`
- `LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER`, default `openai`
- `LAF_OFFICE_STARTUP_OFFICE_MODEL`, default `gpt-5-mini`
- `LAF_OFFICE_MODEL_PRICING_JSON`, a JSON object keyed by
  `provider:model`, `model`, provider, or `*`. Each entry must include
  `input_cents_per_1m` and `output_cents_per_1m` or the USD equivalents,
  plus an optional `source`. Example key: `openai:gpt-5-mini`.
- `LAF_OFFICE_OPENAI_FALLBACK_API_KEY` when using a backup
  OpenAI-compatible model route
- `LAF_OFFICE_OPENAI_FALLBACK_BASE_URL` when the backup route is a gateway or
  different provider endpoint
- `LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL` when the backup route should use a
  different model
- `LAF_OFFICE_STARTUP_OFFICE_EMBEDDING_MODEL` when overriding embeddings
- `LAF_OFFICE_OPENAI_BASE_URL` only for an OpenAI-compatible gateway
- `LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX`, default `0`
- `LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS`, default `0`
- `LAF_MONITOR_MAX_FAILED_OUTBOX`, default `25`
- `LAF_MONITOR_MAX_MODEL_SPEND_CENTS`, default `1000000`
- `LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX`, default `0`
- `LAF_MONITOR_MAX_STUCK_WORKER_JOBS`, default `0`
- `LAF_MONITOR_MAX_USAGE_EVENT_COST_CENTS`, default `5000`
- `LAF_MONITOR_MAX_WORKSPACE_MODEL_SPEND_RATIO_BPS`, default `9000`
- `LAF_MONITOR_OUTBOX_STALE_MS`, default `600000`
- `LAF_MONITOR_WORKER_JOB_STUCK_MS`, default `1800000`
- `LAF_SYNTHETIC_API_BASE_URL`, defaults to `LAF_OFFICE_PUBLIC_HOST`
- `LAF_SYNTHETIC_APPROVAL_ACTION`, default `approve`
- `LAF_SYNTHETIC_LOOP_ID`, default `idea-validation`
- `LAF_SYNTHETIC_TIMEOUT_MS`, default `60000`

Do not put secret values in this repository. The preflight prints normalized
origins and provider choices, not secret contents.

## Secret And Config Rotation

`shared/startup-office-secret-rotation.json` is the source of truth for the
closed-beta secret and config rotation checklist. Run
`npm run startup-office:secret-rotation` before a production handoff to verify
that required secrets, owners, cadence, emergency rotation triggers, and
post-rotation verification commands stay aligned with this runbook.

Review the inventory every 30 days. Rotate immediately after suspected
credential exposure, a departing operator with production access, provider
dashboard compromise, or a failed secret scan on a deploy branch. Never record
raw secret values, provider token fragments, customer private data, or payment
instruments in repository files or handoff notes.

After any rotation, run the post-rotation verification commands:

1. `npm run hosted-env:preflight -- --no-env-file`
2. `npm run startup-office:ops-monitor`
3. `npm run startup-office:synthetic-monitor`
4. `npm run beta:release-gate`

## AI Loop Worker Schedule

The scheduled loop worker runs every five minutes and processes one bounded
batch of queued or retryable Startup Office loop jobs:

- Workflow: `.github/workflows/startup-office-loop-worker.yml`
- Command: `npm run startup-office:loop-worker`
- Claim RPC: `claim_startup_office_worker_job`
- Locking: `FOR UPDATE SKIP LOCKED` with stale-lock recovery
- Failure policy: retry with backoff while `attempts < max_attempts`, then
  `dead_letter`
- Side-effect safety: artifacts and approvals use deterministic idempotency
  keys derived from the run and worker job
- Schedule guard: schedule events run only when
  `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED=true`; manual dispatch always runs so
  operators can validate readiness before enabling the schedule.

The worker prints aggregate job IDs and statuses only. It does not print model
prompts, generated artifacts, user profile payloads, provider responses, or
secrets.

## Live Model Smoke

The release gate intentionally avoids live model calls. Before a closed-beta
deploy, operators can verify one real structured model path manually:

```bash
LAF_RUN_LIVE_MODEL_SMOKE=1 npm run startup-office:live-model-smoke
```

The command requires an OpenAI or OpenAI-compatible key, rejects fake/disabled
providers, checks provider usage tokens, runs the Startup Office output quality
rubric, and prints only provider, model, token count, and pricing source.

## Outbox Worker Schedule

The scheduled workflow runs every five minutes and drains one bounded batch:

- Workflow: `.github/workflows/startup-office-outbox-worker.yml`
- Command: `npm run startup-office:outbox-worker`
- Claim RPC: `claim_startup_office_outbox_event`
- Locking: `FOR UPDATE SKIP LOCKED` with stale-lock recovery
- Failure policy: retry with backoff, then `dead_letter`
- Schedule guard: schedule events run only when
  `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED=true`; manual dispatch always runs.

The workflow runs `npm run hosted-env:preflight -- --no-env-file` before
draining. If required secrets or email variables are missing, the worker fails
before claiming outbox rows.

## Operational Monitor

The scheduled monitor workflow runs every fifteen minutes and fails loudly when
the office is no longer draining work:

- Workflow: `.github/workflows/startup-office-ops-monitor.yml`
- Command: `npm run startup-office:ops-monitor`
- Data sources: `startup_office_outbox_events`,
  `startup_office_worker_jobs`, `startup_office_runs`,
  `startup_office_approvals`, `startup_office_usage_events`, and
  `workspace_billing`
- Hard failures by default: any `dead_letter` outbox row, any `dead_letter`
  worker job, any stale processing outbox row, and any stuck queued/running
  worker job. The monitor also fails on single-run model cost spikes,
  workspace-level model spend warnings for the current UTC billing month, and a
  global model-spend threshold. It exposes run latency, failed run count,
  pending approval wait time, worker duration, token use, and model cost
  aggregates.
- Tunable thresholds: `LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX`,
  `LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS`, `LAF_MONITOR_MAX_FAILED_OUTBOX`,
  `LAF_MONITOR_MAX_FAILED_RUNS`, `LAF_MONITOR_MAX_MODEL_SPEND_CENTS`,
  `LAF_MONITOR_MAX_STALE_PENDING_APPROVALS`,
  `LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX`,
  `LAF_MONITOR_MAX_STUCK_WORKER_JOBS`,
  `LAF_MONITOR_MAX_USAGE_EVENT_COST_CENTS`,
  `LAF_MONITOR_MAX_WORKSPACE_MODEL_SPEND_RATIO_BPS`,
  `LAF_MONITOR_APPROVAL_STALE_MS`, `LAF_MONITOR_OUTBOX_STALE_MS`, and
  `LAF_MONITOR_WORKER_JOB_STUCK_MS`
- Schedule guard: schedule events run only when
  `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED=true`; manual dispatch always runs.

The monitor prints only aggregate counts, latency/wait/cost metrics, and
threshold failures. It does not print payloads, last-error bodies, user data, or
provider secrets. A failed scheduled run should be treated as a closed-beta
incident until the stuck rows are drained, replayed, or intentionally
dead-lettered.

## Synthetic Monitor

The deployed synthetic monitor proves that the production app can serve a real
founder path, not just static health checks:

- Workflow: `.github/workflows/startup-office-synthetic-monitor.yml`
- Command: `npm run startup-office:synthetic-monitor`
- Frequency: hourly by default
- Required account: a dedicated smoke workspace user, never a real customer
  workspace
- Flow: health check, login, authenticated session, Growth Center/profile read,
  live loop run, approval lookup, optional approval decision, receipt lookup,
  and logout
- Schedule guard: schedule events run only when
  `STARTUP_OFFICE_PRODUCTION_JOBS_ENABLED=true`; manual dispatch always runs.

Keep `LAF_SYNTHETIC_APPROVAL_ACTION=approve` only for the dedicated synthetic
workspace. The script fails if the loop remains queued, because that means the
live model/worker path was not exercised. The script prints step names, run ID,
receipt ID, and status only; it does not print credentials, prompts, artifacts,
or customer data.

## Release Health Contract

`shared/startup-office-release-health.json` is the repository-controlled release
health contract. It defines a 60 minute post-release window, the required ops
and synthetic monitors, and the rollback triggers operators must evaluate before
reopening or expanding a beta deploy.

The release is unhealthy if either `.github/workflows/startup-office-ops-monitor.yml`
or `.github/workflows/startup-office-synthetic-monitor.yml` fails during the
post-release window. Recovery must rerun `npm run beta:release-gate`,
`npm run hosted-env:preflight`, `npm run startup-office:ops-monitor`, and
`npm run startup-office:synthetic-monitor` on the repaired deployment.

Rollback triggers are web/API smoke failure, repeated loop worker failure,
repeated outbox worker failure, and migration failure. Web/API failures roll
back through the host provider. Worker failures disable only the affected worker
workflow while the ops monitor remains the incident signal. Migration failures
stop deploys and use a forward-fix migration unless destructive corruption
requires PITR.

## Smoke Test

After deploying:

1. Create or use a staging workspace.
2. Accept the current beta terms and confirm
   `startup_office_terms_acceptances` records the version bundle.
3. Run a Startup Office loop that reaches approval or failure.
4. Confirm `startup_office_worker_jobs` receives a queued row.
5. Run `.github/workflows/startup-office-loop-worker.yml` manually or wait for
   the next schedule.
6. Confirm the worker job is `completed` or `dead_letter`, and the run is no
   longer stuck in `queued`.
7. Confirm `startup_office_notifications` receives a pending row when approval
   or failure notification is expected.
8. Run the outbox workflow manually or wait for the next schedule.
9. Confirm the notification row is marked `sent`.
10. Confirm the matching `startup_office_outbox_events` row is `delivered`.
11. If `LAF_OUTBOX_EMAIL_PROVIDER=resend`, confirm the Resend dashboard shows the
   message and the notification payload stores `email_delivery`.
12. Run `.github/workflows/startup-office-ops-monitor.yml` manually and confirm
   `npm run startup-office:ops-monitor` passes.

## Migration Failure Recovery

Startup Office migrations are forward-only in production. Do not edit, delete,
rename, reorder, squash, or locally "fix" a migration file after it has been
applied to any shared Supabase project. A failed migration incident is resolved
by a new forward-fix migration unless the only safe option is a point-in-time
restore.

Before touching the database:

1. Stop deploys that can introduce new schema assumptions.
2. Disable `.github/workflows/startup-office-loop-worker.yml` and
   `.github/workflows/startup-office-outbox-worker.yml` so background workers do
   not write into a half-migrated schema.
3. Keep `.github/workflows/startup-office-ops-monitor.yml` enabled unless it is
   blocking emergency database work; its red state is the incident marker.
4. Capture the failing command, migration version, Supabase project ref, UTC
   time, error text, and whether the failed version appears in
   `supabase_migrations.schema_migrations`.
5. Confirm that recent automated backups or point-in-time recovery are available
   before attempting any manual data repair.

Classify the failure:

- If the failed migration version is not recorded in
  `supabase_migrations.schema_migrations` and no shared project has applied it,
  fix the local migration before retrying.
- If the version is recorded, or if any shared/staging project has applied it,
  treat the migration as immutable and create a new forward-fix migration with
  `npx supabase migration new fix_startup_office_<short_reason>`.
- If data was destructively corrupted, stop and use the point-in-time restore
  path below instead of writing more SQL.

Forward-fix procedure:

1. Create a new timestamped migration that is idempotent: use
   `if exists`, `if not exists`, guarded updates, and reversible data
   derivation where possible.
2. The fix must preserve tenant boundaries. Any repair query touching Startup
   Office tables must filter or join through `team_id`.
3. Run `npm run startup-office:rls-live` to apply the full migration history to a
   temporary PostgREST-backed database and exercise anon, authenticated, and
   service_role RLS behavior.
4. Run `npm run beta:release-gate`.
5. Apply with `npx supabase db push`.
6. Run `npm run hosted-env:preflight -- --no-env-file`.
7. Run the smoke test above before re-enabling the loop and outbox workers.
8. Record the forward-fix migration version, operator, root cause, verification
   commands, and whether any rows were manually repaired.

Point-in-time restore path:

1. Use this only for destructive data corruption, wrong-project migration, or a
   failed migration that cannot be made safe with a forward-fix.
2. Announce a maintenance window and pause the hosted app, loop worker, outbox
   worker, and any manual service-role scripts.
3. Restore the Supabase project to the last known-good timestamp.
4. Re-apply only the migrations that passed `npm run startup-office:rls-live` and
   `npm run beta:release-gate` on the exact commit being deployed.
5. Confirm owner/admin access, tenant isolation, approval actions, worker job
   claims, outbox delivery, and the ops monitor before reopening the beta.

## Rollback

Host web/API rollback is allowed only when schema compatibility is preserved.
Applied production migrations are forward-fixed unless destructive corruption
requires PITR. Loop and outbox workers can be disabled independently without
reverting the web/API deploy. Release evidence must record whether rollback,
forward-fix, or worker pause was chosen.

If the web/API deploy fails, roll back through the host provider and leave the
outbox workflow disabled until the app smoke passes.

If the AI loop worker fails repeatedly:

1. Disable `.github/workflows/startup-office-loop-worker.yml`.
2. Keep `.github/workflows/startup-office-ops-monitor.yml` enabled unless it is
   blocking emergency migration work.
3. Inspect `startup_office_worker_jobs` rows with `failed` or `dead_letter`
   status.
4. Confirm the model provider env, Supabase service role, and the
   `claim_startup_office_worker_job` RPC are healthy.
5. From an owner/admin session, retry a recovered job with
   `POST /api/startup-office/admin/worker-jobs/{job_id}/retry` or cancel a
   duplicate/unsafe job with
   `POST /api/startup-office/admin/worker-jobs/{job_id}/cancel`.
6. Re-run `npm run beta:release-gate`, `npm run hosted-env:preflight`, and
   `npm run startup-office:loop-worker`.
7. Re-enable the loop worker workflow and dispatch one manual run.

If the outbox worker fails repeatedly:

1. Disable `.github/workflows/startup-office-outbox-worker.yml`.
2. Keep `.github/workflows/startup-office-ops-monitor.yml` enabled unless it is
   blocking emergency migration work; its red state is the incident signal.
3. Set `LAF_OUTBOX_EMAIL_PROVIDER=in_app` to stop external email attempts.
4. Inspect `startup_office_outbox_events` rows with `failed` or `dead_letter`
   status.
5. Fix the provider configuration or code path.
6. Re-run `npm run beta:release-gate`, `npm run hosted-env:preflight`, and
   `npm run startup-office:ops-monitor`.
7. Re-enable the worker workflow and dispatch one manual run.

If `npx supabase db push` fails during migration, do not edit applied migration
files. Add a forward-fix migration, run the release gate, and apply again.
