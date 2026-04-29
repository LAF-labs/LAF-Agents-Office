import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookStack,
  CheckCircle,
  ClipboardCheck,
  Flash,
  Package,
  Page,
  Play,
  Settings,
} from "iconoir-react";

import { getRequests } from "../../api/client";
import { fetchReviews } from "../../api/notebook";
import { useOverflow } from "../../hooks/useOverflow";
import { REQUEST_REFETCH_MS } from "../../hooks/useRequests";
import { SIDEBAR_APPS } from "../../lib/constants";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { preloadWorkspaceSurface } from "../../lib/workspacePreload";
import { useAppStore } from "../../stores/app";

// Notebooks and reviews render inside the Wiki app shell via tabs, so the
// 'Wiki' sidebar entry lights up for any of those three currentApp values.
const WIKI_SURFACE_APPS = new Set(["wiki", "notebooks", "reviews"]);
const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const REVIEW_BADGE_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

const APP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  studio: Play,
  wiki: BookStack,
  tasks: CheckCircle,
  requests: ClipboardCheck,
  skills: Flash,
  activity: Package,
  receipts: Page,
  settings: Settings,
};

export function AppList() {
  const currentApp = useAppStore((s) => s.currentApp);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const { t } = useI18n();

  const { data: requestsData } = useQuery({
    queryKey: ["requests-badge", currentChannel],
    queryFn: () => getRequests(currentChannel),
    refetchInterval: REQUEST_REFETCH_MS,
  });

  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-badge"],
    queryFn: fetchReviews,
    refetchInterval: REVIEW_BADGE_REFETCH_MS,
  });

  const pendingCount = (requestsData?.requests ?? []).filter(
    (r) => !r.status || r.status === "open" || r.status === "pending",
  ).length;

  const pendingReviewsCount = (reviewsData ?? []).filter(
    (r) =>
      r.state === "pending" ||
      r.state === "in-review" ||
      r.state === "changes-requested",
  ).length;

  const overflowRef = useOverflow<HTMLDivElement>();

  return (
    <div className="sidebar-scroll-wrap is-apps">
      <div className="sidebar-apps" ref={overflowRef}>
        {SIDEBAR_APPS.filter((app) => app.id !== "settings").map((app) => {
          let badge: number | null = null;
          if (app.id === "requests" && pendingCount > 0) badge = pendingCount;
          if (app.id === "wiki" && pendingReviewsCount > 0)
            badge = pendingReviewsCount;
          const Icon = APP_ICONS[app.id];
          const isActive =
            app.id === "wiki"
              ? WIKI_SURFACE_APPS.has(currentApp ?? "")
              : currentApp === app.id;
          const appName = t(`app.${app.id}` as I18nKey);
          return (
            <button
              type="button"
              key={app.id}
              className={`sidebar-item${isActive ? " active" : ""}`}
              onClick={() => setCurrentApp(app.id)}
              onFocus={() => preloadWorkspaceSurface(app.id)}
              onMouseEnter={() => preloadWorkspaceSurface(app.id)}
            >
              {Icon ? (
                <Icon className="sidebar-item-icon" />
              ) : (
                <span className="sidebar-item-emoji">{app.icon}</span>
              )}
              <span style={{ flex: 1 }}>{appName}</span>
              {badge !== null ? (
                <span className="sidebar-badge" title={`${badge} pending`}>
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
