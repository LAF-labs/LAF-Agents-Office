import { useMemo, useState } from "react";

import type { WikiCatalogEntry } from "../../api/wiki";
import { formatRelativeTime } from "../../lib/format";
import { resolveGroupOrder } from "../../lib/groupOrder";
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
        `${articlesCount ?? catalog.length} articles`,
        typeof agentsCount === "number" ? `${agentsCount} agent updates` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [catalog.length, articlesCount, agentsCount],
  );

  return (
    <main className="wk-catalog" data-testid="wk-catalog">
      <header className="wk-catalog-header">
        <h1 className="wk-catalog-title">Project memory</h1>
        <div className="wk-catalog-stats">{stats}</div>
        <div className="wk-catalog-clone">
          Project goals, decisions, task history, and delivery notes that agents
          read before work.
          {" · "}
          <button
            type="button"
            className="wk-catalog-new-link"
            data-testid="wk-catalog-new"
            onClick={() => setShowNew(true)}
          >
            + New memory page
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
                History
              </button>
            </>
          ) : null}
        </div>
      </header>
      <section
        className="wk-memory-overview"
        aria-label="Project memory overview"
      >
        <section className="wk-memory-panel wk-memory-panel-primary">
          <div>
            <h2>Project pages</h2>
            <p>
              Start from the project page when you need goals, constraints, and
              the latest task decisions.
            </p>
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
            <p className="wk-memory-empty">
              Create a project first; its memory page will appear here.
            </p>
          )}
        </section>
        <section className="wk-memory-panel">
          <div>
            <h2>Recent updates</h2>
            <p>Use this to scan what changed before starting new work.</p>
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
            <p className="wk-memory-empty">No memory pages yet.</p>
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
