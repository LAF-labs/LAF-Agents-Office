import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type BriefSummary,
  type EntityKind,
  fetchBriefs,
  requestBriefSynthesis,
  subscribeEntityEvents,
} from "../../api/entity";
import { useUiText } from "../../lib/uiText";

interface EntityBriefBarProps {
  kind: EntityKind;
  slug: string;
  /**
   * Called after a successful synthesis arrives over SSE so the parent can
   * refetch article body + sources. Optional so the bar still works on its
   * own in isolation.
   */
  onSynthesized?: () => void;
}

type BarState = "idle" | "synthesizing";

async function fetchBriefSummary(
  kind: EntityKind,
  slug: string,
): Promise<BriefSummary | null> {
  const rows = await fetchBriefs();
  return rows.find((row) => row.kind === kind && row.slug === slug) ?? null;
}

function briefErrorMessage(
  err: unknown,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  return err instanceof Error ? err.message : copy.briefLoadFailed;
}

export default function EntityBriefBar({
  kind,
  slug,
  onSynthesized,
}: EntityBriefBarProps) {
  const { wiki: copy } = useUiText();
  const [brief, setBrief] = useState<BriefSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<BarState>("idle");
  const [pendingOverride, setPendingOverride] = useState<number | null>(null);
  const pendingRef = useRef(0);

  const loadBrief = useCallback(async () => {
    try {
      const match = await fetchBriefSummary(kind, slug);
      setBrief(match);
      setPendingOverride(null);
      setError(null);
    } catch (err: unknown) {
      setError(briefErrorMessage(err, copy));
    } finally {
      setLoading(false);
    }
  }, [kind, slug, copy]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBriefSummary(kind, slug)
      .then((match) => {
        if (cancelled) return;
        setBrief(match);
        setPendingOverride(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(briefErrorMessage(err, copy));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, copy]);

  useEffect(() => {
    const unsubscribe = subscribeEntityEvents(
      kind,
      slug,
      () => {
        // New fact for this entity — bump pending without refetching.
        setPendingOverride((prev) => {
          const base = prev ?? pendingRef.current;
          return base + 1;
        });
      },
      () => {
        // Brief was synthesized — clear in-flight state, refetch status,
        // notify parent so article body + sources refresh.
        setState("idle");
        void loadBrief();
        if (onSynthesized) onSynthesized();
      },
    );
    return unsubscribe;
  }, [kind, slug, loadBrief, onSynthesized]);

  const handleRefresh = useCallback(async () => {
    setState("synthesizing");
    setError(null);
    try {
      await requestBriefSynthesis({ entity_kind: kind, entity_slug: slug });
      // Wait for SSE to flip state back to idle. If SSE never arrives the
      // button stays "Synthesizing…" — that is deliberate: a user who sees
      // the label hang will reload and see the fresh brief on next render.
    } catch (err: unknown) {
      setState("idle");
      setError(err instanceof Error ? err.message : copy.synthesisFailed);
    }
  }, [kind, slug, copy]);

  const pending = useMemo(() => {
    if (pendingOverride !== null) return pendingOverride;
    return brief?.pending_delta ?? 0;
  }, [pendingOverride, brief?.pending_delta]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  if (loading) return null;

  // If backend returned no row for this entity we still render — the brief
  // just hasn't been synthesized yet. Facts-on-file handles the empty case
  // for the body.
  const synthesizedTs = brief?.last_synthesized_ts ?? "";
  const relativeSynth = synthesizedTs
    ? formatRelativeTime(synthesizedTs, copy)
    : copy.never;
  const hasPending = pending > 0;
  const cls = hasPending
    ? "wk-entity-brief-bar wk-entity-brief-bar--pending"
    : "wk-entity-brief-bar wk-entity-brief-bar--clean";

  return (
    <EntityBriefStatus
      className={cls}
      hasPending={hasPending}
      pending={pending}
      relativeSynth={relativeSynth}
      state={state}
      error={error}
      onRefresh={handleRefresh}
      copy={copy}
    />
  );
}

interface EntityBriefStatusProps {
  className: string;
  hasPending: boolean;
  pending: number;
  relativeSynth: string;
  state: BarState;
  error: string | null;
  onRefresh: () => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function EntityBriefStatus({
  className,
  hasPending,
  pending,
  relativeSynth,
  state,
  error,
  onRefresh,
  copy,
}: EntityBriefStatusProps) {
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      data-testid="wk-entity-brief-bar"
    >
      <span className="wk-entity-brief-bar__label">
        {hasPending ? (
          <>{copy.newFactsSince(pending)}</>
        ) : (
          <>{copy.briefSynthesized(relativeSynth)}</>
        )}
      </span>
      {hasPending ? (
        <button
          type="button"
          className="wk-entity-brief-bar__action"
          onClick={onRefresh}
          disabled={state === "synthesizing"}
        >
          {state === "synthesizing" ? copy.synthesizing : copy.refreshBrief}
        </button>
      ) : null}
      {error ? (
        <span className="wk-entity-brief-bar__error">{error}</span>
      ) : null}
    </div>
  );
}

function formatRelativeTime(
  iso: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return copy.justNow;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return copy.justNow;
  const units = [
    { name: "minute", value: Math.floor(seconds / 60), max: 60 },
    { name: "hour", value: Math.floor(seconds / 3600), max: 24 },
    { name: "day", value: Math.floor(seconds / 86400), max: 30 },
    { name: "month", value: Math.floor(seconds / 2592000), max: 12 },
  ];
  const unit = units.find((candidate) => candidate.value < candidate.max);
  if (unit) return formatAgo(unit.value, unit.name, copy);
  return formatAgo(Math.floor(seconds / 31536000), "year", copy);
}

function formatAgo(
  value: number,
  unit: string,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  switch (unit) {
    case "minute":
      return copy.minutesAgo(value);
    case "hour":
      return copy.hoursAgo(value);
    case "day":
      return copy.daysAgo(value);
    case "month":
      return copy.monthsAgo(value);
    default:
      return copy.yearsAgo(value);
  }
}
