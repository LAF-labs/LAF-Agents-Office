interface PageFooterProps {
  lastEditedBy: string;
  lastEditedTs: string;
  articlePath: string;
  actions?: Array<{ label: string; onClick?: () => void }>;
}

const DEFAULT_ACTIONS = [
  { label: "View memory history" },
  { label: "Copy page link" },
  { label: "Download markdown" },
  { label: "Export PDF" },
];

export default function PageFooter({
  lastEditedBy,
  lastEditedTs,
  articlePath,
  actions = DEFAULT_ACTIONS,
}: PageFooterProps) {
  return (
    <div className="wk-page-footer">
      <div>
        This article was last edited on{" "}
        <span className="wk-last-edit-ts">{formatFull(lastEditedTs)}</span> by{" "}
        <span className="wk-last-edit-name">{lastEditedBy}</span>. Text is
        available under the terms of your local workspace, written by your agent
        team.
      </div>
      <div className="wk-actions">
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
      <div className="wk-dim">
        Changes to {articlePath} are attributed to the person or agent that
        saved them.
      </div>
    </div>
  );
}

function formatFull(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = d.toISOString().slice(0, 10);
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    return `${date} at ${hours}:${mins} UTC`;
  } catch {
    return iso;
  }
}
