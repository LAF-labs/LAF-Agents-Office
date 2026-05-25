import type { StartupOfficeBetaOps } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface BetaOpsPanelProps {
  betaOps?: StartupOfficeBetaOps;
  copy: StartupOfficeAppCopy;
}

export function BetaOpsPanel({ betaOps, copy }: BetaOpsPanelProps) {
  const billing = betaOps?.billing;
  const usage = betaOps?.usage;
  const commercial = betaOps?.commercial;
  const documents = betaOps?.billing_documents ?? [];
  return (
    <section className="skills-panel startup-office-beta-ops">
      <div className="skills-section-head">
        <h3>{copy.betaOpsTitle}</h3>
        <p>{copy.betaOpsDescription}</p>
      </div>
      <dl className="startup-memory-list">
        <div>
          <dt>{copy.betaOpsLabels.state}</dt>
          <dd>{billingStateLabel(betaOps)}</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.plan}</dt>
          <dd>{billing?.plan || "trial"}</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.agreement}</dt>
          <dd>{commercial?.agreement_status || "missing"}</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.provider}</dt>
          <dd>{billing?.billing_provider || "manual"}</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.runs}</dt>
          <dd>
            {usage?.runs ?? 0} / {billing?.monthly_run_limit ?? 50}
          </dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.seats}</dt>
          <dd>
            {(usage?.seats ?? 0) + (usage?.pending_invites ?? 0)} /{" "}
            {billing?.seat_limit ?? 5}
          </dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.storage}</dt>
          <dd>
            {(usage?.storage_mb ?? 0).toFixed(1)} /{" "}
            {billing?.storage_mb_limit ?? 1024} MB
          </dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.tokens}</dt>
          <dd>{(usage?.total_tokens ?? 0).toLocaleString()} tokens</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.toolCalls}</dt>
          <dd>{(usage?.tool_calls ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.nextStep}</dt>
          <dd>{commercial?.next_step || copy.betaOpsNoDocuments}</dd>
        </div>
        {documents.slice(0, 3).map((document) => (
          <div key={document.id}>
            <dt>{copy.betaOpsDocumentLabel(document.document_type)}</dt>
            <dd>{billingDocumentText(document)}</dd>
          </div>
        ))}
        {!documents.length ? (
          <div>
            <dt>{copy.betaOpsLabels.documents}</dt>
            <dd>{copy.betaOpsNoDocuments}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function billingStateLabel(betaOps?: StartupOfficeBetaOps) {
  return (
    betaOps?.commercial?.status ||
    betaOps?.billing?.payment_status ||
    betaOps?.billing?.billing_state ||
    "trial"
  );
}

function billingDocumentText(
  document: NonNullable<StartupOfficeBetaOps["billing_documents"]>[number],
) {
  const reference = document.reference_url || document.external_reference;
  const amount = formatBillingAmount(document.amount_cents, document.currency);
  return reference
    ? `${document.status} - ${amount} - ${reference}`
    : `${document.status} - ${amount}`;
}

function formatBillingAmount(amountCents = 0, currency = "USD") {
  if (!amountCents) return currency;
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency",
  }).format(amountCents / 100);
}
