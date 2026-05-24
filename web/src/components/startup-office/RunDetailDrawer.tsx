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
        </dl>
      </section>
    </div>
  );
}
