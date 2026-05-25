import { useEffect } from "react";
import { Copy, Download, Xmark } from "iconoir-react";

import type { StartupOfficeArtifact } from "../../api/startupOffice";
import { showNotice } from "../ui/Toast";
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

  const handleCopy = () => {
    copyArtifactContent(artifact)
      .then(() => showNotice(copy.artifactCopied, "success"))
      .catch((error: Error) =>
        showNotice(copy.actionFailed(error.message), "error"),
      );
  };
  const handleExport = () => {
    exportArtifactMarkdown(artifact);
    showNotice(copy.artifactExported, "success");
  };

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
        <div className="startup-artifact-actions">
          <button
            type="button"
            className="startup-office-action is-secondary"
            onClick={handleCopy}
          >
            <Copy aria-hidden={true} height={13} width={13} />
            {copy.copyArtifact}
          </button>
          <button
            type="button"
            className="startup-office-action is-secondary"
            onClick={handleExport}
          >
            <Download aria-hidden={true} height={13} width={13} />
            {copy.exportArtifact}
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
  if (!(Object.keys(quality).length || Object.keys(context).length))
    return null;
  return (
    <dl className="startup-detail-list startup-why-output">
      <div>
        <dt>Why this output</dt>
        <dd>
          {Number(context.memory_page_count || 0)} memory pages, {sources}{" "}
          sources, {assumptions} assumptions
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

async function copyArtifactContent(artifact: StartupOfficeArtifact) {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    throw new Error("Clipboard is unavailable");
  }
  await clipboard.writeText(artifact.content || "");
}

function exportArtifactMarkdown(artifact: StartupOfficeArtifact) {
  const anchor = document.createElement("a");
  anchor.download = `${safeFilename(artifact.title || artifact.id || "artifact")}.md`;
  anchor.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(
    artifactMarkdown(artifact),
  )}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function artifactMarkdown(artifact: StartupOfficeArtifact) {
  const parts = [
    `# ${artifact.title || "Artifact"}`,
    "",
    `- Kind: ${artifact.kind || "-"}`,
    `- Run: ${artifact.run_id || "-"}`,
    `- Created: ${artifact.created_at || "-"}`,
    "",
    artifact.content || "",
  ];
  return parts.join("\n");
}

function safeFilename(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "artifact"
  );
}
