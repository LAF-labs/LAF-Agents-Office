import { useEffect } from "react";
import { Xmark } from "iconoir-react";

import type { StartupOfficeRun } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import { dateLabel } from "./startupOfficeViewModel";

interface RunDetailDrawerProps {
  copy: StartupOfficeAppCopy;
  onClose: () => void;
  run: StartupOfficeRun | null;
}

export function RunDetailDrawer({ copy, onClose, run }: RunDetailDrawerProps) {
  useEffect(() => {
    if (!run) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, run]);

  if (!run) return null;

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
            <h2 id="startup-office-run-title">{run.title}</h2>
            <p>{run.objective || run.summary || run.status}</p>
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
            <dt>Status</dt>
            <dd>{run.status}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{dateLabel(run.created_at)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{dateLabel(run.updated_at)}</dd>
          </div>
          <div>
            <dt>Summary</dt>
            <dd>{run.summary || "-"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{modelLabel(run.metadata)}</dd>
          </div>
          <div>
            <dt>Usage</dt>
            <dd>{usageLabel(run.metadata)}</dd>
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
