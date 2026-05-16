import { useEffect, useMemo, useState } from "react";

import { fetchAuditLog, type WikiAuditEntry } from "../../api/wiki";
import { formatAgentName } from "../../lib/agentName";
import { formatRelativeTime } from "../../lib/format";
import { useUiText } from "../../lib/uiText";
import PixelAvatar from "./PixelAvatar";

/**
 * Audit-log view at #/wiki/_audit.
 *
 * This is the compliance / "who edited what when" surface — distinct from
 * the per-article Sources panel (which scopes to one article) and the
 * bottom EditLogFooter (which is a live pulse of recent writes only).
 *
 * UX goals, in priority order:
 *   1. You can find one edit fast. Filters compose (author + path + since).
 *   2. You can see the shape of activity at a glance. Bootstrap commits
 *      are visually distinct from agent writes; system / recovery commits
 *      too. No color soup — it's a serious page.
 *   3. You can export. The CSV copy button dumps exactly what's filtered.
 *
 * Out of scope for v1: diff viewer, commit SHA → GitHub linking, tamper
 * detection sidecar. These are v1.1 items (see TESTING-WIKI.md).
 */
interface WikiAuditProps {
  onNavigate: (path: string | null) => void;
}

type AuthorBucket = "all" | "agents" | "system" | string;

export default function WikiAudit({ onNavigate }: WikiAuditProps) {
  const { wiki: copy } = useUiText();
  const [entries, setEntries] = useState<WikiAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState<AuthorBucket>("all");
  const [pathQuery, setPathQuery] = useState("");
  const [sinceDays, setSinceDays] = useState<number | null>(null);
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since =
      typeof sinceDays === "number"
        ? new Date(Date.now() - sinceDays * 86400 * 1000).toISOString()
        : undefined;
    fetchAuditLog({ limit, since })
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load memory history",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, sinceDays]);

  const knownAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries ?? []) set.add(e.author_slug);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = pathQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (!passesAuthor(e.author_slug, authorFilter)) return false;
      if (q) {
        const hit =
          e.message.toLowerCase().includes(q) ||
          e.paths.some((p) => p.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [entries, pathQuery, authorFilter]);

  const stats = useMemo(() => summarize(filtered), [filtered]);

  return (
    <main className="wk-audit" data-testid="wk-audit">
      <header className="wk-audit-header">
        <div>
          <h1 className="wk-audit-title">{copy.auditTitle}</h1>
          <p className="wk-audit-strapline">{copy.auditDesc}</p>
        </div>
        <div className="wk-audit-stats" aria-live="polite">
          {auditStatsLabel(loading, error, stats, copy)}
        </div>
      </header>

      <section className="wk-audit-filters" aria-label={copy.filtersAria}>
        <label className="wk-audit-filter">
          <span>{copy.author}</span>
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value as AuthorBucket)}
          >
            <option value="all">{copy.all}</option>
            <option value="agents">{copy.agentsOnly}</option>
            <option value="system">{copy.systemOnly}</option>
            {knownAuthors.map((a) => (
              <option key={a} value={a}>
                @{a}
              </option>
            ))}
          </select>
        </label>
        <label className="wk-audit-filter">
          <span>{copy.search}</span>
          <input
            type="search"
            placeholder={copy.auditSearchPlaceholder}
            value={pathQuery}
            onChange={(e) => setPathQuery(e.target.value)}
          />
        </label>
        <label className="wk-audit-filter">
          <span>{copy.window}</span>
          <select
            value={sinceDays ?? "all"}
            onChange={(e) => {
              const v = e.target.value;
              setSinceDays(v === "all" ? null : Number(v));
            }}
          >
            <option value="all">{copy.allTime}</option>
            <option value="1">{copy.last24Hours}</option>
            <option value="7">{copy.last7Days}</option>
            <option value="30">{copy.last30Days}</option>
            <option value="90">{copy.last90Days}</option>
          </select>
        </label>
        <label className="wk-audit-filter">
          <span>{copy.limit}</span>
          <select
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="0">{copy.noLimit}</option>
          </select>
        </label>
        <button
          type="button"
          className="wk-audit-export"
          onClick={() => downloadCSV(filtered)}
          disabled={filtered.length === 0}
        >
          {copy.exportCsv}
        </button>
      </section>

      <AuditResults
        loading={loading}
        entries={entries}
        error={error}
        filtered={filtered}
        onNavigate={onNavigate}
        copy={copy}
      />
    </main>
  );
}

function auditStatsLabel(
  loading: boolean,
  error: string | null,
  stats: ReturnType<typeof summarize>,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  if (loading) return copy.auditStatsLoading;
  if (error) return copy.auditStatsError;
  return copy.auditStatsLabel(stats.total, stats.authors, stats.paths);
}

interface AuditResultsProps {
  loading: boolean;
  entries: WikiAuditEntry[] | null;
  error: string | null;
  filtered: WikiAuditEntry[];
  onNavigate: (path: string | null) => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function AuditResults({
  loading,
  entries,
  error,
  filtered,
  onNavigate,
  copy,
}: AuditResultsProps) {
  if (loading && !entries)
    return <div className="wk-loading">{copy.loadingHistory}</div>;
  if (error) return <div className="wk-error">{copy.articleError(error)}</div>;
  if (filtered.length === 0) {
    return (
      <div className="wk-audit-empty">
        {entries && entries.length === 0 ? copy.noEdits : copy.noFilterMatches}
      </div>
    );
  }
  return <AuditTable entries={filtered} onNavigate={onNavigate} copy={copy} />;
}

function AuditTable({
  entries,
  onNavigate,
  copy,
}: {
  entries: WikiAuditEntry[];
  onNavigate: (path: string | null) => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}) {
  return (
    <table className="wk-audit-table">
      <thead>
        <tr>
          <th scope="col">{copy.when}</th>
          <th scope="col">{copy.author}</th>
          <th scope="col">{copy.message}</th>
          <th scope="col">{copy.paths}</th>
          <th scope="col">{copy.sha}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <AuditRow entry={entry} key={entry.sha} onNavigate={onNavigate} />
        ))}
      </tbody>
    </table>
  );
}

function AuditRow({
  entry,
  onNavigate,
}: {
  entry: WikiAuditEntry;
  onNavigate: (path: string | null) => void;
}) {
  const tag = authorTag(entry.author_slug);
  return (
    <tr className={`wk-audit-row ${rowClass(entry.author_slug)}`}>
      <td className="wk-audit-when" title={entry.timestamp}>
        {safeRelative(entry.timestamp)}
      </td>
      <td className="wk-audit-author">
        <PixelAvatar slug={entry.author_slug} size={16} />
        <span>{formatAgentName(entry.author_slug)}</span>
        {tag ? <span className="wk-audit-tag">{tag}</span> : null}
      </td>
      <td className="wk-audit-msg">{entry.message}</td>
      <td className="wk-audit-paths">
        <AuditPaths paths={entry.paths} onNavigate={onNavigate} />
      </td>
      <td className="wk-audit-sha">{entry.sha}</td>
    </tr>
  );
}

function AuditPaths({
  paths,
  onNavigate,
}: {
  paths: string[];
  onNavigate: (path: string | null) => void;
}) {
  if (paths.length === 0) {
    return <span className="wk-audit-paths-empty">—</span>;
  }
  return (
    <ul>
      {paths.map((path) => (
        <li key={path}>
          {isArticlePath(path) ? (
            <a
              href={`#/wiki/${encodeURI(path)}`}
              onClick={(ev) => {
                ev.preventDefault();
                onNavigate(path);
              }}
            >
              {path}
            </a>
          ) : (
            <span>{path}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function passesAuthor(slug: string, filter: AuthorBucket): boolean {
  if (filter === "all") return true;
  if (filter === "system") return isSystemSlug(slug);
  if (filter === "agents") return !isSystemSlug(slug);
  return slug === filter;
}

function isSystemSlug(slug: string): boolean {
  return (
    slug === "system" ||
    slug === "laf-office-bootstrap" ||
    slug === "laf-office-recovery"
  );
}

function authorTag(slug: string): string | null {
  if (slug === "laf-office-bootstrap") return "bootstrap";
  if (slug === "laf-office-recovery") return "recovery";
  if (slug === "system") return "system";
  return null;
}

function rowClass(slug: string): string {
  if (slug === "laf-office-bootstrap") return "is-bootstrap";
  if (slug === "laf-office-recovery") return "is-recovery";
  if (slug === "system") return "is-system";
  return "is-agent";
}

function isArticlePath(p: string): boolean {
  return p.startsWith("team/") && p.endsWith(".md");
}

function safeRelative(iso: string): string {
  try {
    return formatRelativeTime(iso);
  } catch {
    return iso;
  }
}

function summarize(entries: WikiAuditEntry[]): {
  total: number;
  authors: number;
  paths: number;
} {
  const authors = new Set<string>();
  const paths = new Set<string>();
  for (const e of entries) {
    authors.add(e.author_slug);
    for (const p of e.paths) paths.add(p);
  }
  return { total: entries.length, authors: authors.size, paths: paths.size };
}

function downloadCSV(entries: WikiAuditEntry[]): void {
  const rows: string[] = ["timestamp,author,sha,message,paths"];
  for (const e of entries) {
    rows.push(
      [
        csvField(e.timestamp),
        csvField(e.author_slug),
        csvField(e.sha),
        csvField(e.message),
        csvField(e.paths.join(" | ")),
      ].join(","),
    );
  }
  const blob = new Blob([`${rows.join("\n")}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `laf-office-wiki-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvField(raw: string): string {
  const s = String(raw ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
