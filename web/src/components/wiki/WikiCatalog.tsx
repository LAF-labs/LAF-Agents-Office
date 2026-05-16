import { useMemo, useState } from "react";

import type { WikiCatalogEntry } from "../../api/wiki";
import { formatRelativeTime } from "../../lib/format";
import { resolveGroupOrder } from "../../lib/groupOrder";
import { useUiText } from "../../lib/uiText";
import NewArticleModal from "./NewArticleModal";
import PixelAvatar from "./PixelAvatar";

/** `/wiki` landing view: grid of thematic dir groups with recent articles. */

interface WikiCatalogProps {
  catalog: WikiCatalogEntry[];
  onNavigate: (path: string) => void;
  onOpenAudit?: () => void;
  articlesCount?: number;
  commitsCount?: number;
  agentsCount?: number;
}

export default function WikiCatalog({
  catalog,
  onNavigate,
  onOpenAudit,
  articlesCount,
  agentsCount,
}: WikiCatalogProps) {
  const { wiki: copy } = useUiText();
  const [showNew, setShowNew] = useState(false);
  const grouped = useMemo(() => groupByGroup(catalog), [catalog]);
  const groupOrder = useMemo(
    () => resolveGroupOrder(catalog.map((c) => c.group)),
    [catalog],
  );
  const projectPages = useMemo(
    () => catalog.filter(isProjectMemoryPage).sort(sortRecentFirst).slice(0, 5),
    [catalog],
  );
  const recentPages = useMemo(
    () => [...catalog].sort(sortRecentFirst).slice(0, 5),
    [catalog],
  );
  const stats = useMemo(
    () =>
      [
        copy.statsArticles(articlesCount ?? catalog.length),
        typeof agentsCount === "number"
          ? copy.statsAgentUpdates(agentsCount)
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [catalog.length, articlesCount, agentsCount, copy],
  );

  return (
    <main className="wk-catalog" data-testid="wk-catalog">
      <header className="wk-catalog-header">
        <h1 className="wk-catalog-title">{copy.catalogTitle}</h1>
        <div className="wk-catalog-stats">{stats}</div>
        <div className="wk-catalog-clone">
          {copy.catalogDesc}
          {" · "}
          <button
            type="button"
            className="wk-catalog-new-link"
            data-testid="wk-catalog-new"
            onClick={() => setShowNew(true)}
          >
            {copy.newMemoryPage}
          </button>
          {onOpenAudit ? (
            <>
              {" · "}
              <button
                type="button"
                className="wk-catalog-audit-link"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenAudit();
                }}
              >
                {copy.history}
              </button>
            </>
          ) : null}
        </div>
      </header>
      <section className="wk-memory-overview" aria-label={copy.overviewAria}>
        <section className="wk-memory-panel wk-memory-panel-primary">
          <div>
            <h2>{copy.projectPages}</h2>
            <p>{copy.projectPagesDesc}</p>
          </div>
          {projectPages.length > 0 ? (
            <ul>
              {projectPages.map((item) => (
                <li key={item.path}>
                  <button type="button" onClick={() => onNavigate(item.path)}>
                    {item.title}
                  </button>
                  <span className="wk-memory-when">
                    {safeRelative(item.last_edited_ts)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wk-memory-empty">{copy.projectPagesEmpty}</p>
          )}
        </section>
        <section className="wk-memory-panel">
          <div>
            <h2>{copy.recentUpdates}</h2>
            <p>{copy.recentUpdatesDesc}</p>
          </div>
          {recentPages.length > 0 ? (
            <ul>
              {recentPages.map((item) => (
                <li key={item.path}>
                  <button type="button" onClick={() => onNavigate(item.path)}>
                    {item.title}
                  </button>
                  <span className="wk-memory-when">
                    {safeRelative(item.last_edited_ts)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wk-memory-empty">{copy.noMemoryPages}</p>
          )}
        </section>
      </section>
      {showNew ? (
        <NewArticleModal
          catalog={catalog}
          onCancel={() => setShowNew(false)}
          onCreated={(path) => {
            setShowNew(false);
            onNavigate(path);
          }}
        />
      ) : null}
      <div className="wk-catalog-grid">
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <section key={group} className="wk-catalog-card">
              <h3>
                {group}
                <span className="wk-count">{items.length}</span>
              </h3>
              <ul>
                {items.slice(0, 6).map((item) => (
                  <li key={item.path}>
                    <PixelAvatar slug={item.author_slug} size={16} />
                    <button
                      type="button"
                      className="wk-title"
                      onClick={() => onNavigate(item.path)}
                    >
                      {item.title}
                    </button>
                    <span className="wk-when">
                      {safeRelative(item.last_edited_ts)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function groupByGroup(
  catalog: WikiCatalogEntry[],
): Record<string, WikiCatalogEntry[]> {
  const out: Record<string, WikiCatalogEntry[]> = {};
  for (const entry of catalog) {
    if (!out[entry.group]) out[entry.group] = [];
    out[entry.group].push(entry);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => (a.last_edited_ts < b.last_edited_ts ? 1 : -1));
  }
  return out;
}

function isProjectMemoryPage(entry: WikiCatalogEntry): boolean {
  return (
    entry.path.startsWith("projects/") ||
    entry.path.startsWith("team/projects/") ||
    entry.group.toLowerCase() === "projects"
  );
}

function sortRecentFirst(a: WikiCatalogEntry, b: WikiCatalogEntry): number {
  return Date.parse(b.last_edited_ts) - Date.parse(a.last_edited_ts);
}

function safeRelative(iso: string): string {
  try {
    return formatRelativeTime(iso);
  } catch {
    return iso;
  }
}
