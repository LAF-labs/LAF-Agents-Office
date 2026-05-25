import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookStack,
  Flash,
  HomeSimple,
  Package,
  Page,
  Play,
  Settings,
} from "iconoir-react";

import { fetchReviews } from "../../api/notebook";
import { useOverflow } from "../../hooks/useOverflow";
import { SIDEBAR_APPS } from "../../lib/constants";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { preloadWorkspaceSurface } from "../../lib/workspacePreload";
import { useAppStore } from "../../stores/app";
import { Button } from "../ui/button";

// Notebooks and reviews render inside the Wiki app shell via tabs, so the
// 'Wiki' sidebar entry lights up for any of those three currentApp values.
const WIKI_SURFACE_APPS = new Set(["wiki", "notebooks", "reviews"]);
const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const REVIEW_BADGE_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

const APP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  home: HomeSimple,
  growth: Activity,
  studio: Play,
  wiki: BookStack,
  skills: Flash,
  activity: Package,
  receipts: Page,
  settings: Settings,
};

type SidebarApp = (typeof SIDEBAR_APPS)[number];

function badgeForApp(
  appId: string,
  pendingReviewsCount: number,
): number | null {
  if (appId === "wiki" && pendingReviewsCount > 0) return pendingReviewsCount;
  return null;
}

interface SidebarAppGroupProps {
  app: SidebarApp;
  badge: number | null;
  currentApp: string | null;
  setCurrentApp: (app: string | null) => void;
  t: (key: I18nKey) => string;
}

function SidebarAppGroup({
  app,
  badge,
  currentApp,
  setCurrentApp,
  t,
}: SidebarAppGroupProps) {
  const Icon = APP_ICONS[app.id];
  const isActive =
    app.id === "wiki"
      ? WIKI_SURFACE_APPS.has(currentApp ?? "")
      : currentApp === app.id;
  const appName = t(`app.${app.id}` as I18nKey);

  return (
    <div className="sidebar-app-group">
      <div className="sidebar-app-row">
        <Button
          type="button"
          className={`sidebar-item${isActive ? " active" : ""}`}
          variant="ghost"
          aria-label={appName}
          title={appName}
          onClick={() => {
            setCurrentApp(app.id);
          }}
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
            <span
              className="sidebar-badge"
              title={t("sidebar.pendingCount").replace(
                "{count}",
                String(badge),
              )}
            >
              {badge}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}

export function AppList() {
  const currentApp = useAppStore((s) => s.currentApp);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const { t } = useI18n();

  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-badge"],
    queryFn: fetchReviews,
    refetchInterval: REVIEW_BADGE_REFETCH_MS,
  });

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
        {SIDEBAR_APPS.filter((app) => app.id !== "settings").map((app) => (
          <SidebarAppGroup
            key={app.id}
            app={app}
            badge={badgeForApp(app.id, pendingReviewsCount)}
            currentApp={currentApp}
            setCurrentApp={setCurrentApp}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
