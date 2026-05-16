import { useCallback, useEffect, useState } from "react";

import { type LintFinding, type LintReport, runLint } from "../../api/wiki";
import { useUiText } from "../../lib/uiText";
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
  const { wiki: copy } = useUiText();
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
          <h1 className="wk-audit-title">{copy.wikiHealthTitle}</h1>
          <p className="wk-audit-strapline">{copy.wikiHealthDesc}</p>
        </div>
        <div className="wk-audit-stats" aria-live="polite">
          {lintStatsLabel(loading, error, report, copy)}
        </div>
      </header>

      <section className="wk-audit-filters" aria-label={copy.actionsAria}>
        <button
          type="button"
          className="wk-audit-export"
          onClick={loadReport}
          disabled={loading}
        >
          {loading ? copy.checking : copy.checkAgainNow}
        </button>
        {report ? (
          <span className="wk-audit-strapline" style={{ alignSelf: "center" }}>
            {copy.lastChecked(report.date)}
          </span>
        ) : null}
      </section>

      <LintResults
        loading={loading}
        error={error}
        report={report}
        onNavigate={onNavigate}
        onResolve={(finding, idx) => setResolveTarget({ finding, idx })}
        copy={copy}
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
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  if (loading) return copy.checking;
  if (error) return copy.auditStatsError;
  if (!report) return "";
  return copy.lintStatsLabel(
    countBySev(report, "critical"),
    countBySev(report, "warning"),
    countBySev(report, "info"),
  );
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
  copy: ReturnType<typeof useUiText>["wiki"];
}

function LintResults({
  loading,
  error,
  report,
  onNavigate,
  onResolve,
  copy,
}: LintResultsProps) {
  if (loading && !report)
    return <div className="wk-loading">{copy.checkingWiki}</div>;
  if (error) return <div className="wk-error">{copy.articleError(error)}</div>;
  if (report && report.findings.length === 0) {
    return (
      <div className="wk-audit-empty" data-testid="wk-lint-empty">
        {copy.allClear}
      </div>
    );
  }
  if (!report) return null;
  return (
    <LintTable
      findings={report.findings}
      onNavigate={onNavigate}
      onResolve={onResolve}
      copy={copy}
    />
  );
}

function LintTable({
  findings,
  onNavigate,
  onResolve,
  copy,
}: {
  findings: LintFinding[];
  onNavigate: (path: string | null) => void;
  onResolve: (finding: LintFinding, idx: number) => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}) {
  return (
    <table className="wk-audit-table wk-lint-table">
      <thead>
        <tr>
          <th scope="col">{copy.priority}</th>
          <th scope="col">{copy.issue}</th>
          <th scope="col">{copy.page}</th>
          <th scope="col">{copy.whatsGoingOn}</th>
          <th scope="col">{copy.action}</th>
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
            copy={copy}
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
  copy,
}: {
  finding: LintFinding;
  idx: number;
  onNavigate: (path: string | null) => void;
  onResolve: (finding: LintFinding, idx: number) => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}) {
  const canResolve =
    finding.type === "contradictions" && finding.resolve_actions;
  return (
    <tr className={`wk-audit-row ${findingRowClass(finding.severity)}`}>
      <td className="wk-audit-when">
        <span
          className={`wk-lint-severity wk-lint-severity--${finding.severity}`}
          title={copy.findingTitle(severityLabel(finding.severity, copy))}
        >
          {severityLabel(finding.severity, copy)}
        </span>
      </td>
      <td className="wk-audit-msg">{humanType(finding.type, copy)}</td>
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
            {copy.resolve}
          </button>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </td>
    </tr>
  );
}

/** Translate the engineering finding type into plain operator language. */
function humanType(
  t: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  switch (t) {
    case "contradictions":
      return copy.findingTypes.contradictions;
    case "orphans":
      return copy.findingTypes.orphans;
    case "stale":
      return copy.findingTypes.stale;
    case "missing_crossrefs":
      return copy.findingTypes.missing_crossrefs;
    case "dedup_review":
      return copy.findingTypes.dedup_review;
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

function severityLabel(
  sev: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  switch (sev) {
    case "critical":
      return copy.severities.critical;
    case "warning":
      return copy.severities.warning;
    case "info":
      return copy.severities.info;
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
