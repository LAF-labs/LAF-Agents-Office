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
5. Enable `.github/workflows/startup-office-loop-worker.yml`.
6. Run the AI loop worker once with `npm run startup-office:loop-worker` or the
   workflow dispatch button.
7. Enable `.github/workflows/startup-office-outbox-worker.yml`.
8. Run the outbox worker once with `npm run startup-office:outbox-worker` or
   the workflow dispatch button.
9. Enable `.github/workflows/startup-office-ops-monitor.yml`.
10. Run the ops monitor once with `npm run startup-office:ops-monitor` or the
   workflow dispatch button.
11. Complete the smoke test below.

## Required Secrets And Variables

GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY` when `LAF_OUTBOX_EMAIL_PROVIDER=resend`
- `LAF_OFFICE_OPENAI_API_KEY` or `OPENAI_API_KEY` when
  `LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai`

GitHub Actions variables:

- `LAF_OFFICE_PUBLIC_HOST`
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
- `LAF_OFFICE_STARTUP_OFFICE_EMBEDDING_MODEL` when overriding embeddings
- `LAF_OFFICE_OPENAI_BASE_URL` only for an OpenAI-compatible gateway
- `LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX`, default `0`
- `LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS`, default `0`
- `LAF_MONITOR_MAX_FAILED_OUTBOX`, default `25`
- `LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX`, default `0`
- `LAF_MONITOR_MAX_STUCK_WORKER_JOBS`, default `0`
- `LAF_MONITOR_OUTBOX_STALE_MS`, default `600000`
- `LAF_MONITOR_WORKER_JOB_STUCK_MS`, default `1800000`

Do not put secret values in this repository. The preflight prints normalized
origins and provider choices, not secret contents.

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

The worker prints aggregate job IDs and statuses only. It does not print model
prompts, generated artifacts, user profile payloads, provider responses, or
secrets.

## Outbox Worker Schedule

The scheduled workflow runs every five minutes and drains one bounded batch:

- Workflow: `.github/workflows/startup-office-outbox-worker.yml`
- Command: `npm run startup-office:outbox-worker`
- Claim RPC: `claim_startup_office_outbox_event`
- Locking: `FOR UPDATE SKIP LOCKED` with stale-lock recovery
- Failure policy: retry with backoff, then `dead_letter`

The workflow runs `npm run hosted-env:preflight -- --no-env-file` before
draining. If required secrets or email variables are missing, the worker fails
before claiming outbox rows.

## Operational Monitor

The scheduled monitor workflow runs every fifteen minutes and fails loudly when
the office is no longer draining work:

- Workflow: `.github/workflows/startup-office-ops-monitor.yml`
- Command: `npm run startup-office:ops-monitor`
- Data sources: `startup_office_outbox_events` and
  `startup_office_worker_jobs`
- Hard failures by default: any `dead_letter` outbox row, any `dead_letter`
  worker job, any stale processing outbox row, and any stuck queued/running
  worker job
- Tunable thresholds: `LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX`,
  `LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS`, `LAF_MONITOR_MAX_FAILED_OUTBOX`,
  `LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX`,
  `LAF_MONITOR_MAX_STUCK_WORKER_JOBS`, `LAF_MONITOR_OUTBOX_STALE_MS`, and
  `LAF_MONITOR_WORKER_JOB_STUCK_MS`

The monitor prints only aggregate counts and threshold failures. It does not
print payloads, last-error bodies, user data, or provider secrets. A failed
scheduled run should be treated as a closed-beta incident until the stuck rows
are drained, replayed, or intentionally dead-lettered.

## Smoke Test

After deploying:

1. Create or use a staging workspace.
2. Run a Startup Office loop that reaches approval or failure.
3. Confirm `startup_office_worker_jobs` receives a queued row.
4. Run `.github/workflows/startup-office-loop-worker.yml` manually or wait for
   the next schedule.
5. Confirm the worker job is `completed` or `dead_letter`, and the run is no
   longer stuck in `queued`.
6. Confirm `startup_office_notifications` receives a pending row when approval
   or failure notification is expected.
7. Run the outbox workflow manually or wait for the next schedule.
8. Confirm the notification row is marked `sent`.
9. Confirm the matching `startup_office_outbox_events` row is `delivered`.
10. If `LAF_OUTBOX_EMAIL_PROVIDER=resend`, confirm the Resend dashboard shows the
   message and the notification payload stores `email_delivery`.
11. Run `.github/workflows/startup-office-ops-monitor.yml` manually and confirm
   `npm run startup-office:ops-monitor` passes.

## Rollback

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
