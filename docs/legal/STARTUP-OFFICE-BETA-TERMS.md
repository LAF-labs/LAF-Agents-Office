# Startup Office Beta Terms Package

Status: operator-ready beta template. Counsel must approve jurisdiction-specific
language before public self-serve launch.

Version bundle:

- Terms: `startup-office-beta-terms-2026-05-26`
- Privacy: `startup-office-privacy-2026-05-26`
- DPA: `startup-office-dpa-2026-05-26`
- AI use: `startup-office-ai-use-2026-05-26`
- Retention: `startup-office-retention-2026-05-26`
- Deletion: `startup-office-deletion-2026-05-26`

## Product Terms

Startup Office is a pure-cloud AI Startup Office for a company workspace. One
account owns one company by default, and invited members join that workspace.
The service drafts business operations, research, customer-discovery artifacts,
offer packages, approvals, receipts, and company memory for the founder to
control.

The beta is not professional legal, financial, tax, employment, medical,
security, or regulated-market advice. Startup Office may draft those materials,
but the customer remains responsible for expert review, approval, publication,
spend, signatures, and customer promises.

High-impact actions remain founder-controlled. Public claims, customer promises,
outbound messages, spend, irreversible deletion, support access, and memory
promotion must be approval-gated or operator-reviewed before external reliance.

## Privacy Policy

Startup Office collects and stores data needed to operate the workspace:

- Company profile, ICP, offer, positioning, stage, and goals.
- Memory pages, assets, customers, metrics, signals, loops, runs, approvals,
  artifacts, receipts, notifications, support access events, deletion requests,
  billing state, billing documents, usage events, and audit events.
- User identity, team membership, role, permissions, invite status, and support
  contact records.

Workspace data is used to provide the Startup Office product, generate drafts,
maintain company memory, enforce approval gates, measure usage, debug incidents,
process billing, provide support, and satisfy export/deletion requests.

The service does not sell workspace data. The service does not train public
models on customer workspace data unless a future provider contract and an
explicit customer opt-in permit it.

Model calls may include relevant workspace context, user prompts, uploaded
materials, approved memory, customer-discovery notes, and retrieved citations.
The product should minimize context to the current task, avoid unnecessary
sensitive data, and keep receipts for material AI actions.

## Data Processing Addendum

For customer workspace content, the customer is the controller or business
owner and Startup Office is the processor or service provider. Startup Office
processes customer data only to provide the requested service, follow documented
instructions, secure the service, provide support, manage billing, and comply
with law.

DPA-ready commitments:

- Confidentiality obligations for personnel with production access.
- Technical and organizational safeguards including tenant isolation, RLS,
  service-role table allowlists, audit events, explicit support access, and
  least-privilege workspace roles.
- Sub-processor disclosure before public launch, including model providers,
  hosting, email, observability, payment, and storage vendors.
- Assistance with access, export, correction, deletion, incident response, and
  security review requests.
- Deletion or return of customer data at end of service, subject to backups,
  audit/security logs, payment records, and legal retention duties.

This structure follows the GDPR Article 28 controller/processor contract shape
and EDPB controller/processor guidance, while US beta customers receive the same
operational controls as a product commitment.

## Subprocessor And Model Provider Disclosure

`shared/startup-office-subprocessors.json` is the closed-beta disclosure source
of truth. Public self-serve launch requires a counsel-approved named vendor list
with DPA links, regions, and transfer terms. Closed-beta subprocessor changes
require at least 30 days notice unless an urgent security or continuity issue
requires faster replacement.

Closed-beta processors and provider categories:

- Supabase: database, auth, storage, and edge APIs for workspace records, user
  identity, auth sessions, assets, receipts, and audit evidence.
- OpenAI or OpenAI-compatible model provider: AI model inference and embeddings
  for task-specific workspace context, prompts, retrieved citations, and
  generated drafts.
- Resend: transactional email when `LAF_OUTBOX_EMAIL_PROVIDER=resend`, covering
  recipient email, notification subject, approval/failure summary, and delivery
  metadata.
- GitHub Actions: scheduled workers, monitors, and CI with redacted aggregate
  worker, monitor, and deploy logs.
- Host provider: production web/API hosting for HTTP metadata, app logs, and
  hosted API traffic.
- Billing or agreement provider: manual billing, invoice, payment, or signed
  agreement evidence for paid beta records.

Model provider controls:

- Production preflight rejects fake or disabled AI providers.
- Model calls should minimize workspace context to the current task.
- Run metadata records provider, model, token usage, cost, and redacted fallback
  attempts.
- AI output remains draft-only until founder approval or explicit human review.

## AI Use Terms

Startup Office uses AI to draft and analyze business work. AI output can be
incomplete, outdated, biased, or wrong. The founder must review and approve
high-impact outputs before using them externally.

The product must show or retain enough evidence for the founder to inspect the
work: run status, sources when available, approval decision, memory changes,
usage, artifacts, and receipts. Public claims should require citations or human
approval.

Disallowed beta uses:

- Fully autonomous public posting, contract signing, payment collection, ad
  spend, customer promises, or irreversible deletion without founder approval.
- Uploading regulated personal data unless a written beta agreement authorizes
  it and support confirms the required controls.
- Representing AI drafts as expert professional advice.

## Retention Terms

Default retention is workspace-lifetime retention for company memory, artifacts,
receipts, operating objects, approvals, and audit evidence unless deletion is
requested or a signed beta agreement says otherwise.

Operational retention:

- Receipts and audit events are append-only by default to preserve founder
  control evidence.
- Support access records remain visible to owners.
- Billing records may be retained as required for accounting, fraud prevention,
  tax, and dispute handling.
- Backups may retain deleted data until the backup retention window expires.

## Deletion Terms

Owners or admins may request workspace deletion through the product or operator
support. Deletion requests must be logged and processed across Startup Office
tables, including company profile, memory pages, assets, customers, metrics,
signals, loops, runs, artifacts, approvals, receipts where deletion is
authorized, notifications, support access, usage, worker jobs, billing documents,
and workspace settings.

The production purge path is `purge_startup_office_workspace`, guarded for the
service role and the explicit deletion request. It records the active deletion
manifest, enables the receipt-delete bypass only for the purge transaction, and
deletes the workspace through the `teams` cascade. A minimal
`startup_office_deletion_tombstones` row is retained outside that cascade as
isolated deletion proof.

Before destructive deletion, operators should offer export. After deletion,
records required for security, fraud prevention, accounting, legal compliance,
or incident investigation may be retained only for those purposes and isolated
from normal product use.

## Acceptance Evidence

The product stores acceptance in `startup_office_terms_acceptances` with the
current version bundle, accepting user, timestamp, metadata, and audit event
`startup_office.terms_accepted`.

Paid closed beta cannot be marked commercially ready unless:

- The current terms bundle is accepted.
- A signed agreement, paid invoice, receipt, or payment reference is present.
- Billing state is not blocked, paused, past due, or canceled.

## Source References

- EU GDPR Article 28 processor-contract requirements:
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EDPB Guidelines 07/2020 on controller and processor concepts:
  https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- FTC privacy and security business guidance:
  https://www.ftc.gov/business-guidance/privacy-security
- California Attorney General CCPA overview:
  https://oag.ca.gov/privacy/ccpa
- NIST AI Risk Management Framework and Generative AI Profile:
  https://www.nist.gov/itl/ai-risk-management-framework
