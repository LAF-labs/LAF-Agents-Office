import { Page, Play } from "iconoir-react";

import type {
  StartupOfficeArtifact,
  StartupOfficeRun,
} from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import { compactText, dateLabel } from "./startupOfficeViewModel";

interface ArtifactsPanelProps {
  artifacts: StartupOfficeArtifact[];
  copy: StartupOfficeAppCopy;
  onInspectArtifact: (artifact: StartupOfficeArtifact) => void;
  onInspectRun: (run: StartupOfficeRun) => void;
  runs: StartupOfficeRun[];
}

export function ArtifactsPanel({
  artifacts,
  copy,
  onInspectArtifact,
  onInspectRun,
  runs,
}: ArtifactsPanelProps) {
  return (
    <section className="skills-panel startup-office-artifacts">
      <div className="skills-section-head">
        <h3>{copy.artifactsTitle}</h3>
        <p>{copy.artifactsDescription}</p>
      </div>
      <div className="startup-artifact-list">
        {artifacts.length ? (
          artifacts.map((artifact) => (
            <article className="startup-artifact-row" key={artifact.id}>
              <div>
                <strong>{artifact.title || artifact.kind}</strong>
                <span>{dateLabel(artifact.created_at)}</span>
                <p>{compactText(artifact.content, 180)}</p>
              </div>
              <button
                type="button"
                className="startup-office-action is-secondary"
                onClick={() => onInspectArtifact(artifact)}
              >
                <Page aria-hidden={true} height={13} width={13} />
                {copy.viewArtifact}
              </button>
            </article>
          ))
        ) : (
          <div className="startup-approval-empty">{copy.noArtifacts}</div>
        )}
      </div>
      <div className="startup-run-list">
        {runs.map((run) => (
          <article className="startup-artifact-row" key={run.id}>
            <div>
              <strong>{run.title}</strong>
              <span>{run.status}</span>
              <p>{compactText(run.summary || run.objective || "", 160)}</p>
            </div>
            <button
              type="button"
              className="startup-office-action is-secondary"
              onClick={() => onInspectRun(run)}
            >
              <Play aria-hidden={true} height={13} width={13} />
              {copy.viewRun}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
