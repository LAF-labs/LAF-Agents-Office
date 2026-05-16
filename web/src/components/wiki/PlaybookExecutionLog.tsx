import { useCallback, useEffect, useState } from "react";

import {
  fetchPlaybookExecutions,
  fetchSynthesisStatus,
  type PlaybookExecution,
  type PlaybookSynthesisStatus,
  subscribePlaybookEvents,
  subscribePlaybookSynthesizedEvents,
  synthesizeNow,
} from "../../api/playbook";
import { formatAgentName } from "../../lib/agentName";
import { useUiText } from "../../lib/uiText";

interface PlaybookExecutionLogProps {
  slug: string;
}

const INITIAL_LIMIT = 10;

type SynthState = "idle" | "pending" | "success" | "error";

/**
 * Collapsible execution-log panel rendered on playbook article pages.
 * Newest-first, capped at INITIAL_LIMIT by default — the full log is
 * available in `team/playbooks/{slug}.executions.jsonl` for auditing.
 *
 * Also hosts the compounding-intelligence surface:
 *   - "Last synthesis" badge summarising archivist activity.
 *   - "Re-synthesize" button that triggers POST /playbook/synthesize.
 * The playbook article reloads automatically via the existing wiki:write
 * SSE event when synthesis commits; this component listens for
 * playbook:synthesized specifically to refresh its own status strip.
 */
export default function PlaybookExecutionLog({
  slug,
}: PlaybookExecutionLogProps) {
  const { wiki: copy } = useUiText();
  const [entries, setEntries] = useState<PlaybookExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<PlaybookSynthesisStatus | null>(null);
  const [synthState, setSynthState] = useState<SynthState>("idle");

  const load = useCallback(() => {
    void fetchPlaybookExecutions(slug).then((rows) => setEntries(rows));
  }, [slug]);

  const loadStatus = useCallback(() => {
    void fetchSynthesisStatus(slug).then((s) => setStatus(s));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPlaybookExecutions(slug), fetchSynthesisStatus(slug)])
      .then(([rows, s]) => {
        if (cancelled) return;
        setEntries(rows);
        setStatus(s);
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const unsubscribeExec = subscribePlaybookEvents(slug, () => {
      load();
      loadStatus();
    });
    const unsubscribeSynth = subscribePlaybookSynthesizedEvents(slug, () => {
      loadStatus();
      setSynthState((prev) => (prev === "pending" ? "success" : prev));
    });
    return () => {
      unsubscribeExec();
      unsubscribeSynth();
    };
  }, [slug, load, loadStatus]);

  const visible = showAll ? entries : entries.slice(0, INITIAL_LIMIT);

  const handleResynthesize = async () => {
    setSynthState("pending");
    const result = await synthesizeNow(slug);
    if (!result) {
      setSynthState("error");
      return;
    }
    // success transitions on the playbook:synthesized event; fall back to a
    // timer so the button doesn't get stuck if the SSE stream is dropped.
    window.setTimeout(() => {
      setSynthState((prev) => (prev === "pending" ? "success" : prev));
    }, 8000);
  };

  return (
    <section
      className="wk-playbook-executions"
      aria-labelledby="wk-playbook-executions-heading"
      data-testid="wk-playbook-executions"
    >
      <button
        type="button"
        className="wk-playbook-executions__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <h2 id="wk-playbook-executions-heading">
          {copy.executionLog}
          <span className="wk-playbook-executions__count">
            {" "}
            ({entries.length})
          </span>
        </h2>
        <span aria-hidden="true" className="wk-playbook-executions__chev">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded ? (
        <div className="wk-playbook-executions__body">
          <ExecutionEntries
            loading={loading}
            entries={entries}
            visible={visible}
            showAll={showAll}
            onToggleShowAll={() => setShowAll((v) => !v)}
            copy={copy}
          />
          <SynthesisFooter
            status={status}
            synthState={synthState}
            onResynthesize={handleResynthesize}
            copy={copy}
          />
        </div>
      ) : null}
    </section>
  );
}

interface ExecutionEntriesProps {
  loading: boolean;
  entries: PlaybookExecution[];
  visible: PlaybookExecution[];
  showAll: boolean;
  onToggleShowAll: () => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function ExecutionEntries({
  loading,
  entries,
  visible,
  showAll,
  onToggleShowAll,
  copy,
}: ExecutionEntriesProps) {
  if (loading) {
    return (
      <p className="wk-playbook-executions__loading">
        {copy.loadingExecutions}
      </p>
    );
  }
  if (entries.length === 0) {
    return <p className="wk-playbook-executions__empty">{copy.noExecutions}</p>;
  }
  return (
    <>
      <ol className="wk-playbook-executions__list">
        {visible.map((entry) => (
          <ExecutionEntry entry={entry} key={entry.id} />
        ))}
      </ol>
      {entries.length > INITIAL_LIMIT ? (
        <button
          type="button"
          className="wk-playbook-executions__more"
          onClick={onToggleShowAll}
        >
          {showAll
            ? copy.showRecentOnly
            : copy.showAllMore(entries.length - INITIAL_LIMIT)}
        </button>
      ) : null}
    </>
  );
}

function ExecutionEntry({ entry }: { entry: PlaybookExecution }) {
  return (
    <li
      className={`wk-playbook-execution wk-playbook-execution--${entry.outcome}`}
    >
      <span
        className={`wk-playbook-execution__pill wk-playbook-execution__pill--${entry.outcome}`}
      >
        {entry.outcome}
      </span>
      <div className="wk-playbook-execution__body">
        <p className="wk-playbook-execution__summary">{entry.summary}</p>
        {entry.notes ? (
          <p className="wk-playbook-execution__notes">{entry.notes}</p>
        ) : null}
        <span className="wk-playbook-execution__meta">
          {formatAgentName(entry.recorded_by)}
          {" · "}
          <time dateTime={entry.created_at}>
            {formatShortTs(entry.created_at)}
          </time>
        </span>
      </div>
    </li>
  );
}

interface SynthesisFooterProps {
  status: PlaybookSynthesisStatus | null;
  synthState: SynthState;
  onResynthesize: () => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function SynthesisFooter({
  status,
  synthState,
  onResynthesize,
  copy,
}: SynthesisFooterProps) {
  const lastLabel = status?.last_synthesized_ts
    ? copy.lastSynthesis(
        formatRelativeTs(status.last_synthesized_ts, copy),
        status.execution_count,
      )
    : copy.noSynthesis;
  const pendingLabel =
    status && status.executions_since_last_synthesis > 0
      ? copy.newExecutionsSince(status.executions_since_last_synthesis)
      : null;

  const buttonDisabled = synthState === "pending";
  let buttonLabel: string = copy.resynthesize;
  if (synthState === "pending") buttonLabel = copy.synthesizing;
  if (synthState === "success") buttonLabel = copy.synthesized;
  if (synthState === "error") buttonLabel = copy.retrySynthesis;

  return (
    <div
      className="wk-playbook-synthesis"
      data-testid="wk-playbook-synthesis"
      data-state={synthState}
    >
      <div className="wk-playbook-synthesis__status">
        <span className="wk-playbook-synthesis__badge">{lastLabel}</span>
        {pendingLabel ? (
          <span className="wk-playbook-synthesis__pending">{pendingLabel}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="wk-playbook-synthesis__button"
        onClick={onResynthesize}
        disabled={buttonDisabled}
        data-testid="wk-playbook-synthesis-button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function formatShortTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function formatRelativeTs(
  iso: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return copy.justNow;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return copy.justNow;
  if (mins < 60) return copy.minutesAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return copy.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 14) return copy.daysAgo(days);
  return d.toISOString().slice(0, 10);
}
