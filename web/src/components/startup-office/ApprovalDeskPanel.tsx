import { CheckCircle, XmarkCircle } from "iconoir-react";

import type { StartupOfficeApproval } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import {
  approvalActionLabel,
  compactText,
  labelFromRecord,
} from "./startupOfficeViewModel";

interface ApprovalDeskPanelProps {
  approvingID?: string | null;
  approvals: StartupOfficeApproval[];
  copy: StartupOfficeAppCopy;
  isBusy: boolean;
  onApprove: (approval: StartupOfficeApproval) => void;
  onReject: (approval: StartupOfficeApproval) => void;
  rejectingID?: string | null;
}

export function ApprovalDeskPanel({
  approvingID,
  approvals,
  copy,
  isBusy,
  onApprove,
  onReject,
  rejectingID,
}: ApprovalDeskPanelProps) {
  return (
    <section className="skills-panel startup-office-trust">
      <div className="skills-section-head">
        <h3>{copy.approvalsTitle}</h3>
        <p>{copy.approvalsDescription}</p>
      </div>
      <div className="startup-approval-list">
        {approvals.length ? (
          approvals.map((approval) => {
            const isApproving = approvingID === approval.id;
            const isRejecting = rejectingID === approval.id;
            return (
              <div className="startup-approval-row" key={approval.id}>
                <div className="startup-approval-heading">
                  <strong>{approval.title}</strong>
                  <span>
                    {copy.approvalRiskLabel}:{" "}
                    {labelFromRecord(copy.approvalRisk, approval.risk_level)}
                  </span>
                </div>
                {approval.details ? (
                  <p>{compactText(approval.details, 220)}</p>
                ) : null}
                <div className="startup-approval-actions">
                  <button
                    type="button"
                    className="startup-office-action"
                    aria-label={approvalActionLabel(
                      copy.approve,
                      approval.title,
                    )}
                    disabled={isBusy}
                    onClick={() => onApprove(approval)}
                  >
                    <CheckCircle aria-hidden={true} height={13} width={13} />
                    {isApproving ? copy.approving : copy.approve}
                  </button>
                  <button
                    type="button"
                    className="startup-office-action is-secondary"
                    aria-label={approvalActionLabel(
                      copy.reject,
                      approval.title,
                    )}
                    disabled={isBusy}
                    onClick={() => onReject(approval)}
                  >
                    <XmarkCircle aria-hidden={true} height={13} width={13} />
                    {isRejecting ? copy.rejecting : copy.reject}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <>
            {copy.defaultApprovals.map((approval) => (
              <div className="startup-approval-row" key={approval.label}>
                <strong>{approval.label}</strong>
                <span>{approval.detail}</span>
              </div>
            ))}
            <div className="startup-approval-empty">
              {copy.noPendingApprovals}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
