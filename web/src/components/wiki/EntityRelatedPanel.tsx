import { useEffect, useState } from "react";

import {
  type EntityKind,
  fetchEntityGraph,
  type GraphEdge,
  subscribeEntityEvents,
} from "../../api/entity";
import { useUiText } from "../../lib/uiText";

interface EntityRelatedPanelProps {
  kind: EntityKind;
  slug: string;
}

const PANEL_LIMIT = 5;

/**
 * EntityRelatedPanel — the v1 list of entities connected to (kind, slug) via
 * the cross-entity graph. Out-edges only: "this entity mentions → X". Lives
 * alongside FactsOnFile on wiki entity pages.
 *
 * The graph log is append-only and re-reads on every fact_recorded SSE event
 * for this entity (the refs are parsed server-side). No inbound-edge rendering
 * in v1 — that ships with the /people/X mentioned-in panel later.
 */
export default function EntityRelatedPanel({
  kind,
  slug,
}: EntityRelatedPanelProps) {
  const { wiki: copy } = useUiText();
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEntityGraph(kind, slug, "out")
      .then((rows) => {
        if (cancelled) return;
        setEdges(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : copy.relatedLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, copy]);

  useEffect(() => {
    // New facts on this entity can introduce new edges. Refetch the graph on
    // every fact_recorded to pick them up. Synthesis events do not change
    // the graph so we ignore them here.
    const unsubscribe = subscribeEntityEvents(
      kind,
      slug,
      () => {
        void fetchEntityGraph(kind, slug, "out")
          .then(setEdges)
          .catch(() => {
            // Keep the current list rather than blanking the panel on a
            // transient refetch failure.
          });
      },
      () => {},
    );
    return unsubscribe;
  }, [kind, slug]);

  const visible = edges.slice(0, PANEL_LIMIT);

  return (
    <aside
      className="wk-related-panel"
      aria-labelledby="wk-related-heading"
      data-testid="wk-related-panel"
    >
      <h2 id="wk-related-heading">{copy.related}</h2>
      {loading ? (
        <p className="wk-related-loading">{copy.loadingRelated}</p>
      ) : error ? (
        <p className="wk-related-error">{error}</p>
      ) : edges.length === 0 ? (
        <p className="wk-related-empty">{copy.relatedEmpty}</p>
      ) : (
        <ul className="wk-related-items">
          {visible.map((edge) => {
            const target = `${edge.to_kind}/${edge.to_slug}`;
            return (
              <li key={target} className="wk-related-item">
                <a
                  className="wk-related-link"
                  href={`#/wiki/team/${target}.md`}
                  data-wikilink="true"
                >
                  {target}
                </a>
                {edge.occurrence_count > 1 && (
                  <span
                    className="wk-related-count"
                    title={copy.occurrenceCount}
                  >
                    ×{edge.occurrence_count}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
