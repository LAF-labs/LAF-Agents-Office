import { EditPencil } from "iconoir-react";

import type { StartupOfficeGrowthSummary } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

interface CompanyPulsePanelProps {
  copy: StartupOfficeAppCopy;
  isFallback: boolean;
  onEditProfile: () => void;
  summary: StartupOfficeGrowthSummary;
}

export function CompanyPulsePanel({
  copy,
  isFallback,
  onEditProfile,
  summary,
}: CompanyPulsePanelProps) {
  const firstApproval = summary.pending_approvals[0] ?? null;
  const profile = summary.company_profile;

  return (
    <section className="skills-panel startup-office-pulse">
      <div className="skills-section-head startup-office-section-head">
        <div>
          <h3>{copy.pulseTitle}</h3>
          <p>{copy.pulseDescription}</p>
        </div>
        <button
          type="button"
          className="startup-office-action is-secondary"
          onClick={onEditProfile}
        >
          <EditPencil aria-hidden={true} height={13} width={13} />
          {copy.editProfile}
        </button>
      </div>
      <div className="startup-office-status-strip">
        <PulseDatum
          label={copy.officeStatusLabel}
          value={isFallback ? copy.officeFallback : copy.officeOnline}
        />
        <PulseDatum
          label={copy.recentRunsLabel}
          value={String(summary.pulse.recent_runs)}
        />
        <PulseDatum
          label={copy.pendingApprovalsLabel}
          value={String(summary.pulse.pending_approvals)}
        />
        <PulseDatum
          label={copy.receiptsCountLabel}
          value={String(summary.pulse.recent_receipts)}
        />
      </div>
      <div className="startup-office-pulse-list">
        <PulseDatum
          label={copy.companyLabel}
          value={profile.name || copy.companyFallback}
        />
        <PulseDatum
          label={copy.stageLabel}
          value={profile.stage || copy.stageFallback}
        />
        <PulseDatum
          label={copy.goalLabel}
          value={profile.priority || profile.goals || copy.goalFallback}
        />
        <PulseDatum
          label={copy.nextDecisionLabel}
          value={firstApproval?.title || copy.nextDecisionFallback}
        />
      </div>
    </section>
  );
}

function PulseDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="startup-pulse-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
