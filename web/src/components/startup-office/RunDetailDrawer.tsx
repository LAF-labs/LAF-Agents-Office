import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Xmark } from "iconoir-react";

import {
  getStartupOfficeRun,
  type StartupOfficeApproval,
  type StartupOfficeArtifact,
  type StartupOfficeReceipt,
  type StartupOfficeRun,
} from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import { dateLabel } from "./startupOfficeViewModel";

interface RunDetailDrawerProps {
  copy: StartupOfficeAppCopy;
  onClose: () => void;
  run: StartupOfficeRun | null;
}

export function RunDetailDrawer({ copy, onClose, run }: RunDetailDrawerProps) {
  const detailQuery = useQuery({
    enabled: !!run?.id,
    queryFn: () => getStartupOfficeRun(run?.id || ""),
    queryKey: ["startup-office-run-detail", run?.id],
  });

  useEffect(() => {
    if (!run) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, run]);

  if (!run) return null;

  const detailRun = detailQuery.data?.run ?? run;
  const artifacts = detailQuery.data?.artifacts ?? [];
  const approvals = detailQuery.data?.approvals ?? [];
  const receipts = detailQuery.data?.receipts ?? [];
  const draftArtifact = artifacts[0] ?? null;

  return (
    <div className="startup-office-drawer-backdrop">
      <section
        className="startup-office-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="startup-office-run-title"
      >
        <div className="startup-office-drawer-header">
          <div>
            <p className="skills-kicker">{copy.runDetailTitle}</p>
            <h2 id="startup-office-run-title">{detailRun.title}</h2>
            <p>{detailRun.objective || detailRun.summary || detailRun.status}</p>
          </div>
          <button
            type="button"
            className="creation-modal-close"
            aria-label={copy.closePanel}
            onClick={onClose}
          >
            <Xmark aria-hidden={true} height={16} width={16} />
          </button>
        </div>
        <dl className="startup-detail-list">
          <div>
            <dt>Objective</dt>
            <dd>{detailRun.objective || "-"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detailRun.status}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{dateLabel(detailRun.created_at)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{dateLabel(detailRun.updated_at)}</dd>
          </div>
          <div>
            <dt>Summary</dt>
            <dd>{detailRun.summary || "-"}</dd>
          </div>
          <div>
            <dt>Inputs</dt>
            <dd>{jsonPreview(detailRun.inputs)}</dd>
          </div>
          <div>
            <dt>Draft artifact</dt>
            <dd>{artifactSummary(draftArtifact)}</dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>{approvalSummary(approvals)}</dd>
          </div>
          <div>
            <dt>Receipt trace</dt>
            <dd>{receiptSummary(receipts)}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{modelLabel(detailRun.metadata)}</dd>
          </div>
          <div>
            <dt>Usage</dt>
            <dd>{usageLabel(detailRun.metadata)}</dd>
          </div>
          <div>
            <dt>Detail status</dt>
            <dd>
              {detailQuery.isError
                ? "Could not load linked records."
                : detailQuery.isLoading
                  ? "Loading linked records..."
                  : "Linked records loaded."}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function modelLabel(metadata: StartupOfficeRun["metadata"]) {
  const provider = stringValue(metadata?.provider);
  const model = stringValue(metadata?.model);
  if (!provider && !model) return "-";
  return [provider, model].filter(Boolean).join(" / ");
}

function usageLabel(metadata: StartupOfficeRun["metadata"]) {
  const cost = metadata?.cost;
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return "-";
  const tokens = Number((cost as { total_tokens?: unknown }).total_tokens || 0);
  if (!Number.isFinite(tokens) || tokens <= 0) return "-";
  return `${tokens.toLocaleString()} tokens`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function jsonPreview(value: unknown) {
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!record) return "-";
  return JSON.stringify(record, null, 2);
}

function artifactSummary(artifact: StartupOfficeArtifact | null) {
  if (!artifact) return "-";
  const content = artifact.content ? `: ${artifact.content.slice(0, 160)}` : "";
  return `${artifact.title} (${artifact.kind})${content}`;
}

function approvalSummary(approvals: StartupOfficeApproval[]) {
  if (!approvals.length) return "-";
  return approvals
    .map((approval) =>
      [
        approval.title,
        approval.status,
        approval.risk_level ? `${approval.risk_level} risk` : "",
        approval.details,
      ]
        .filter(Boolean)
        .join(" - "),
    )
    .join("\n");
}

function receiptSummary(receipts: StartupOfficeReceipt[]) {
  if (!receipts.length) return "-";
  return receipts
    .map((receipt) =>
      [receipt.event_type, receipt.summary].filter(Boolean).join(" - "),
    )
    .join("\n");
}
