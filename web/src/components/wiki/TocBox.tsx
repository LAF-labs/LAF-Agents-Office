import { useState } from "react";

import { useUiText } from "../../lib/uiText";

/** Right-rail Contents box with nested numbered entries and a [hide] toggle. */

export interface TocEntry {
  level: 1 | 2 | 3;
  num: string;
  anchor: string;
  title: string;
}

interface TocBoxProps {
  entries: TocEntry[];
}

export default function TocBox({ entries }: TocBoxProps) {
  const { wiki: copy } = useUiText();
  const [hidden, setHidden] = useState(false);
  return (
    <div className="wk-toc-nested">
      <div className="wk-toc-box">
        <div className="wk-toc-title">
          {copy.contents}
          <button
            type="button"
            className="wk-hide-link"
            onClick={() => setHidden((v) => !v)}
            aria-expanded={!hidden}
          >
            [{hidden ? copy.show : copy.hide}]
          </button>
        </div>
        {!hidden
          ? entries.map((entry) => (
              <a
                key={`${entry.anchor}-${entry.num}`}
                href={`#${entry.anchor}`}
                className={`wk-lvl-${entry.level}`}
              >
                {entry.num ? <span className="wk-num">{entry.num}</span> : null}
                {entry.title}
              </a>
            ))
          : null}
      </div>
    </div>
  );
}
