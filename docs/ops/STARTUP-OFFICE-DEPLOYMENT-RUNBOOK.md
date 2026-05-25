# Startup Office Deployment Runbook

This runbook keeps the pure-cloud Startup Office deployable without local
runtime assumptions. It covers the web/API deploy, Supabase migrations, and the
independent outbox worker used for notification delivery.

## Deploy Order

1. Run `npm run beta:release-gate`.
2. Run `npm run hosted-env:preflight` against the production environment.
3. Apply Supabase migrations with `npx supabase db push`.
4. Deploy the hosted web/API app.
5. Enable `.github/workflows/startup-office-outbox-worker.yml`.
6. Run the outbox worker once with `npm run startup-office:outbox-worker` or
   the workflow dispatch button.
7. Complete the smoke test below.

## Required Secrets And Variables

GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY` when `LAF_OUTBOX_EMAIL_PROVIDER=resend`

GitHub Actions variables:

- `LAF_OFFICE_PUBLIC_HOST`
- `LAF_OFFICE_ALLOWED_ORIGINS`
- `LAF_OUTBOX_EMAIL_PROVIDER`, either `in_app`, `none`, or `resend`
- `LAF_OUTBOX_BATCH_SIZE`, default `25`
- `LAF_OUTBOX_LOCK_MS`, default `300000`
- `LAF_EMAIL_FROM` when email delivery is enabled
- `LAF_EMAIL_REPLY_TO` when a support reply address is available

Do not put secret values in this repository. The preflight prints normalized
origins and provider choices, not secret contents.

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

## Smoke Test

After deploying:

1. Create or use a staging workspace.
2. Run a Startup Office loop that reaches approval or failure.
3. Confirm `startup_office_notifications` receives a pending row.
4. Run the workflow manually or wait for the next schedule.
5. Confirm the notification row is marked `sent`.
6. Confirm the matching `startup_office_outbox_events` row is `delivered`.
7. If `LAF_OUTBOX_EMAIL_PROVIDER=resend`, confirm the Resend dashboard shows the
   message and the notification payload stores `email_delivery`.

## Rollback

If the web/API deploy fails, roll back through the host provider and leave the
outbox workflow disabled until the app smoke passes.

If the outbox worker fails repeatedly:

1. Disable `.github/workflows/startup-office-outbox-worker.yml`.
2. Set `LAF_OUTBOX_EMAIL_PROVIDER=in_app` to stop external email attempts.
3. Inspect `startup_office_outbox_events` rows with `failed` or `dead_letter`
   status.
4. Fix the provider configuration or code path.
5. Re-run `npm run beta:release-gate` and `npm run hosted-env:preflight`.
6. Re-enable the workflow and dispatch one manual run.

If `npx supabase db push` fails during migration, do not edit applied migration
files. Add a forward-fix migration, run the release gate, and apply again.
