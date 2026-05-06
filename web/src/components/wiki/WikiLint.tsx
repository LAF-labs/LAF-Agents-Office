import { useCallback, useEffect, useState } from "react";

import { type LintFinding, type LintReport, runLint } from "../../api/wiki";
import ResolveContradictionModal from "./ResolveContradictionModal";

/**
 * WikiLint — the /wiki/lint surface.
 *
 * Displays the most recent lint report findings. Each finding shows:
 *   - Severity label (text + aria-label — never color alone per §9.3)
 *   - Type + entity slug as a wikilink
 *   - Summary
 *   - For contradictions: Resolve button that opens ResolveContradictionModal
 *
 * Mirrors WikiAudit.tsx in layout and data-loading pattern.
 */
interface WikiLintProps {
  onNavigate: (path: string | null) => void;
}

export default function WikiLint({ onNavigate }: WikiLintProps) {
  const [report, setReport] = useState<LintReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{
    finding: LintFinding;
    idx: number;
  } | null>(null);

  const loadReport = useCallback(() => {
    setLoading(true);
    setError(null);
    runLint()
      .then((r) => setReport(r))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to run lint"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <main className="wk-audit" data-testid="wk-lint">
      <header className="wk-audit-header">
        <div>
          <h1 className="wk-audit-title">Wiki health check</h1>
          <p className="wk-audit-strapline">
            A daily sweep of the whole wiki to surface things worth your
            attention: conflicting facts, pages with no links in or out, claims
            that may be out of date, entities that should probably be linked,
            and possible duplicates.
          </p>
        </div>
        <div className="wk-audit-stats" aria-live="polite">
          {lintStatsLabel(loading, error, report)}
        </div>
      </header>

      <section className="wk-audit-filters" aria-label="Actions">
        <button
          type="button"
          className="wk-audit-export"
          onClick={loadReport}
          disabled={loading}
        >
          {loading ? "Checking…" : "Check again now"}
        </button>
        {report ? (
          <span className="wk-audit-strapline" style={{ alignSelf: "center" }}>
            Last checked: {report.date}
          </span>
        ) : null}
      </section>

      <LintResults
        loading={loading}
        error={error}
        report={report}
        onNavigate={onNavigate}
        onResolve={(finding, idx) => setResolveTarget({ finding, idx })}
      />

      {resolveTarget && report ? (
        <ResolveContradictionModal
          finding={resolveTarget.finding}
          findingIdx={resolveTarget.idx}
          reportDate={report.date}
          onClose={() => setResolveTarget(null)}
          onResolved={() => {
            setResolveTarget(null);
            loadReport();
          }}
        />
      ) : null}
    </main>
  );
}

function lintStatsLabel(
  loading: boolean,
  error: string | null,
  report: LintReport | null,
): string {
  if (loading) return "Checking…";
  if (error) return "Error";
  if (!report) return "";
  return `${countBySev(report, "critical")} need attention · ${countBySev(report, "warning")} worth a look · ${countBySev(report, "info")} FYI`;
}

function countBySev(report: LintReport, severity: string): number {
  return report.findings.filter((finding) => finding.severity === severity)
    .length;
}

interface LintResultsProps {
  loading: boolean;
  error: string | null;
  report: LintReport | null;
  onNavigate: (path: string | null) => void;
  onResolve: (finding: LintFinding, idx: number) => void;
}

function LintResults({
  loading,
  error,
  report,
  onNavigate,
  onResolve,
}: LintResultsProps) {
  if (loading && !report)
    return <div className="wk-loading">Checking the wiki…</div>;
  if (error) return <div className="wk-error">Error: {error}</div>;
  if (report && report.findings.length === 0) {
    return (
      <div className="wk-audit-empty" data-testid="wk-lint-empty">
        All clear. Nothing needs your attention right now.
      </div>
    );
  }
  if (!report) return null;
  return (
    <LintTable
      findings={report.findings}
      onNavigate={onNavigate}
      onResolve={onResolve}
    />
  );
}

function LintTable({
  findings,
  onNavigate,
  onResolve,
}: {
  findings: LintFinding[];
  onNavigate: (path: string | null) => void;
  onResolve: (finding: LintFinding, idx: number) => void;
}) {
  return (
    <table className="wk-audit-table wk-lint-table">
      <thead>
        <tr>
          <th scope="col">Priority</th>
          <th scope="col">Issue</th>
          <th scope="col">Page</th>
          <th scope="col">What's going on</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((finding, idx) => (
          <LintRow
            finding={finding}
            idx={idx}
            key={lintFindingKey(finding)}
            onNavigate={onNavigate}
            onResolve={onResolve}
          />
        ))}
      </tbody>
    </table>
  );
}

function LintRow({
  finding,
  idx,
  onNavigate,
  onResolve,
}: {
  finding: LintFinding;
  idx: number;
  onNavigate: (path: string | null) => void;
  onResolve: (finding: LintFinding, idx: number) => void;
}) {
  const canResolve =
    finding.type === "contradictions" && finding.resolve_actions;
  return (
    <tr className={`wk-audit-row ${findingRowClass(finding.severity)}`}>
      <td className="wk-audit-when">
        <span
          className={`wk-lint-severity wk-lint-severity--${finding.severity}`}
          title={`${severityLabel(finding.severity)} finding`}
        >
          {severityLabel(finding.severity)}
        </span>
      </td>
      <td className="wk-audit-msg">{humanType(finding.type)}</td>
      <td className="wk-audit-author">
        {finding.entity_slug ? (
          <a
            href={`#/wiki/${encodeURI(finding.entity_slug)}`}
            onClick={(ev) => {
              ev.preventDefault();
              onNavigate(finding.entity_slug ?? null);
            }}
            className="wk-wikilink"
            data-wikilink="true"
          >
            {finding.entity_slug}
          </a>
        ) : (
          <span className="wk-audit-paths-empty">—</span>
        )}
      </td>
      <td className="wk-audit-msg">{finding.summary}</td>
      <td>
        {canResolve ? (
          <button
            type="button"
            className="wk-editor-save"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={() => onResolve(finding, idx)}
          >
            Resolve
          </button>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </td>
    </tr>
  );
}

/** Translate the engineering finding type into plain operator language. */
function humanType(t: string): string {
  switch (t) {
    case "contradictions":
      return "Conflicting facts";
    case "orphans":
      return "Page with no links";
    case "stale":
      return "May be out of date";
    case "missing_crossrefs":
      return "Should probably be linked";
    case "dedup_review":
      return "Possible duplicate";
    default:
      return t.replace(/_/g, " ");
  }
}

function lintFindingKey(finding: LintFinding): string {
  return [
    finding.type,
    finding.entity_slug,
    finding.severity,
    finding.summary,
    finding.fact_ids?.join(","),
  ]
    .filter(Boolean)
    .join("|");
}

function severityLabel(sev: string): string {
  switch (sev) {
    case "critical":
      return "Needs attention";
    case "warning":
      return "Worth a look";
    case "info":
      return "FYI";
    default:
      return sev;
  }
}

function findingRowClass(sev: string): string {
  switch (sev) {
    case "critical":
      return "is-recovery"; // reuse existing red-ish row style
    case "warning":
      return "is-bootstrap"; // amber
    default:
      return "is-agent";
  }
}
