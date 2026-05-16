import { formatRelativeTime } from "../../lib/format";
import { useUiText } from "../../lib/uiText";

/** Right-rail page statistics panel with mono-font values. */

interface PageStatsPanelProps {
  revisions: number;
  contributors: number;
  wordCount: number;
  created: string;
  lastEdit: string;
  viewed?: number;
}

export default function PageStatsPanel({
  revisions,
  contributors,
  wordCount,
  created,
  lastEdit,
  viewed,
}: PageStatsPanelProps) {
  const { wiki: copy } = useUiText();
  return (
    <div className="wk-stats-panel">
      <h4>{copy.pageStats}</h4>
      <dl>
        <dt>{copy.revisions}</dt>
        <dd>{revisions}</dd>
        <dt>{copy.contributors}</dt>
        <dd>{copy.contributorsValue(contributors)}</dd>
        <dt>{copy.words}</dt>
        <dd>{wordCount.toLocaleString()}</dd>
        <dt>{copy.created}</dt>
        <dd>{shortDate(created)}</dd>
        <dt>{copy.lastEdit}</dt>
        <dd>{safeRelative(lastEdit)}</dd>
        {typeof viewed === "number" && (
          <>
            <dt>{copy.viewed}</dt>
            <dd>{copy.viewedValue(viewed)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function safeRelative(iso: string): string {
  try {
    return formatRelativeTime(iso);
  } catch {
    return iso;
  }
}
