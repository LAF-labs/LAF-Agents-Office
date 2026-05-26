# Startup Office Security Review Packet

`shared/startup-office-security-review.json` is the release-gated security
review packet for the closed beta. It ties the threat model, launch legal
artifacts, incident response, tenant isolation, RLS, secret rotation,
subprocessor disclosure, and release health evidence to the deploy commit.

## Threat Model

Primary assets are workspace data, company memory, approvals, receipts,
artifacts, billing evidence, support access records, model prompts, generated
drafts, and audit events. The strongest attacker goals are cross-tenant access,
service-role abuse, credential exposure, unsafe AI output reliance, billing
abuse, and deletion/export misuse.

## Trust Boundaries

Trust boundaries are browser session to hosted API, hosted API to Supabase REST
and Auth, service-role worker access to Startup Office tables, model-provider
requests, outbox email delivery, support/admin actions, and production deploy
workflows. Each boundary must either be tenant-scoped, approval-gated,
service-role allowlisted, or covered by release-gated preflight and monitoring.

## Abuse Paths

- Cross-tenant reads or writes through API query drift.
- Direct service-role writes outside the Startup Office allowlist.
- Model prompt leakage through excessive workspace context.
- Silent support access or unbounded operator actions.
- Dead-letter worker/outbox rows hiding customer-impacting failure.
- Billing state or entitlement drift allowing unpaid high-cost usage.
- Secret or provider dashboard compromise.
- Destructive deletion without export, audit, or tombstone evidence.

## Mitigations And Gates

- `npm run startup-office:security`
- `npm run startup-office:tenant-isolation`
- `npm run startup-office:rls-verification`
- `npm run startup-office:incident-response`
- `npm run startup-office:legal-artifacts`
- `npm run startup-office:subprocessors`
- `npm run startup-office:secret-rotation`
- `npm run startup-office:release-health`

## Security Review Evidence

Release evidence must include the deploy commit, package/schema release ID,
passing security gate, tenant isolation result, RLS verification result,
incident-response contract result, legal artifact result, subprocessor
disclosure result, secret-rotation result, release-health result, and any
external production smoke or customer evidence required by G099 and G100.

## Release Decision

Closed beta is allowed only when every artifact gate passes on the deploy
commit and external deployment/customer evidence remains recorded outside the
repository. Public self-serve remains blocked until counsel approves legal
terms, named subprocessors, regional transfer terms, and live production
security evidence.
