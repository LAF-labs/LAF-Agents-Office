import { useCallback, useEffect, useState } from "react";

import {
  type EntityKind,
  type Fact,
  fetchFacts,
  subscribeEntityEvents,
} from "../../api/entity";
import { formatAgentName } from "../../lib/agentName";
import { useUiText } from "../../lib/uiText";
import PixelAvatar from "./PixelAvatar";

interface FactsOnFileProps {
  kind: EntityKind;
  slug: string;
}

const INITIAL_LIMIT = 50;

export default function FactsOnFile({ kind, slug }: FactsOnFileProps) {
  const { wiki: copy } = useUiText();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFacts(kind, slug)
      .then((rows) => {
        if (cancelled) return;
        setFacts(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : copy.loadFactsFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, copy]);

  const handleFact = useCallback(
    (ev: { fact_id: string; recorded_by: string; timestamp: string }) => {
      setFacts((prev) => {
        // Skip if we already have this id (shouldn't happen, but the SSE
        // stream can replay on reconnect in theory).
        if (prev.some((f) => f.id === ev.fact_id)) return prev;
        // Prepend an optimistic row. Refetch in parallel so the real row
        // (with text + source_path) replaces this shortly.
        const optimistic: Fact = {
          id: ev.fact_id,
          kind,
          slug,
          text: "…",
          recorded_by: ev.recorded_by,
          created_at: ev.timestamp,
        };
        return [optimistic, ...prev];
      });
      // Refetch to resolve the optimistic row with full fact text. Fire and
      // forget — errors here are visible in the next render cycle.
      void fetchFacts(kind, slug)
        .then((rows) => setFacts(rows))
        .catch(() => {
          // Keep the optimistic row; surfacing a second error on top of the
          // initial fetch would flood the UI.
        });
    },
    [kind, slug],
  );

  useEffect(() => {
    const unsubscribe = subscribeEntityEvents(kind, slug, handleFact, () => {
      // Brief synthesis doesn't change the facts list itself, but refetch
      // anyway in case the synthesis raced with a batch of new facts.
      void fetchFacts(kind, slug)
        .then(setFacts)
        .catch(() => {});
    });
    return unsubscribe;
  }, [kind, slug, handleFact]);

  const visibleFacts = showAll ? facts : facts.slice(0, INITIAL_LIMIT);

  return (
    <section
      className="wk-facts-list"
      aria-labelledby="wk-facts-heading"
      data-testid="wk-facts-on-file"
    >
      <h2 id="wk-facts-heading">{copy.factsOnFile}</h2>
      <FactsBody
        loading={loading}
        error={error}
        facts={facts}
        visibleFacts={visibleFacts}
        showAll={showAll}
        onToggleShowAll={() => setShowAll((v) => !v)}
        copy={copy}
      />
    </section>
  );
}

interface FactsBodyProps {
  loading: boolean;
  error: string | null;
  facts: Fact[];
  visibleFacts: Fact[];
  showAll: boolean;
  onToggleShowAll: () => void;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function FactsBody({
  loading,
  error,
  facts,
  visibleFacts,
  showAll,
  onToggleShowAll,
  copy,
}: FactsBodyProps) {
  if (loading) return <p className="wk-facts-loading">{copy.loadingFacts}</p>;
  if (error) return <p className="wk-facts-error">{error}</p>;
  if (facts.length === 0) {
    return <p className="wk-facts-empty">{copy.noFacts}</p>;
  }
  return (
    <>
      <ol className="wk-facts-items">
        {visibleFacts.map((fact) => (
          <FactItem fact={fact} key={fact.id} copy={copy} />
        ))}
      </ol>
      {facts.length > INITIAL_LIMIT ? (
        <button
          type="button"
          className="wk-facts-showall"
          onClick={onToggleShowAll}
        >
          {showAll
            ? copy.showRecentOnly
            : copy.showAllMore(facts.length - INITIAL_LIMIT)}
        </button>
      ) : null}
    </>
  );
}

function FactItem({
  fact,
  copy,
}: {
  fact: Fact;
  copy: ReturnType<typeof useUiText>["wiki"];
}) {
  return (
    <li
      className="wk-facts-item"
      data-fact-type={fact.type ?? "observation"}
      data-superseded={isSuperseded(fact) ? "true" : undefined}
    >
      <PixelAvatar slug={fact.recorded_by} size={14} />
      <div className="wk-facts-body">
        <span className="wk-facts-text">{fact.text}</span>
        {fact.triplet ? <FactTriplet fact={fact} /> : null}
        <FactMeta fact={fact} copy={copy} />
      </div>
    </li>
  );
}

function FactTriplet({ fact }: { fact: Fact }) {
  return (
    <span className="wk-facts-triplet">
      <code>{fact.triplet?.subject}</code>
      {" — "}
      <code>{fact.triplet?.predicate}</code>
      {" → "}
      <code>{fact.triplet?.object}</code>
    </span>
  );
}

function FactMeta({
  fact,
  copy,
}: {
  fact: Fact;
  copy: ReturnType<typeof useUiText>["wiki"];
}) {
  const validity = formatValidity(fact, copy);
  const hasFactStats = Boolean(
    fact.type || typeof fact.confidence === "number",
  );
  return (
    <span className="wk-facts-meta">
      {fact.type ? <span className="wk-facts-type">{fact.type}</span> : null}
      {typeof fact.confidence === "number" ? (
        <>
          {fact.type ? " · " : null}
          <span className="wk-facts-confidence">
            {fact.confidence.toFixed(2)}
          </span>
        </>
      ) : null}
      {hasFactStats && " · "}
      {formatAgentName(fact.recorded_by)}
      {" · "}
      <time dateTime={fact.created_at}>{formatShortTs(fact.created_at)}</time>
      {validity ? (
        <>
          {" · "}
          <span className="wk-facts-validity">{validity}</span>
        </>
      ) : null}
      {fact.reinforced_at ? (
        <>
          {" · "}
          <span className="wk-facts-reinforced">
            {copy.reinforced(formatShortTs(fact.reinforced_at))}
          </span>
        </>
      ) : null}
      {isWikiSource(fact.source_path) ? (
        <FactSource path={fact.source_path} />
      ) : null}
      {fact.supersedes && fact.supersedes.length > 0 ? (
        <>
          {" · "}
          <span className="wk-facts-supersedes">
            {copy.supersedesPrior(fact.supersedes.length)}
          </span>
        </>
      ) : null}
    </span>
  );
}

function FactSource({ path }: { path: string }) {
  return (
    <>
      {" · "}
      <a
        className="wk-facts-source"
        href={`#/wiki/${path}`}
        data-wikilink="true"
      >
        {sourceLabel(path)}
      </a>
    </>
  );
}

/** Checks whether a source_path resolves to a wiki-renderable location.
 *  Schema §3 three-layer architecture: wiki/artifacts/ (Layer 1, raw),
 *  team/ (Layer 2, briefs), wiki/facts/ (Layer 2, fact log),
 *  wiki/insights/ (Layer 2, insights), wiki/playbooks/ (Layer 2, playbooks).
 *  agents/ is the legacy v1.2 per-agent notebook path and is retained for
 *  backwards compatibility with existing fact rows. */
function isWikiSource(path?: string): path is string {
  if (!path) return false;
  return (
    path.startsWith("wiki/artifacts/") ||
    path.startsWith("team/") ||
    path.startsWith("wiki/facts/") ||
    path.startsWith("wiki/insights/") ||
    path.startsWith("wiki/playbooks/") ||
    path.startsWith("agents/") // legacy v1.2 per-agent notebook path
  );
}

function sourceLabel(path: string): string {
  const base = path.replace(/\.md$/, "");
  const tail = base.split("/").slice(-2).join("/");
  return tail || base;
}

function formatShortTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

/** A fact is superseded when its temporal validity has ended.
 *  Schema §8.2 — valid_until being set means a newer fact has taken its place.
 *  A fact that HAS a supersedes list is the NEWER fact (it replaced others);
 *  the supersedes list alone does NOT make this fact superseded. */
function isSuperseded(f: Fact): boolean {
  return Boolean(f.valid_until);
}

function formatValidity(
  f: Fact,
  copy: ReturnType<typeof useUiText>["wiki"],
): string | null {
  if (!(f.valid_from || f.valid_until)) return null;
  const from = f.valid_from ? formatShortTs(f.valid_from) : null;
  const until = f.valid_until ? formatShortTs(f.valid_until) : null;
  if (from && until) return copy.validRange(from, until);
  if (until) return copy.validUntil(until);
  if (from) return copy.validFrom(from);
  return null;
}
