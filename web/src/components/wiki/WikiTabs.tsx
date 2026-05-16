import { useQuery } from "@tanstack/react-query";

import { fetchReviews } from "../../api/notebook";
import { useUiText } from "../../lib/uiText";
import { preloadWorkspaceSurface } from "../../lib/workspacePreload";
import Pam from "./Pam";

export type WikiTab = "wiki" | "notebooks" | "reviews";
const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const REVIEW_TAB_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

interface WikiTabsProps {
  current: WikiTab;
  onSelect: (tab: WikiTab) => void;
  /**
   * Pam sits inside the tab bar so her desk can rest on the bottom
   * divider line. `pamArticlePath` is the article she should act on;
   * pass `null` outside an article view (or outside the Wiki tab
   * entirely) and her menu falls back to a "Open an article…" empty
   * state.
   */
  pamArticlePath?: string | null;
  onPamActionDone?: () => void;
}

/**
 * Top tab bar for the unified Wiki app. Same substrate under the hood
 * (one git repo, markdown files) with three surfaces layered on top:
 *
 *   Wiki       canonical team reference
 *   Notebooks  per-agent working drafts (Caveat, DRAFT stamps, tan paper)
 *   Reviews    promotion queue (Kanban)
 *
 * Lives above the per-surface design systems so it reads as app chrome,
 * not as a wiki- or notebook-themed element.
 */
export default function WikiTabs({
  current,
  onSelect,
  pamArticlePath = null,
  onPamActionDone,
}: WikiTabsProps) {
  const { wiki: copy } = useUiText();
  const { data: reviews } = useQuery({
    queryKey: ["reviews-tab-badge"],
    queryFn: fetchReviews,
    refetchInterval: REVIEW_TAB_REFETCH_MS,
  });

  const pendingReviews = (reviews ?? []).filter(
    (r) =>
      r.state === "pending" ||
      r.state === "in-review" ||
      r.state === "changes-requested",
  ).length;

  const tabs: Array<{ id: WikiTab; label: string; badge?: number }> = [
    { id: "wiki", label: copy.tabs.wiki },
    { id: "notebooks", label: copy.tabs.notebooks },
    {
      id: "reviews",
      label: copy.tabs.reviews,
      badge: pendingReviews > 0 ? pendingReviews : undefined,
    },
  ];

  return (
    <nav className="wiki-tabs" aria-label={copy.tabAria}>
      {tabs.map((tab) => {
        const isActive = current === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            className={`wiki-tab${isActive ? " is-active" : ""}`}
            onFocus={() => preloadWorkspaceSurface(tab.id)}
            onMouseEnter={() => preloadWorkspaceSurface(tab.id)}
            onClick={() => onSelect(tab.id)}
          >
            <span className="wiki-tab-label">{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className="wiki-tab-badge"
                title={copy.pendingBadge(tab.badge)}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
      {/* Pam the Archivist rides inside the tab bar so her desk can sit
          exactly on the bottom divider line — see pam.css for the absolute
          positioning. */}
      <Pam articlePath={pamArticlePath} onActionDone={onPamActionDone} />
    </nav>
  );
}
