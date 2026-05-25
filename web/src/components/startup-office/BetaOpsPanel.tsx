import type { StartupOfficeBetaOps } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface BetaOpsPanelProps {
  betaOps?: StartupOfficeBetaOps;
  copy: StartupOfficeAppCopy;
}

export function BetaOpsPanel({ betaOps, copy }: BetaOpsPanelProps) {
  const billing = betaOps?.billing;
  const usage = betaOps?.usage;
  return (
    <section className="skills-panel startup-office-beta-ops">
      <div className="skills-section-head">
        <h3>{copy.betaOpsTitle}</h3>
        <p>{copy.betaOpsDescription}</p>
      </div>
      <dl className="startup-memory-list">
        <div>
          <dt>{copy.betaOpsLabels.state}</dt>
          <dd>{billing?.payment_status || billing?.billing_state || "trial"}</dd>
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
            {(usage?.seats ?? 0) + (usage?.pending_invites ?? 0)} / {billing?.seat_limit ?? 5}
          </dd>
        </div>
        <div>
          <dt>{copy.betaOpsLabels.storage}</dt>
          <dd>
            {(usage?.storage_mb ?? 0).toFixed(1)} / {billing?.storage_mb_limit ?? 1024} MB
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
      </dl>
    </section>
  );
}
