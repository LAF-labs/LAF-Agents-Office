import { useEffect } from "react";
import { Xmark } from "iconoir-react";

import type { StartupOfficeArtifact } from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";
import { dateLabel } from "./startupOfficeViewModel";

interface ArtifactViewerProps {
  artifact: StartupOfficeArtifact | null;
  copy: StartupOfficeAppCopy;
  onClose: () => void;
}

export function ArtifactViewer({
  artifact,
  copy,
  onClose,
}: ArtifactViewerProps) {
  useEffect(() => {
    if (!artifact) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [artifact, onClose]);

  if (!artifact) return null;

  return (
    <div className="startup-office-drawer-backdrop">
      <section
        className="startup-office-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="startup-office-artifact-title"
      >
        <div className="startup-office-drawer-header">
          <div>
            <p className="skills-kicker">{copy.artifactViewerTitle}</p>
            <h2 id="startup-office-artifact-title">{artifact.title}</h2>
            <p>
              {artifact.kind} - {dateLabel(artifact.created_at)}
            </p>
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
        <pre className="startup-artifact-content">{artifact.content}</pre>
        <WhyThisOutput artifact={artifact} />
      </section>
    </div>
  );
}

function WhyThisOutput({ artifact }: { artifact: StartupOfficeArtifact }) {
  const quality = recordValue(artifact.metadata?.quality);
  const context = recordValue(artifact.metadata?.context);
  const output = recordValue(artifact.metadata?.structured_output);
  const assumptions = Array.isArray(output.assumptions)
    ? output.assumptions.length
    : 0;
  const sources = Array.isArray(output.sources) ? output.sources.length : 0;
  if (!Object.keys(quality).length && !Object.keys(context).length) return null;
  return (
    <dl className="startup-detail-list startup-why-output">
      <div>
        <dt>Why this output</dt>
        <dd>
          {Number(context.memory_page_count || 0)} memory pages, {sources} sources,{" "}
          {assumptions} assumptions
        </dd>
      </div>
      <div>
        <dt>Quality</dt>
        <dd>{String(quality.risk_level || "medium")} risk</dd>
      </div>
    </dl>
  );
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
