/** Amber banner at the top of an article: pulsing dot + live message + meta. */

import { useUiText } from "../../lib/uiText";

interface ArticleStatusBannerProps {
  message: string;
  liveAgent?: string;
  revisions?: number;
  contributors?: number;
  wordCount?: number;
}

export default function ArticleStatusBanner({
  message,
  liveAgent,
  revisions,
  contributors,
  wordCount,
}: ArticleStatusBannerProps) {
  const { wiki: copy } = useUiText();
  const metaBits: string[] = [];
  if (typeof revisions === "number") metaBits.push(copy.revShort(revisions));
  if (typeof contributors === "number")
    metaBits.push(copy.contribShort(contributors));
  if (typeof wordCount === "number") metaBits.push(copy.wordsShort(wordCount));
  return (
    <div className="wk-status-banner" data-testid="wk-status-banner">
      <span className="wk-icon" />
      <span>
        {liveAgent ? (
          <strong>{copy.live} </strong>
        ) : (
          <strong>{copy.status} </strong>
        )}
        {message}
      </span>
      {metaBits.length > 0 && (
        <span className="wk-meta">{metaBits.join(" · ")}</span>
      )}
    </div>
  );
}
