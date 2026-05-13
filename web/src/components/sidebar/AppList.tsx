import { type ComponentType, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookStack,
  CheckCircle,
  Flash,
  HomeSimple,
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
import { type SkillsSection, useAppStore } from "../../stores/app";
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
  studio: Play,
  wiki: BookStack,
  tasks: CheckCircle,
  skills: Flash,
  activity: Package,
  receipts: Page,
  settings: Settings,
};

type SidebarApp = (typeof SIDEBAR_APPS)[number];

const SKILLS_NAV_ITEMS: Array<{ id: SkillsSection; label: string }> = [
  { id: "dashboard", label: "스킬 대시보드" },
  { id: "list", label: "Skill list" },
];

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
  skillsSection: SkillsSection;
  setCurrentApp: (app: string | null) => void;
  setProjectFocusId: (projectId: string | null) => void;
  setSkillsSection: (section: SkillsSection) => void;
  t: (key: I18nKey) => string;
}

function SidebarAppGroup({
  app,
  badge,
  currentApp,
  projectFocusId,
  projects,
  skillsSection,
  setCurrentApp,
  setProjectFocusId,
  setSkillsSection,
  t,
}: SidebarAppGroupProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const Icon = APP_ICONS[app.id];
  const isActive =
    app.id === "wiki"
      ? WIKI_SURFACE_APPS.has(currentApp ?? "")
      : currentApp === app.id;
  const appName = t(`app.${app.id}` as I18nKey);
  const showProjects = app.id === "tasks" && isActive;
  const showSkills = app.id === "skills" && isActive;
  const showExpandable = showProjects || showSkills;
  const expanded = showProjects ? projectsExpanded : skillsExpanded;
  const toggleLabel =
    app.id === "tasks"
      ? expanded
        ? t("tasks.sidebar.collapseProjects")
        : t("tasks.sidebar.expandProjects")
      : expanded
        ? "Collapse Skills"
        : "Expand Skills";

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
            if (app.id === "tasks") {
              setProjectFocusId(null);
              setProjectsExpanded(true);
            }
            if (app.id === "skills") {
              setSkillsSection("dashboard");
              setSkillsExpanded(true);
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
        {showExpandable ? (
          <Button
            type="button"
            className="sidebar-project-toggle sidebar-subnav-toggle"
            size="icon"
            variant="ghost"
            aria-expanded={expanded}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => {
              if (showProjects) setProjectsExpanded((value) => !value);
              if (showSkills) setSkillsExpanded((value) => !value);
            }}
          >
            {expanded ? (
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
      {showSkills && skillsExpanded ? (
        <SidebarSkillsList
          current={skillsSection}
          setCurrentApp={setCurrentApp}
          setSkillsSection={setSkillsSection}
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
          aria-label={project.name || project.id}
          title={project.name || project.id}
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

function SidebarSkillsList({
  current,
  setCurrentApp,
  setSkillsSection,
}: {
  current: SkillsSection;
  setCurrentApp: (app: string | null) => void;
  setSkillsSection: (section: SkillsSection) => void;
}) {
  return (
    <nav className="sidebar-projects-list" aria-label="Skills sections">
      {SKILLS_NAV_ITEMS.map((item) => (
        <Button
          type="button"
          key={item.id}
          className={`sidebar-project-link${
            current === item.id ? " active" : ""
          }`}
          variant="ghost"
          aria-label={item.label}
          title={item.label}
          onClick={() => {
            setSkillsSection(item.id);
            setCurrentApp("skills");
          }}
        >
          <span>{item.label}</span>
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
  const skillsSection = useAppStore((s) => s.skillsSection);
  const setSkillsSection = useAppStore((s) => s.setSkillsSection);
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
            skillsSection={skillsSection}
            setCurrentApp={setCurrentApp}
            setProjectFocusId={setProjectFocusId}
            setSkillsSection={setSkillsSection}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
