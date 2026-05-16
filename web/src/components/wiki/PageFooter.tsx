import { useUiText } from "../../lib/uiText";

interface PageFooterProps {
  lastEditedBy: string;
  lastEditedTs: string;
  articlePath: string;
  actions?: Array<{ label: string; onClick?: () => void }>;
}

export default function PageFooter({
  lastEditedBy,
  lastEditedTs,
  articlePath,
  actions,
}: PageFooterProps) {
  const { wiki: copy } = useUiText();
  const renderedActions: Array<{ label: string; onClick?: () => void }> =
    actions ?? copy.footerActions.map((label) => ({ label }));
  return (
    <div className="wk-page-footer">
      <div>
        {copy.footerEdited(formatFull(lastEditedTs, copy), lastEditedBy)}
      </div>
      <div className="wk-actions">
        {renderedActions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
      <div className="wk-dim">{copy.footerAttribution(articlePath)}</div>
    </div>
  );
}

function formatFull(
  iso: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = d.toISOString().slice(0, 10);
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    return copy.fullDate(date, `${hours}:${mins}`);
  } catch {
    return iso;
  }
}
