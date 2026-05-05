import { type ComponentType, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookStack,
  CheckCircle,
  Flash,
  NavArrowDown,
  NavArrowRight,
  Package,
  Page,
  Play,
  Settings,
} from "iconoir-react";

import { getProjects, type Project } from "../../api/client";
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
  studio: Play,
  wiki: BookStack,
  tasks: CheckCircle,
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
  projectFocusId: string | null;
  projects: Project[];
  setCurrentApp: (app: string | null) => void;
  setProjectFocusId: (projectId: string | null) => void;
  t: (key: I18nKey) => string;
}

function SidebarAppGroup({
  app,
  badge,
  currentApp,
  projectFocusId,
  projects,
  setCurrentApp,
  setProjectFocusId,
  t,
}: SidebarAppGroupProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const Icon = APP_ICONS[app.id];
  const isActive =
    app.id === "wiki"
      ? WIKI_SURFACE_APPS.has(currentApp ?? "")
      : currentApp === app.id;
  const appName = t(`app.${app.id}` as I18nKey);
  const showProjects = app.id === "tasks" && isActive;

  return (
    <div className="sidebar-app-group">
      <div className="sidebar-app-row">
        <Button
          type="button"
          className={`sidebar-item${isActive ? " active" : ""}`}
          variant="ghost"
          onClick={() => {
            if (app.id === "tasks") {
              setProjectFocusId(null);
              setProjectsExpanded(true);
            }
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
            <span className="sidebar-badge" title={`${badge} pending`}>
              {badge}
            </span>
          ) : null}
        </Button>
        {showProjects ? (
          <Button
            type="button"
            className="sidebar-project-toggle"
            size="icon"
            variant="ghost"
            aria-expanded={projectsExpanded}
            aria-label={
              projectsExpanded
                ? t("tasks.sidebar.collapseProjects")
                : t("tasks.sidebar.expandProjects")
            }
            title={
              projectsExpanded
                ? t("tasks.sidebar.collapseProjects")
                : t("tasks.sidebar.expandProjects")
            }
            onClick={() => setProjectsExpanded((value) => !value)}
          >
            {projectsExpanded ? (
              <NavArrowDown width={15} height={15} />
            ) : (
              <NavArrowRight width={15} height={15} />
            )}
          </Button>
        ) : null}
      </div>
      {showProjects && projectsExpanded ? (
        <SidebarProjectsList
          projectFocusId={projectFocusId}
          projects={projects}
          setCurrentApp={setCurrentApp}
          setProjectFocusId={setProjectFocusId}
          t={t}
        />
      ) : null}
    </div>
  );
}

function SidebarProjectsList({
  projectFocusId,
  projects,
  setCurrentApp,
  setProjectFocusId,
  t,
}: {
  projectFocusId: string | null;
  projects: Project[];
  setCurrentApp: (app: string | null) => void;
  setProjectFocusId: (projectId: string | null) => void;
  t: (key: I18nKey) => string;
}) {
  return (
    <nav className="sidebar-projects-list" aria-label={t("tasks.projectList")}>
      {projects.map((project) => (
        <Button
          type="button"
          key={project.id}
          className={`sidebar-project-link${
            projectFocusId === project.id ? " active" : ""
          }`}
          variant="ghost"
          onClick={() => {
            setProjectFocusId(project.id);
            setCurrentApp("tasks");
          }}
        >
          <span>{project.name || project.id}</span>
        </Button>
      ))}
    </nav>
  );
}

export function AppList() {
  const currentApp = useAppStore((s) => s.currentApp);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const projectFocusId = useAppStore((s) => s.projectFocusId);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const { t } = useI18n();

  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-badge"],
    queryFn: fetchReviews,
    refetchInterval: REVIEW_BADGE_REFETCH_MS,
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 30_000,
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
            projectFocusId={projectFocusId}
            projects={projectsData?.projects ?? []}
            setCurrentApp={setCurrentApp}
            setProjectFocusId={setProjectFocusId}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
