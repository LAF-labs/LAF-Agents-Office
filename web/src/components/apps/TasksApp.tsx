import { type FormEvent, useEffect, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProject,
  getOfficeTasks,
  getProjects,
  type Project,
  type Task,
} from "../../api/client";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { type Language, useAppStore } from "../../stores/app";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;
const HUMAN_SLUG = "human";

const STATUS_ORDER = [
  "in_progress",
  "open",
  "review",
  "pending",
  "blocked",
  "done",
  "canceled",
] as const;

type StatusGroup = (typeof STATUS_ORDER)[number];
type ProjectCreatorState = ReturnType<typeof useProjectCreator>;
type TranslationFn = (key: I18nKey) => string;
type ProjectLifecycle = "not_started" | "in_progress" | "done" | "waiting";
type ProjectTicketCounts = {
  done: number;
  inProgress: number;
  notStarted: number;
  total: number;
  waiting: number;
};

function normalizeStatus(raw: string): StatusGroup {
  const status = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "completed") return "done";
  if (status === "in_review") return "review";
  if (status === "cancelled") return "canceled";
  if ((STATUS_ORDER as readonly string[]).includes(status)) {
    return status as StatusGroup;
  }
  return "open";
}

function countLabel(
  count: number,
  singular: string,
  plural: string,
  koreanUnit: string,
  language: Language,
): string {
  if (language === "ko") return `${count} ${koreanUnit}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

function projectTicketCounts(tasks: Task[]): ProjectTicketCounts {
  const counts: ProjectTicketCounts = {
    done: 0,
    inProgress: 0,
    notStarted: 0,
    total: tasks.length,
    waiting: 0,
  };

  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    if (status === "done" || status === "canceled") counts.done += 1;
    else if (status === "blocked" || status === "pending" || task.blocked)
      counts.waiting += 1;
    else if (status === "in_progress" || status === "review")
      counts.inProgress += 1;
    else counts.notStarted += 1;
  }

  return counts;
}

function normalizeProjectLifecycle(
  status: string | undefined,
): ProjectLifecycle | null {
  const normalized = status
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (["not_started", "new", "open"].includes(normalized)) return "not_started";
  if (["in_progress", "active", "running"].includes(normalized))
    return "in_progress";
  if (["done", "complete", "completed", "closed"].includes(normalized))
    return "done";
  if (["waiting", "pending", "blocked", "paused"].includes(normalized))
    return "waiting";
  return null;
}

function projectLifecycle(
  project: Project,
  counts: ProjectTicketCounts,
): ProjectLifecycle {
  const explicit = normalizeProjectLifecycle(project.status);
  if (explicit) return explicit;
  if (counts.total === 0) return "not_started";
  if (counts.done === counts.total) return "done";
  if (counts.waiting > 0 && counts.inProgress === 0) return "waiting";
  if (counts.inProgress > 0 || counts.done > 0) return "in_progress";
  return "not_started";
}

function projectLifecycleClass(status: ProjectLifecycle): string {
  switch (status) {
    case "done":
      return "project-status-done";
    case "in_progress":
      return "project-status-progress";
    case "waiting":
      return "project-status-waiting";
    case "not_started":
      return "project-status-not-started";
  }
}

function projectLifecycleLabelKey(status: ProjectLifecycle): I18nKey {
  switch (status) {
    case "done":
      return "tasks.projectStatus.done";
    case "in_progress":
      return "tasks.projectStatus.inProgress";
    case "waiting":
      return "tasks.projectStatus.waiting";
    case "not_started":
      return "tasks.projectStatus.notStarted";
  }
}

function projectLoadMessage(
  isLoading: boolean,
  error: unknown,
  t: TranslationFn,
): string | null {
  if (isLoading) return t("tasks.loading");
  if (error) return t("tasks.loadError");
  return null;
}

function projectRowDOMId(projectId: string): string {
  return `project-row-${projectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function useProjectCreator(
  queryClient: QueryClient,
  onProjectCreated: (projectId: string) => void,
) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    setProjectError(null);
    try {
      const { project } = await createProject({
        created_by: HUMAN_SLUG,
        name,
      });
      setNewProjectName("");
      setIsCreatingProject(false);
      onProjectCreated(project.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create project";
      setProjectError(message);
    }
  }

  return {
    handleCreateProject,
    isCreatingProject,
    newProjectName,
    projectError,
    setIsCreatingProject,
    setNewProjectName,
    setProjectError,
  };
}

export function TasksApp() {
  const queryClient = useQueryClient();
  const projectFocusId = useAppStore((s) => s.projectFocusId);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const { language, t } = useI18n();
  const projectCreator = useProjectCreator(queryClient, setProjectFocusId);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 30_000,
  });

  const allTasksQuery = useQuery({
    queryKey: ["office-tasks", "project-list"],
    queryFn: () => getOfficeTasks({ includeDone: true }),
    enabled: projectsQuery.isSuccess,
    refetchInterval: TASK_REFETCH_MS,
  });

  const projectMessage = projectLoadMessage(
    projectsQuery.isLoading,
    projectsQuery.error,
    t,
  );

  if (projectMessage) {
    return <TaskWorkspaceState>{projectMessage}</TaskWorkspaceState>;
  }

  const projects = projectsQuery.data?.projects ?? [];
  const tasks = allTasksQuery.data?.tasks ?? [];

  const handleOpenProjectCreator = () => {
    projectCreator.setProjectError(null);
    projectCreator.setIsCreatingProject(true);
  };

  return (
    <div className="project-directory">
      <ProjectDirectoryToolbar
        isLoadingTasks={allTasksQuery.isLoading}
        language={language}
        projectCount={projects.length}
        projectCreator={projectCreator}
        t={t}
        taskCount={tasks.length}
        onCreateProject={handleOpenProjectCreator}
      />
      <ProjectDirectoryList
        focusedProjectId={projectFocusId}
        isStatsReady={Boolean(allTasksQuery.data)}
        language={language}
        projects={projects}
        tasks={tasks}
        t={t}
        onFocusProject={setProjectFocusId}
      />
    </div>
  );
}

function TaskWorkspaceState({ children }: { children: string }) {
  return <div className="task-empty-state">{children}</div>;
}

interface ProjectDirectoryToolbarProps {
  isLoadingTasks: boolean;
  language: Language;
  projectCount: number;
  projectCreator: ProjectCreatorState;
  t: TranslationFn;
  taskCount: number;
  onCreateProject: () => void;
}

function ProjectDirectoryToolbar({
  isLoadingTasks,
  language,
  projectCount,
  projectCreator,
  t,
  taskCount,
  onCreateProject,
}: ProjectDirectoryToolbarProps) {
  return (
    <div className="project-directory-toolbar">
      <div>
        <h3>{t("tasks.projectDirectory.title")}</h3>
        <span>
          {countLabel(
            projectCount,
            "project",
            "projects",
            "프로젝트",
            language,
          )}
          {" · "}
          {isLoadingTasks
            ? t("tasks.loadingTasks")
            : countLabel(taskCount, "ticket", "tickets", "티켓", language)}
        </span>
      </div>
      <button
        type="button"
        className="project-directory-add"
        onClick={onCreateProject}
        aria-label={t("tasks.newProject")}
        title={t("tasks.newProject")}
      >
        +
      </button>
      {projectCreator.isCreatingProject ? (
        <ProjectCreateForm projectCreator={projectCreator} t={t} />
      ) : null}
      {projectCreator.projectError ? (
        <div className="task-project-error">{projectCreator.projectError}</div>
      ) : null}
    </div>
  );
}

function ProjectCreateForm({
  projectCreator,
  t,
}: {
  projectCreator: ProjectCreatorState;
  t: TranslationFn;
}) {
  return (
    <form
      className="task-project-form"
      onSubmit={projectCreator.handleCreateProject}
    >
      <input
        type="text"
        value={projectCreator.newProjectName}
        onChange={(event) =>
          projectCreator.setNewProjectName(event.currentTarget.value)
        }
        placeholder={t("tasks.projectName")}
        aria-label={t("tasks.projectName")}
      />
      <button
        type="submit"
        disabled={projectCreator.newProjectName.trim() === ""}
      >
        {t("tasks.create")}
      </button>
    </form>
  );
}

interface ProjectDirectoryListProps {
  focusedProjectId: string | null;
  isStatsReady: boolean;
  language: Language;
  projects: Project[];
  tasks: Task[];
  t: TranslationFn;
  onFocusProject: (projectId: string) => void;
}

function ProjectDirectoryList({
  focusedProjectId,
  isStatsReady,
  language,
  projects,
  tasks,
  t,
  onFocusProject,
}: ProjectDirectoryListProps) {
  useEffect(() => {
    if (!focusedProjectId) return;
    document
      .getElementById(projectRowDOMId(focusedProjectId))
      ?.scrollIntoView({ block: "center" });
  }, [focusedProjectId]);

  if (projects.length === 0) {
    return (
      <div className="project-directory-empty">
        <strong>{t("tasks.noProjects")}</strong>
        <span>{t("tasks.projectListEmpty")}</span>
      </div>
    );
  }

  return (
    <section
      className="project-directory-list"
      aria-label={t("tasks.projectList")}
    >
      <div className="project-directory-row project-directory-head">
        <span>{t("tasks.projectTable.name")}</span>
        <span>{t("tasks.projectTable.status")}</span>
        <span>{t("tasks.projectTable.tickets")}</span>
      </div>
      {projects.map((project) => {
        const projectTasks = tasks.filter(
          (task) => task.project_id === project.id,
        );
        const counts = projectTicketCounts(projectTasks);
        const lifecycle = projectLifecycle(project, counts);
        return (
          <ProjectDirectoryRow
            key={project.id}
            counts={counts}
            id={projectRowDOMId(project.id)}
            isFocused={focusedProjectId === project.id}
            isStatsReady={isStatsReady}
            language={language}
            project={project}
            status={lifecycle}
            t={t}
            onFocus={() => onFocusProject(project.id)}
          />
        );
      })}
    </section>
  );
}

interface ProjectDirectoryRowProps {
  counts: ProjectTicketCounts;
  id: string;
  isFocused: boolean;
  isStatsReady: boolean;
  language: Language;
  project: Project;
  status: ProjectLifecycle;
  t: TranslationFn;
  onFocus: () => void;
}

function ProjectDirectoryRow({
  counts,
  id,
  isFocused,
  isStatsReady,
  language,
  project,
  status,
  t,
  onFocus,
}: ProjectDirectoryRowProps) {
  const countValue = (value: number) => (isStatsReady ? value : "...");
  return (
    <button
      type="button"
      id={id}
      className={`project-directory-row project-directory-item${
        isFocused ? " active" : ""
      }`}
      onClick={onFocus}
      aria-current={isFocused ? "true" : undefined}
    >
      <span className="project-directory-name">
        <strong>{project.name || project.id}</strong>
        <small>{project.id}</small>
      </span>
      <span className={`project-status-pill ${projectLifecycleClass(status)}`}>
        {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
      </span>
      <span className="project-ticket-counts">
        <span>
          <strong>{countValue(counts.notStarted)}</strong>{" "}
          {t("tasks.projectTickets.notStarted")}
        </span>
        <span>
          <strong>{countValue(counts.inProgress)}</strong>{" "}
          {t("tasks.projectTickets.inProgress")}
        </span>
        <span>
          <strong>{countValue(counts.waiting)}</strong>{" "}
          {t("tasks.projectTickets.waiting")}
        </span>
        <span>
          <strong>{countValue(counts.done)}</strong>{" "}
          {t("tasks.projectTickets.done")}
        </span>
        <span className="project-ticket-total">
          {isStatsReady
            ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
            : "..."}
        </span>
      </span>
    </button>
  );
}
