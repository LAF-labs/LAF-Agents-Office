import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProject,
  createTask,
  getOfficeTasks,
  getProjects,
  getThreadMessages,
  type Message,
  type Project,
  postMessage,
  postMessageAs,
  type Task,
} from "../../api/client";
import { type OfficeMember, useOfficeMembers } from "../../hooks/useMembers";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { type Language, useAppStore } from "../../stores/app";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;
const HUMAN_SLUG = "human";
const DEFAULT_AGENT = "ceo";
const ALL_AGENTS = "__all_agents__";

const STATUS_ORDER = [
  "in_progress",
  "open",
  "review",
  "pending",
  "blocked",
  "done",
  "canceled",
] as const;

const STATUS_LABEL_KEYS: Record<StatusGroup, I18nKey> = {
  in_progress: "tasks.status.inProgress",
  open: "tasks.status.open",
  review: "tasks.status.review",
  pending: "tasks.status.pending",
  blocked: "tasks.status.blocked",
  done: "tasks.status.done",
  canceled: "tasks.status.canceled",
};

type StatusGroup = (typeof STATUS_ORDER)[number];
type ProjectCreatorState = ReturnType<typeof useProjectCreator>;
type TicketCreatorState = ReturnType<typeof useTicketCreator>;
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

function taskUpdatedTime(task: Task): number {
  const timestamp = task.updated_at ?? task.created_at;
  if (!timestamp) return 0;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function taskStatusRank(status: StatusGroup): number {
  return STATUS_ORDER.indexOf(status);
}

function sortProjectTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusDelta =
      taskStatusRank(normalizeStatus(a.status)) -
      taskStatusRank(normalizeStatus(b.status));
    if (statusDelta !== 0) return statusDelta;
    return taskUpdatedTime(b) - taskUpdatedTime(a);
  });
}

function taskStatusClass(status: StatusGroup): string {
  if (status === "done") return "ticket-status-done";
  if (status === "blocked" || status === "pending")
    return "ticket-status-waiting";
  if (status === "review") return "ticket-status-review";
  if (status === "in_progress") return "ticket-status-progress";
  if (status === "canceled") return "ticket-status-canceled";
  return "ticket-status-open";
}

function agentSlugs(members: OfficeMember[], preferred?: string): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  const add = (raw?: string) => {
    const slug = raw?.trim();
    if (!slug || slug === "human" || slug === "you" || seen.has(slug)) return;
    seen.add(slug);
    slugs.push(slug);
  };

  add(preferred);
  for (const member of members) add(member.slug);
  add(DEFAULT_AGENT);
  return slugs;
}

function agentLabel(slug: string, members: OfficeMember[]): string {
  const member = members.find((candidate) => candidate.slug === slug);
  if (!member?.name || member.name.toLowerCase() === slug) return `@${slug}`;
  return `${member.name} @${slug}`;
}

function defaultTaskAgent(
  task: Task | null,
  project: Project | null,
  members: OfficeMember[],
): string {
  const owner = task?.owner?.trim();
  const preferred =
    owner && owner !== "human" && owner !== "you"
      ? owner
      : project?.lead_agent || DEFAULT_AGENT;
  return agentSlugs(members, preferred)[0] ?? DEFAULT_AGENT;
}

function defaultProjectAgent(
  project: Project | null,
  members: OfficeMember[],
): string {
  return agentSlugs(members, project?.lead_agent || DEFAULT_AGENT)[0] ?? "";
}

function taskOwnerLabel(task: Task, members: OfficeMember[], t: TranslationFn) {
  return task.owner ? agentLabel(task.owner, members) : t("tasks.unassigned");
}

function taskChannel(task: Task, project: Project): string {
  return task.channel || project.channel || "general";
}

function isHumanSlug(slug: string): boolean {
  return slug === "human" || slug === "you";
}

function assignmentAck(t: TranslationFn): string {
  return t("tasks.assignmentAck");
}

function chatTargetSlugs(
  targetAgent: string,
  members: OfficeMember[],
  defaultAgent: string,
): string[] {
  if (targetAgent === ALL_AGENTS) return agentSlugs(members, defaultAgent);
  return targetAgent ? [targetAgent] : [];
}

async function postTicketAssignmentAck(
  task: Task,
  project: Project,
  owner: string,
  t: TranslationFn,
) {
  if (!owner || isHumanSlug(owner)) return;
  try {
    await postMessageAs(
      owner,
      assignmentAck(t),
      taskChannel(task, project),
      task.thread_id || task.id,
    );
  } catch {
    // Ticket creation should not fail if the lightweight ack cannot post.
  }
}

function messageAuthorLabel(
  message: Message,
  members: OfficeMember[],
  t: TranslationFn,
): string {
  if (message.from === "you" || message.from === "human") return t("tasks.you");
  return agentLabel(message.from, members);
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

function useTicketCreator(
  queryClient: QueryClient,
  project: Project | null,
  members: OfficeMember[],
  t: TranslationFn,
  onTicketCreated: (ticketId: string) => void,
) {
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDetails, setTicketDetails] = useState("");
  const [ticketOwner, setTicketOwner] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    setTicketTitle("");
    setTicketDetails("");
    setTicketOwner(defaultProjectAgent(project, members));
    setTicketError(null);
    setIsCreatingTicket(false);
  }, [project, members]);

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const title = ticketTitle.trim();
    if (!title) return;
    const owner = ticketOwner.trim() || defaultProjectAgent(project, members);
    setTicketError(null);
    try {
      const { task } = await createTask({
        channel: project.channel || "general",
        created_by: HUMAN_SLUG,
        details: ticketDetails.trim() || undefined,
        owner,
        project_id: project.id,
        title,
      });
      const channel = taskChannel(task, project);
      const threadId = task.thread_id || task.id;
      await postTicketAssignmentAck(task, project, owner, t);
      setTicketTitle("");
      setTicketDetails("");
      setIsCreatingTicket(false);
      onTicketCreated(task.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", channel] }),
        queryClient.invalidateQueries({
          queryKey: ["thread-messages", channel, threadId],
        }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create ticket";
      setTicketError(message);
    }
  }

  return {
    handleCreateTicket,
    isCreatingTicket,
    setIsCreatingTicket,
    setTicketDetails,
    setTicketError,
    setTicketOwner,
    setTicketTitle,
    ticketDetails,
    ticketError,
    ticketOwner,
    ticketTitle,
  };
}

export function TasksApp() {
  const queryClient = useQueryClient();
  const projectFocusId = useAppStore((s) => s.projectFocusId);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const { language, t } = useI18n();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const projectCreator = useProjectCreator(queryClient, setProjectFocusId);
  const membersQuery = useOfficeMembers();
  const members = membersQuery.data ?? [];

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

  const projects = projectsQuery.data?.projects ?? [];
  const tasks = allTasksQuery.data?.tasks ?? [];
  const selectedProject = projectFocusId
    ? (projects.find((project) => project.id === projectFocusId) ?? null)
    : null;
  const selectedProjectTasks = selectedProject
    ? tasks.filter((task) => task.project_id === selectedProject.id)
    : [];
  const selectedTask =
    selectedProjectTasks.find((task) => task.id === selectedTaskId) ?? null;
  const ticketCreator = useTicketCreator(
    queryClient,
    selectedProject,
    members,
    t,
    setSelectedTaskId,
  );

  const projectMessage = projectLoadMessage(
    projectsQuery.isLoading,
    projectsQuery.error,
    t,
  );

  if (projectMessage) {
    return <TaskWorkspaceState>{projectMessage}</TaskWorkspaceState>;
  }

  const handleOpenProjectCreator = () => {
    projectCreator.setProjectError(null);
    projectCreator.setIsCreatingProject(true);
  };

  if (selectedProject) {
    return (
      <ProjectDetailView
        isStatsReady={Boolean(allTasksQuery.data)}
        language={language}
        members={members}
        project={selectedProject}
        queryClient={queryClient}
        selectedTask={selectedTask}
        selectedTaskId={selectedTaskId}
        tasks={selectedProjectTasks}
        ticketCreator={ticketCreator}
        t={t}
        onBack={() => setProjectFocusId(null)}
        onCloseTask={() => setSelectedTaskId(null)}
        onSelectTask={setSelectedTaskId}
      />
    );
  }

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

interface ProjectDetailViewProps {
  isStatsReady: boolean;
  language: Language;
  members: OfficeMember[];
  project: Project;
  queryClient: QueryClient;
  selectedTask: Task | null;
  selectedTaskId: string | null;
  tasks: Task[];
  ticketCreator: TicketCreatorState;
  t: TranslationFn;
  onBack: () => void;
  onCloseTask: () => void;
  onSelectTask: (taskId: string) => void;
}

function ProjectDetailView({
  isStatsReady,
  language,
  members,
  project,
  queryClient,
  selectedTask,
  selectedTaskId,
  tasks,
  ticketCreator,
  t,
  onBack,
  onCloseTask,
  onSelectTask,
}: ProjectDetailViewProps) {
  const sortedTasks = useMemo(() => sortProjectTasks(tasks), [tasks]);
  const counts = projectTicketCounts(tasks);
  const lifecycle = projectLifecycle(project, counts);

  return (
    <div
      className={`project-detail-surface${
        selectedTask ? " has-ticket-panel" : ""
      }`}
    >
      <ProjectDetailHeader
        counts={counts}
        isStatsReady={isStatsReady}
        language={language}
        project={project}
        status={lifecycle}
        t={t}
        onBack={onBack}
      />
      <ProjectTicketToolbar
        language={language}
        members={members}
        project={project}
        ticketCreator={ticketCreator}
        t={t}
        ticketCount={tasks.length}
      />
      <ProjectTicketList
        members={members}
        selectedTaskId={selectedTaskId}
        tasks={sortedTasks}
        t={t}
        onSelectTask={onSelectTask}
      />
      {selectedTask ? (
        <TicketSidePanel
          key={selectedTask.id}
          members={members}
          project={project}
          queryClient={queryClient}
          task={selectedTask}
          t={t}
          onClose={onCloseTask}
        />
      ) : null}
    </div>
  );
}

function ProjectDetailHeader({
  counts,
  isStatsReady,
  language,
  project,
  status,
  t,
  onBack,
}: {
  counts: ProjectTicketCounts;
  isStatsReady: boolean;
  language: Language;
  project: Project;
  status: ProjectLifecycle;
  t: TranslationFn;
  onBack: () => void;
}) {
  return (
    <header className="project-detail-header">
      <button type="button" className="project-back-button" onClick={onBack}>
        {t("tasks.backToProjects")}
      </button>
      <div className="project-detail-title">
        <h3>{project.name || project.id}</h3>
        <span>{project.id}</span>
      </div>
      <span className={`project-status-pill ${projectLifecycleClass(status)}`}>
        {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
      </span>
      <span className="project-detail-total">
        {isStatsReady
          ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
          : t("tasks.loadingTasks")}
      </span>
    </header>
  );
}

function ProjectTicketToolbar({
  language,
  members,
  project,
  ticketCreator,
  t,
  ticketCount,
}: {
  language: Language;
  members: OfficeMember[];
  project: Project;
  ticketCreator: TicketCreatorState;
  t: TranslationFn;
  ticketCount: number;
}) {
  return (
    <section className="project-ticket-toolbar">
      <div>
        <h4>{t("tasks.tickets")}</h4>
        <span>
          {countLabel(ticketCount, "ticket", "tickets", "티켓", language)}
        </span>
      </div>
      <button
        type="button"
        className="project-directory-add"
        onClick={() => {
          ticketCreator.setTicketError(null);
          ticketCreator.setIsCreatingTicket(true);
        }}
        aria-label={t("tasks.newTicket")}
        title={t("tasks.newTicket")}
      >
        +
      </button>
      {ticketCreator.isCreatingTicket ? (
        <TicketCreateForm
          members={members}
          project={project}
          ticketCreator={ticketCreator}
          t={t}
        />
      ) : null}
      {ticketCreator.ticketError ? (
        <div className="task-project-error">{ticketCreator.ticketError}</div>
      ) : null}
    </section>
  );
}

function TicketCreateForm({
  members,
  project,
  ticketCreator,
  t,
}: {
  members: OfficeMember[];
  project: Project;
  ticketCreator: TicketCreatorState;
  t: TranslationFn;
}) {
  return (
    <form
      className="ticket-create-form"
      onSubmit={ticketCreator.handleCreateTicket}
    >
      <input
        type="text"
        value={ticketCreator.ticketTitle}
        onChange={(event) =>
          ticketCreator.setTicketTitle(event.currentTarget.value)
        }
        placeholder={t("tasks.ticketTitle")}
        aria-label={t("tasks.ticketTitle")}
      />
      <AgentSelect
        agent={ticketCreator.ticketOwner}
        label={t("tasks.detail.owner")}
        members={members}
        preferred={project.lead_agent}
        onChange={ticketCreator.setTicketOwner}
      />
      <textarea
        value={ticketCreator.ticketDetails}
        onChange={(event) =>
          ticketCreator.setTicketDetails(event.currentTarget.value)
        }
        placeholder={t("tasks.ticketDetails")}
        aria-label={t("tasks.ticketDetails")}
        rows={3}
      />
      <div className="ticket-create-actions">
        <button
          type="submit"
          disabled={ticketCreator.ticketTitle.trim() === ""}
        >
          {t("tasks.createTicket")}
        </button>
        <button
          type="button"
          onClick={() => ticketCreator.setIsCreatingTicket(false)}
        >
          {t("tasks.cancel")}
        </button>
      </div>
    </form>
  );
}

function ProjectTicketList({
  members,
  selectedTaskId,
  tasks,
  t,
  onSelectTask,
}: {
  members: OfficeMember[];
  selectedTaskId: string | null;
  tasks: Task[];
  t: TranslationFn;
  onSelectTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="project-directory-empty">
        <strong>{t("tasks.noTickets")}</strong>
        <span>{t("tasks.noTicketsDesc")}</span>
      </div>
    );
  }

  return (
    <section className="ticket-list" aria-label={t("tasks.tickets")}>
      <div className="ticket-row ticket-head">
        <span>{t("tasks.ticket")}</span>
        <span>{t("tasks.status")}</span>
        <span>{t("tasks.detail.owner")}</span>
      </div>
      {tasks.map((task) => (
        <TicketRow
          isSelected={selectedTaskId === task.id}
          key={task.id}
          members={members}
          task={task}
          t={t}
          onSelect={() => onSelectTask(task.id)}
        />
      ))}
    </section>
  );
}

function TicketRow({
  isSelected,
  members,
  task,
  t,
  onSelect,
}: {
  isSelected: boolean;
  members: OfficeMember[];
  task: Task;
  t: TranslationFn;
  onSelect: () => void;
}) {
  const status = normalizeStatus(task.status);
  const detail = task.details || task.description;
  return (
    <button
      type="button"
      className={`ticket-row ticket-item${isSelected ? " active" : ""}`}
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
    >
      <span className="ticket-title-cell">
        <strong>{task.title || t("tasks.untitled")}</strong>
        <small>{task.id}</small>
        {detail ? <em>{detail}</em> : null}
      </span>
      <span className={`ticket-status-pill ${taskStatusClass(status)}`}>
        {t(STATUS_LABEL_KEYS[status])}
      </span>
      <span className="ticket-owner-cell">
        {taskOwnerLabel(task, members, t)}
      </span>
    </button>
  );
}

function TicketSidePanel({
  members,
  project,
  queryClient,
  task,
  t,
  onClose,
}: {
  members: OfficeMember[];
  project: Project;
  queryClient: QueryClient;
  task: Task;
  t: TranslationFn;
  onClose: () => void;
}) {
  const defaultAgent = defaultTaskAgent(task, project, members);
  const [targetAgent, setTargetAgent] = useState(defaultAgent);
  const [instruction, setInstruction] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const status = normalizeStatus(task.status);
  const detail = task.details || task.description || t("tasks.noTicketDetails");
  const channel = taskChannel(task, project);
  const threadId = task.thread_id || task.id;
  const threadMessagesQuery = useQuery({
    queryKey: ["thread-messages", channel, threadId],
    queryFn: () => getThreadMessages(channel, threadId),
    enabled: Boolean(threadId),
    refetchInterval: TASK_REFETCH_MS,
  });
  const threadMessages = threadMessagesQuery.data?.messages ?? [];

  useEffect(() => {
    setTargetAgent(defaultAgent);
    setInstruction("");
    setSendError(null);
    setSent(false);
  }, [defaultAgent]);

  async function handleSendInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = instruction.trim();
    if (!(text && targetAgent) || isSending) return;
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      const targets = chatTargetSlugs(targetAgent, members, defaultAgent);
      const mentions = targets.map((slug) => `@${slug}`).join(" ");
      const message = mentions ? `${mentions}\n${text}` : text;
      await postMessage(message, channel, threadId, targets);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", channel] }),
        queryClient.invalidateQueries({
          queryKey: ["thread-messages", channel, threadId],
        }),
      ]);
      setInstruction("");
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("tasks.chatFailed"));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <aside className="ticket-side-panel" aria-label={t("tasks.ticketDetails")}>
      <header className="ticket-panel-header">
        <div>
          <span>{task.id}</span>
          <h4>{task.title || t("tasks.untitled")}</h4>
        </div>
        <button type="button" onClick={onClose} aria-label={t("tasks.close")}>
          x
        </button>
      </header>
      <dl className="ticket-panel-meta">
        <div>
          <dt>{t("tasks.status")}</dt>
          <dd>
            <span className={`ticket-status-pill ${taskStatusClass(status)}`}>
              {t(STATUS_LABEL_KEYS[status])}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t("tasks.detail.owner")}</dt>
          <dd>{taskOwnerLabel(task, members, t)}</dd>
        </div>
      </dl>
      <section className="ticket-panel-section">
        <h5>{t("tasks.ticketDetails")}</h5>
        <p>{detail}</p>
      </section>
      <form className="ticket-chat" onSubmit={handleSendInstruction}>
        <div className="ticket-chat-head">
          <h5>{t("tasks.agentInstruction")}</h5>
          <AgentSelect
            agent={targetAgent}
            allLabel={t("tasks.allAgents")}
            includeAll={true}
            label={t("tasks.agentTarget")}
            members={members}
            preferred={defaultAgent}
            onChange={setTargetAgent}
          />
        </div>
        <TicketChatFeed
          isLoading={threadMessagesQuery.isLoading}
          members={members}
          messages={threadMessages}
          t={t}
        />
        <textarea
          value={instruction}
          onChange={(event) => {
            setInstruction(event.currentTarget.value);
            setSent(false);
          }}
          placeholder={t("tasks.agentInstructionPlaceholder")}
          aria-label={t("tasks.agentInstruction")}
          rows={8}
        />
        <button type="submit" disabled={!instruction.trim() || isSending}>
          {isSending ? t("tasks.sending") : t("tasks.sendInstruction")}
        </button>
        {sent ? (
          <span className="ticket-chat-ok">{t("tasks.sent")}</span>
        ) : null}
        {sendError ? (
          <span className="task-project-error">{sendError}</span>
        ) : null}
      </form>
    </aside>
  );
}

function TicketChatFeed({
  isLoading,
  members,
  messages,
  t,
}: {
  isLoading: boolean;
  members: OfficeMember[];
  messages: Message[];
  t: TranslationFn;
}) {
  if (isLoading) {
    return <div className="ticket-chat-empty">{t("tasks.loadingChat")}</div>;
  }

  const visibleMessages = messages.filter(
    (message) => !message.content?.startsWith("[STATUS]"),
  );

  if (visibleMessages.length === 0) {
    return <div className="ticket-chat-empty">{t("tasks.noTicketChat")}</div>;
  }

  return (
    <div className="ticket-chat-feed" aria-live="polite">
      {visibleMessages.map((message) => {
        const isHuman = message.from === "you" || message.from === "human";
        return (
          <article
            className={`ticket-chat-message${isHuman ? " human" : ""}`}
            key={message.id}
          >
            <strong>{messageAuthorLabel(message, members, t)}</strong>
            <p>{message.content}</p>
          </article>
        );
      })}
    </div>
  );
}

function AgentSelect({
  agent,
  allLabel,
  includeAll = false,
  label,
  members,
  preferred,
  onChange,
}: {
  agent: string;
  allLabel?: string;
  includeAll?: boolean;
  label: string;
  members: OfficeMember[];
  preferred?: string;
  onChange: (agent: string) => void;
}) {
  const preferredAgent = agent === ALL_AGENTS ? preferred : agent || preferred;
  const options = agentSlugs(members, preferredAgent || DEFAULT_AGENT);
  return (
    <select
      className="agent-select"
      value={agent || options[0] || ""}
      onChange={(event) => onChange(event.currentTarget.value)}
      aria-label={label}
    >
      {includeAll && allLabel ? (
        <option value={ALL_AGENTS}>{allLabel}</option>
      ) : null}
      {options.map((slug) => (
        <option key={slug} value={slug}>
          {agentLabel(slug, members)}
        </option>
      ))}
    </select>
  );
}
