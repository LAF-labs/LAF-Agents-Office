import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type ActionRecord,
  createProject,
  createTask,
  getActions,
  getOfficeTasks,
  getProjects,
  type Project,
  post,
  type Task,
  updateProject,
} from "../../api/client";
import { formatRelativeTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import type { Language } from "../../stores/app";
import { useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";
import { TaskDetailModal } from "./TaskDetailModal";

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
type TaskMove = (task: Task, toStatus: StatusGroup) => Promise<void>;
type ProjectCreatorState = ReturnType<typeof useProjectCreator>;
type ProjectGitHubConnectorState = ReturnType<typeof useProjectGitHubConnector>;
type ProjectTaskCreatorState = ReturnType<typeof useProjectTaskCreator>;
type TasksQueryData = { tasks: Task[] };
type TranslationFn = (key: I18nKey) => string;

const DND_MIME = "application/x-laf-office-task-id";
const HUMAN_SLUG = "human";
const HIDDEN_EMPTY_COLUMNS = new Set<StatusGroup>([
  "pending",
  "blocked",
  "canceled",
]);

const COLUMN_LABEL_KEYS: Record<StatusGroup, I18nKey> = {
  in_progress: "tasks.status.inProgress",
  open: "tasks.status.open",
  review: "tasks.status.review",
  pending: "tasks.status.pending",
  blocked: "tasks.status.blocked",
  done: "tasks.status.done",
  canceled: "tasks.status.canceled",
};

function normalizeStatus(raw: string): StatusGroup {
  const s = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "completed") return "done";
  if (s === "in_review") return "review";
  if (s === "cancelled") return "canceled";
  if ((STATUS_ORDER as readonly string[]).includes(s)) return s as StatusGroup;
  return "open";
}

function statusBadgeClass(status: StatusGroup): string {
  if (status === "done") return "badge badge-green";
  if (status === "in_progress" || status === "review")
    return "badge badge-accent";
  if (status === "blocked") return "badge badge-yellow";
  if (status === "canceled") return "badge badge-muted";
  return "badge badge-accent";
}

function taskRequiresDeliveryReceipt(task: Task): boolean {
  return Boolean(
    task.project_id?.trim() &&
      task.execution_mode?.trim() === "local_worktree" &&
      task.worktree_branch?.trim(),
  );
}

function taskDeliveryBadge(
  task: Task,
  status: StatusGroup,
): { className: string; labelKey: I18nKey } | null {
  if (task.delivery_url?.trim()) {
    return { className: "badge badge-green", labelKey: "tasks.deliveryReady" };
  }
  if (status === "review" && taskRequiresDeliveryReceipt(task)) {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryNeeded",
    };
  }
  return null;
}

function projectLoadMessage(
  isLoading: boolean,
  error: unknown,
  t: TranslationFn,
): string | null {
  if (isLoading) {
    return t("tasks.loading");
  }
  if (error) {
    return t("tasks.loadError");
  }
  return null;
}

function TaskWorkspaceState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function selectedTaskForModal(
  selectedTaskId: string | null,
  tasksById: Map<string, Task>,
  selectedTaskSnapshot: Task | null,
): Task | null {
  if (!selectedTaskId) return null;
  return (
    tasksById.get(selectedTaskId) ??
    (selectedTaskSnapshot?.id === selectedTaskId ? selectedTaskSnapshot : null)
  );
}

function groupTasks(tasks: Task[]): Record<StatusGroup, Task[]> {
  const groups: Record<StatusGroup, Task[]> = {
    in_progress: [],
    open: [],
    review: [],
    pending: [],
    blocked: [],
    done: [],
    canceled: [],
  };
  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    groups[status].push(task);
  }
  return groups;
}

function selectedProjectLabel(
  selectedProjectId: string,
  projectNames: Map<string, string>,
  language: Language,
): string {
  if (language === "ko") {
    if (selectedProjectId === "") return "프로젝트 워크스페이스를 여세요.";
    if (selectedProjectId === "all")
      return "모든 프로젝트의 활성 작업을 봅니다.";
    return `${projectNames.get(selectedProjectId) ?? selectedProjectId} 프로젝트에 집중합니다.`;
  }
  if (selectedProjectId === "") return "Open a project workspace.";
  if (selectedProjectId === "all") return "All active lanes across projects.";
  return `Focused project: ${projectNames.get(selectedProjectId) ?? selectedProjectId}`;
}

function findSelectedProject(
  projects: Project[],
  selectedProjectId: string,
): Project | null {
  if (selectedProjectId === "" || selectedProjectId === "all") return null;
  return projects.find((project) => project.id === selectedProjectId) ?? null;
}

function countActiveTasks(tasks: Task[]): number {
  return tasks.filter((task) => {
    const status = normalizeStatus(task.status);
    return status !== "done" && status !== "canceled";
  }).length;
}

function countAgentOwnedTasks(tasks: Task[]): number {
  return tasks.filter((task) => {
    const status = normalizeStatus(task.status);
    const owner = task.owner?.trim().toLowerCase();
    return Boolean(
      status !== "done" &&
        status !== "canceled" &&
        owner &&
        owner !== "human" &&
        owner !== "you",
    );
  }).length;
}

function countLabel(
  count: number,
  singular: string,
  plural: string,
  koreanNoun: string,
  language: Language,
): string {
  if (language === "ko") return `${count} ${koreanNoun}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

function projectWorkspaceName(project: Project, language: Language): string {
  const name = project.name || project.id;
  return language === "ko" ? `${name} 워크스페이스` : `${name} workspace`;
}

function actionTime(action: ActionRecord): number {
  if (!action.created_at) return 0;
  const time = Date.parse(action.created_at);
  return Number.isNaN(time) ? 0 : time;
}

function projectActivityEvents(
  actions: ActionRecord[],
  projectID: string,
  tasks: Task[],
): ActionRecord[] {
  const taskIDs = new Set(tasks.map((task) => task.id).filter(Boolean));
  return actions
    .filter((action) => {
      const relatedID = action.related_id?.trim();
      if (!relatedID) return false;
      return relatedID === projectID || taskIDs.has(relatedID);
    })
    .sort((a, b) => actionTime(b) - actionTime(a))
    .slice(0, 8);
}

function humanizeActionKind(kind?: string): string {
  if (!kind) return "Activity";
  const label = kind.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function activityKindLabel(kind: string | undefined, language: Language) {
  if (language === "ko") {
    switch (kind) {
      case "project_created":
        return "프로젝트 생성";
      case "project_updated":
        return "프로젝트 변경";
      case "task_created":
        return "작업 생성";
      case "task_updated":
        return "작업 변경";
      default:
        return "활동";
    }
  }
  switch (kind) {
    case "project_created":
      return "Project created";
    case "project_updated":
      return "Project updated";
    case "task_created":
      return "Task created";
    case "task_updated":
      return "Task updated";
    default:
      return humanizeActionKind(kind);
  }
}

function activitySummary(action: ActionRecord, language: Language): string {
  return action.summary?.trim() || activityKindLabel(action.kind, language);
}

function activityMeta(action: ActionRecord, language: Language): string {
  const parts = [activityKindLabel(action.kind, language)];
  const actor = action.actor?.trim();
  if (actor) parts.push(`@${actor}`);
  if (action.created_at) parts.push(formatRelativeTime(action.created_at));
  return parts.join(" / ");
}

function shouldHideTaskColumn(
  status: StatusGroup,
  column: Task[],
  isDragging: boolean,
): boolean {
  return !isDragging && column.length === 0 && HIDDEN_EMPTY_COLUMNS.has(status);
}

/**
 * Map a target column (StatusGroup) to the backend action payload.
 * Returns null when the transition has no corresponding action (e.g. "pending").
 */
function buildMoveBody(
  task: Task,
  toStatus: StatusGroup,
): Record<string, string> | null {
  const base: Record<string, string> = {
    id: task.id,
    channel: task.channel || "general",
    created_by: HUMAN_SLUG,
  };
  switch (toStatus) {
    case "in_progress":
      return { ...base, action: "claim", owner: HUMAN_SLUG };
    case "open":
      return { ...base, action: "release" };
    case "review":
      return { ...base, action: "review" };
    case "done":
      return { ...base, action: "complete" };
    case "blocked":
      return { ...base, action: "block" };
    case "canceled":
      return { ...base, action: "cancel" };
    case "pending":
      // No direct "pending" action in the broker — punted.
      return null;
  }
}

function useTaskMove() {
  const queryClient = useQueryClient();

  return useCallback(
    async (task: Task, toStatus: StatusGroup) => {
      const fromStatus = normalizeStatus(task.status);
      if (fromStatus === toStatus) return;

      const body = buildMoveBody(task, toStatus);
      if (!body) return;

      try {
        await post("/tasks", body);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Move failed";
        showNotice(message, "error");
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["actions"] }),
          queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
        ]);
      }
    },
    [queryClient],
  );
}

function useProjectCreator(
  queryClient: QueryClient,
  onProjectCreated: (projectId: string) => void,
) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectGitHubRepoURL, setNewProjectGitHubRepoURL] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    setProjectError(null);
    try {
      const { project } = await createProject({
        name,
        github_repo_url: newProjectGitHubRepoURL.trim() || undefined,
        created_by: HUMAN_SLUG,
      });
      setNewProjectName("");
      setNewProjectGitHubRepoURL("");
      setIsCreatingProject(false);
      onProjectCreated(project.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actions"] }),
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
    newProjectGitHubRepoURL,
    newProjectName,
    projectError,
    setIsCreatingProject,
    setNewProjectGitHubRepoURL,
    setNewProjectName,
    setProjectError,
  };
}

function buildProjectGitHubUpdate(
  project: Project,
  githubRepoURL: string,
): Parameters<typeof updateProject>[0] {
  const body: Parameters<typeof updateProject>[0] = {
    id: project.id,
    name: project.name,
    github_repo_url: githubRepoURL,
    created_by: HUMAN_SLUG,
  };
  if (project.description !== undefined) body.description = project.description;
  if (project.channel !== undefined) body.channel = project.channel;
  if (project.status !== undefined) body.status = project.status;
  return body;
}

function useProjectGitHubConnector(queryClient: QueryClient) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [repoURL, setRepoURL] = useState("");
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [githubError, setGitHubError] = useState<string | null>(null);

  function begin(project: Project) {
    setEditingProjectId(project.id);
    setRepoURL(project.github_repo_url?.trim() ?? "");
    setGitHubError(null);
  }

  function cancel() {
    setEditingProjectId(null);
    setRepoURL("");
    setGitHubError(null);
  }

  async function refreshProjects() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["actions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);
  }

  async function save(project: Project, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRepoURL = repoURL.trim();
    if (!nextRepoURL) {
      setGitHubError("Enter a GitHub repo URL.");
      return;
    }
    setSavingProjectId(project.id);
    setGitHubError(null);
    try {
      await updateProject(buildProjectGitHubUpdate(project, nextRepoURL));
      setEditingProjectId(null);
      setRepoURL("");
      await refreshProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not connect GitHub repo";
      setGitHubError(message);
    } finally {
      setSavingProjectId(null);
    }
  }

  async function disconnect(project: Project) {
    setSavingProjectId(project.id);
    setGitHubError(null);
    try {
      await updateProject(buildProjectGitHubUpdate(project, ""));
      setEditingProjectId(null);
      setRepoURL("");
      await refreshProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not disconnect GitHub repo";
      setGitHubError(message);
    } finally {
      setSavingProjectId(null);
    }
  }

  return {
    begin,
    cancel,
    disconnect,
    editingProjectId,
    githubError,
    isSaving: (projectId: string) => savingProjectId === projectId,
    repoURL,
    save,
    setRepoURL,
  };
}

function buildProjectTaskRequest(project: Project, request: string) {
  const repoURL = project.github_repo_url?.trim();
  return {
    title: request,
    details: request,
    project_id: project.id,
    channel: project.channel || "general",
    owner: repoURL ? "eng" : "ceo",
    task_type: repoURL ? "feature" : "research",
    execution_mode: repoURL ? "local_worktree" : "office",
    created_by: HUMAN_SLUG,
  };
}

function upsertTaskData(data: TasksQueryData | undefined, task: Task) {
  if (!data) return data;
  const tasks = data.tasks ?? [];
  const existingIndex = tasks.findIndex(
    (candidate) => candidate.id === task.id,
  );
  if (existingIndex >= 0) {
    const next = [...tasks];
    next[existingIndex] = { ...next[existingIndex], ...task };
    return { ...data, tasks: next };
  }
  return { ...data, tasks: [task, ...tasks] };
}

function seedCreatedTask(
  queryClient: QueryClient,
  projectID: string,
  task: Task,
) {
  queryClient.setQueryData<TasksQueryData>(
    ["office-tasks", projectID],
    (data) => upsertTaskData(data, task),
  );
  queryClient.setQueryData<TasksQueryData>(["office-tasks", "all"], (data) =>
    upsertTaskData(data, task),
  );
}

function useProjectTaskCreator(
  queryClient: QueryClient,
  onTaskCreated?: (task: Task) => void,
) {
  const [requestText, setRequestText] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  async function handleCreateTask(
    project: Project,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const request = requestText.trim();
    if (!request) return;
    setTaskError(null);
    setIsSubmittingTask(true);
    try {
      const { task } = await createTask(
        buildProjectTaskRequest(project, request),
      );
      seedCreatedTask(queryClient, project.id, task);
      setRequestText("");
      onTaskCreated?.(task);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actions"] }),
        queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create task";
      setTaskError(message);
    } finally {
      setIsSubmittingTask(false);
    }
  }

  return {
    handleCreateTask,
    isSubmittingTask,
    requestText,
    setRequestText,
    taskError,
  };
}

function useTaskBoardDrag(tasksById: Map<string, Task>, moveTask: TaskMove) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragoverStatus, setDragoverStatus] = useState<StatusGroup | null>(
    null,
  );

  const handleDragStart =
    (taskId: string) => (event: DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DND_MIME, taskId);
      event.dataTransfer.setData("text/plain", taskId);
      setDraggingId(taskId);
    };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragoverStatus(null);
  };

  const handleColumnDragOver =
    (status: StatusGroup) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragoverStatus !== status) setDragoverStatus(status);
    };

  const handleColumnDragLeave =
    (status: StatusGroup) => (event: DragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null))
        return;
      if (dragoverStatus === status) setDragoverStatus(null);
    };

  const handleColumnDrop =
    (status: StatusGroup) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const taskId =
        event.dataTransfer.getData(DND_MIME) ||
        event.dataTransfer.getData("text/plain");
      setDraggingId(null);
      setDragoverStatus(null);
      if (!taskId) return;
      const task = tasksById.get(taskId);
      if (!task) return;
      void moveTask(task, status);
    };

  return {
    draggingId,
    dragoverStatus,
    handleColumnDragLeave,
    handleColumnDragOver,
    handleColumnDrop,
    handleDragEnd,
    handleDragStart,
    isDragging: draggingId !== null,
  };
}

export function TasksApp() {
  const queryClient = useQueryClient();
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const { language, t } = useI18n();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<Task | null>(
    null,
  );
  const projectCreator = useProjectCreator(queryClient, setSelectedProjectId);
  const githubConnector = useProjectGitHubConnector(queryClient);
  const taskCreator = useProjectTaskCreator(queryClient, (task) => {
    setSelectedTaskSnapshot(task);
    setSelectedTaskId(task.id);
  });
  const selectedProjectFilter =
    selectedProjectId && selectedProjectId !== "all"
      ? selectedProjectId
      : undefined;

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 30_000,
  });

  const projects = projectsQuery.data?.projects ?? [];
  useEffect(() => {
    if (selectedProjectId === "" && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const shouldLoadTasks =
    projectsQuery.isSuccess &&
    (projects.length === 0 || selectedProjectId !== "");

  const { data, isLoading, error } = useQuery({
    queryKey: ["office-tasks", selectedProjectFilter ?? "all"],
    queryFn: () =>
      getOfficeTasks({
        includeDone: true,
        projectId: selectedProjectFilter,
      }),
    enabled: shouldLoadTasks,
    refetchInterval: 10_000,
  });

  const actionsQuery = useQuery({
    queryKey: ["actions"],
    queryFn: () => getActions(),
    enabled: Boolean(selectedProjectFilter),
    refetchInterval: 15_000,
  });

  const moveTask = useTaskMove();
  const tasks = data?.tasks ?? [];
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const selectedProject = findSelectedProject(projects, selectedProjectId);
  const projectActivities = selectedProject
    ? projectActivityEvents(
        actionsQuery.data?.actions ?? [],
        selectedProject.id,
        tasks,
      )
    : [];
  const grouped = groupTasks(tasks);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const boardDrag = useTaskBoardDrag(tasksById, moveTask);
  const selectedTask = selectedTaskForModal(
    selectedTaskId,
    tasksById,
    selectedTaskSnapshot,
  );
  const isTaskLoading = shouldLoadTasks && isLoading;
  const projectMessage = projectLoadMessage(
    projectsQuery.isLoading,
    projectsQuery.error,
    t,
  );

  if (projectMessage) {
    return <TaskWorkspaceState>{projectMessage}</TaskWorkspaceState>;
  }

  const handleOpenProjectWiki = () => {
    if (!selectedProject) return;
    setWikiPath(`projects/${selectedProject.id}`);
    setCurrentApp("wiki");
  };
  const handleOpenProjectCreator = () => {
    projectCreator.setProjectError(null);
    projectCreator.setIsCreatingProject(true);
  };

  const taskWorkArea = (
    <TaskWorkArea
      error={error}
      isTaskLoading={isTaskLoading}
      selectedProject={selectedProject}
      tasks={tasks}
      t={t}
    >
      <TaskBoard
        grouped={grouped}
        isDragging={boardDrag.isDragging}
        dragoverStatus={boardDrag.dragoverStatus}
        draggingId={boardDrag.draggingId}
        projectNames={projectNames}
        t={t}
        onColumnDragOver={boardDrag.handleColumnDragOver}
        onColumnDragLeave={boardDrag.handleColumnDragLeave}
        onColumnDrop={boardDrag.handleColumnDrop}
        onTaskDragStart={boardDrag.handleDragStart}
        onTaskDragEnd={boardDrag.handleDragEnd}
        onOpenTask={setSelectedTaskId}
      />
    </TaskWorkArea>
  );

  return (
    <>
      <ProjectToolbar
        projectCreator={projectCreator}
        projectNames={projectNames}
        projects={projects}
        selectedProjectId={selectedProjectId}
        language={language}
        t={t}
        onSelectProject={setSelectedProjectId}
      />

      {selectedProject ? (
        <>
          <ProjectWorkspaceOverview
            project={selectedProject}
            projectCount={projects.length}
            githubConnector={githubConnector}
            isLoadingTasks={isTaskLoading}
            language={language}
            tasks={tasks}
            t={t}
            onCreateProject={handleOpenProjectCreator}
            onOpenWiki={handleOpenProjectWiki}
          />
          <ProjectWorkRequest
            project={selectedProject}
            taskCreator={taskCreator}
            t={t}
          />
          {taskWorkArea}
          <ProjectActivityLog
            activities={projectActivities}
            isLoading={actionsQuery.isLoading}
            language={language}
            project={selectedProject}
            t={t}
          />
        </>
      ) : (
        <>
          <ProjectWorkspaceOverview
            project={selectedProject}
            projectCount={projects.length}
            githubConnector={githubConnector}
            isLoadingTasks={isTaskLoading}
            language={language}
            tasks={tasks}
            t={t}
            onCreateProject={handleOpenProjectCreator}
            onOpenWiki={handleOpenProjectWiki}
          />
          {taskWorkArea}
        </>
      )}
      {selectedTask ? (
        <TaskDetailModal
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => {
            setSelectedTaskId(null);
            setSelectedTaskSnapshot(null);
          }}
        />
      ) : null}
    </>
  );
}

interface ProjectToolbarProps {
  language: Language;
  projectCreator: ProjectCreatorState;
  projectNames: Map<string, string>;
  projects: Project[];
  selectedProjectId: string;
  t: TranslationFn;
  onSelectProject: (projectId: string) => void;
}

function ProjectToolbar({
  language,
  projectCreator,
  projectNames,
  projects,
  selectedProjectId,
  t,
  onSelectProject,
}: ProjectToolbarProps) {
  const toggleProjectForm = () => {
    projectCreator.setProjectError(null);
    projectCreator.setIsCreatingProject((current) => !current);
  };

  return (
    <div
      style={{
        padding: "16px 20px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="task-heading-row">
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>
            {t("tasks.workspace.title")}
          </h3>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginTop: 4,
            }}
          >
            {selectedProjectLabel(selectedProjectId, projectNames, language)}
          </div>
        </div>
        <button
          type="button"
          className="task-project-new"
          onClick={toggleProjectForm}
          aria-label={t("tasks.newProject")}
          title={t("tasks.newProject")}
        >
          +
        </button>
      </div>

      <ProjectTabs
        projects={projects}
        selectedProjectId={selectedProjectId || "all"}
        t={t}
        onSelect={onSelectProject}
      />
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
      <input
        type="text"
        value={projectCreator.newProjectGitHubRepoURL}
        onChange={(event) =>
          projectCreator.setNewProjectGitHubRepoURL(event.currentTarget.value)
        }
        placeholder={t("tasks.githubRepoUrlOptional")}
        aria-label={t("tasks.githubRepoUrl")}
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

interface ProjectActivityLogProps {
  activities: ActionRecord[];
  isLoading: boolean;
  language: Language;
  project: Project | null;
  t: TranslationFn;
}

function ProjectActivityLog({
  activities,
  isLoading,
  language,
  project,
  t,
}: ProjectActivityLogProps) {
  if (!project) return null;

  return (
    <section className="task-activity-log" aria-label={t("tasks.activityLog")}>
      <div className="task-activity-log-inner">
        <div className="task-activity-log-head">
          <h4>{t("tasks.activityLog")}</h4>
          <span>
            {isLoading
              ? t("tasks.activityLoading")
              : countLabel(
                  activities.length,
                  "event",
                  "events",
                  "활동",
                  language,
                )}
          </span>
        </div>
        {activities.length === 0 ? (
          <p className="task-activity-empty">
            {isLoading ? t("tasks.activityLoading") : t("tasks.activityEmpty")}
          </p>
        ) : (
          <ol className="task-activity-list">
            {activities.map((activity) => (
              <li
                className="task-activity-item"
                key={
                  activity.id ??
                  `${activity.kind}-${activity.related_id}-${activity.created_at}`
                }
              >
                <span className="task-activity-dot" aria-hidden="true" />
                <div>
                  <strong>{activitySummary(activity, language)}</strong>
                  <span>{activityMeta(activity, language)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

interface TaskWorkAreaProps {
  children: ReactNode;
  error: unknown;
  isTaskLoading: boolean;
  selectedProject: Project | null;
  tasks: Task[];
  t: TranslationFn;
}

function TaskWorkArea({
  children,
  error,
  isTaskLoading,
  selectedProject,
  tasks,
  t,
}: TaskWorkAreaProps) {
  if (error) {
    return (
      <div className="task-empty-state">{t("tasks.loadProjectTasksError")}</div>
    );
  }
  if (isTaskLoading) {
    return (
      <div className="task-empty-state">{t("tasks.loadingProjectTasks")}</div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="task-empty-state">
        {selectedProject ? t("tasks.emptyProject") : t("tasks.emptyNoProject")}
      </div>
    );
  }
  return children;
}

interface ProjectWorkspaceOverviewProps {
  project: Project | null;
  projectCount: number;
  githubConnector: ProjectGitHubConnectorState;
  isLoadingTasks: boolean;
  language: Language;
  tasks: Task[];
  t: TranslationFn;
  onCreateProject: () => void;
  onOpenWiki: () => void;
}

function ProjectWorkspaceOverview({
  project,
  projectCount,
  githubConnector,
  isLoadingTasks,
  language,
  tasks,
  t,
  onCreateProject,
  onOpenWiki,
}: ProjectWorkspaceOverviewProps) {
  if (!project) {
    return (
      <section
        className="task-workspace-overview"
        aria-label={t("tasks.overview.label")}
      >
        <article className="task-workspace-card task-workspace-card-wide">
          <span className="task-workspace-kicker">{t("app.tasks")}</span>
          <strong>
            {projectCount === 0
              ? t("tasks.firstProject")
              : countLabel(
                  projectCount,
                  "project",
                  "projects",
                  "프로젝트",
                  language,
                )}
          </strong>
          <span>{t("tasks.openProjectWorkspace")}</span>
          <button type="button" onClick={onCreateProject}>
            {t("tasks.newProjectCta")}
          </button>
        </article>
      </section>
    );
  }

  const activeTaskCount = countActiveTasks(tasks);
  const agentOwnedTaskCount = countAgentOwnedTasks(tasks);
  const repoURL = project.github_repo_url?.trim();

  return (
    <section
      className="task-workspace-strip"
      aria-label={t("tasks.overview.label")}
    >
      <div className="task-workspace-strip-main">
        <span className="task-workspace-kicker">{t("tasks.project")}</span>
        <strong>{projectWorkspaceName(project, language)}</strong>
        <span>{t("tasks.projectSummary")}</span>
      </div>
      <button
        type="button"
        className="task-workspace-strip-item task-workspace-strip-button"
        aria-label={t("tasks.openProjectWiki")}
        title={t("tasks.openProjectWiki")}
        onClick={onOpenWiki}
      >
        <span className="task-workspace-kicker">{t("tasks.wikiContext")}</span>
        <strong>{t("tasks.projectWiki")}</strong>
        <span>{t("tasks.wikiContextShort")}</span>
      </button>
      <div className="task-workspace-strip-item">
        <span className="task-workspace-kicker">{t("tasks.taskQueue")}</span>
        <strong>
          {isLoadingTasks
            ? t("tasks.loadingTasks")
            : countLabel(
                activeTaskCount,
                "active task",
                "active tasks",
                "활성 작업",
                language,
              )}
        </strong>
        <span>{t("tasks.taskQueueShort")}</span>
      </div>
      <div className="task-workspace-strip-item">
        <span className="task-workspace-kicker">{t("tasks.agentWork")}</span>
        <strong>
          {isLoadingTasks
            ? t("tasks.loadingAssignments")
            : countLabel(
                agentOwnedTaskCount,
                "agent-owned task",
                "agent-owned tasks",
                "에이전트 담당 작업",
                language,
              )}
        </strong>
        <span>{t("tasks.agentWorkShort")}</span>
      </div>
      <ProjectGitHubStripItem
        connector={githubConnector}
        t={t}
        project={project}
        repoURL={repoURL}
      />
    </section>
  );
}

interface ProjectGitHubStripItemProps {
  connector: ProjectGitHubConnectorState;
  project: Project;
  repoURL?: string;
  t: TranslationFn;
}

function ProjectGitHubStripItem({
  connector,
  project,
  repoURL,
  t,
}: ProjectGitHubStripItemProps) {
  const isEditing = connector.editingProjectId === project.id;
  const isSaving = connector.isSaving(project.id);

  return (
    <div className="task-workspace-strip-item task-workspace-strip-github">
      <span className="task-workspace-kicker">GitHub</span>
      <strong>
        {repoURL ? t("tasks.repoConnected") : t("tasks.repoNotConnected")}
      </strong>
      <span>
        {repoURL
          ? t("tasks.repoConnectedDesc")
          : t("tasks.repoNotConnectedDesc")}
      </span>
      {isEditing ? (
        <ProjectGitHubEditForm
          connector={connector}
          isSaving={isSaving}
          project={project}
          t={t}
        />
      ) : (
        <ProjectGitHubActions
          connector={connector}
          isSaving={isSaving}
          project={project}
          repoURL={repoURL}
          t={t}
        />
      )}
    </div>
  );
}

interface ProjectGitHubChildProps {
  connector: ProjectGitHubConnectorState;
  isSaving: boolean;
  project: Project;
  t: TranslationFn;
}

function ProjectGitHubEditForm({
  connector,
  isSaving,
  project,
  t,
}: ProjectGitHubChildProps) {
  return (
    <form
      className="task-github-form"
      onSubmit={(event) => connector.save(project, event)}
    >
      <input
        type="text"
        value={connector.repoURL}
        onChange={(event) => connector.setRepoURL(event.currentTarget.value)}
        placeholder="https://github.com/org/repo"
        aria-label={t("tasks.githubRepoUrl")}
      />
      <div className="task-github-actions">
        <button
          type="submit"
          disabled={isSaving || connector.repoURL.trim() === ""}
        >
          {isSaving ? t("tasks.saving") : t("tasks.saveGithubRepo")}
        </button>
        <button type="button" onClick={connector.cancel}>
          {t("tasks.cancel")}
        </button>
      </div>
      {connector.githubError ? (
        <span className="task-github-error">{connector.githubError}</span>
      ) : null}
    </form>
  );
}

function ProjectGitHubActions({
  connector,
  isSaving,
  project,
  repoURL,
  t,
}: ProjectGitHubChildProps & { repoURL?: string }) {
  return (
    <div className="task-github-actions">
      {repoURL ? (
        <a href={repoURL} target="_blank" rel="noreferrer">
          {t("tasks.openGithubRepo")}
        </a>
      ) : null}
      <button type="button" onClick={() => connector.begin(project)}>
        {repoURL ? t("tasks.changeGithubRepo") : t("tasks.connectGithubRepo")}
      </button>
      {repoURL ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void connector.disconnect(project)}
        >
          {isSaving ? t("tasks.saving") : t("tasks.disconnect")}
        </button>
      ) : null}
      {connector.githubError ? (
        <span className="task-github-error">{connector.githubError}</span>
      ) : null}
    </div>
  );
}

interface ProjectWorkRequestProps {
  project: Project | null;
  taskCreator: ProjectTaskCreatorState;
  t: TranslationFn;
}

function ProjectWorkRequest({
  project,
  taskCreator,
  t,
}: ProjectWorkRequestProps) {
  if (!project) return null;

  return (
    <section
      className="task-request-panel"
      aria-label={t("tasks.requestComposer")}
    >
      <div className="task-request-panel-head">
        <div>
          <h4>{t("tasks.firstTask")}</h4>
          <p>
            {project.github_repo_url?.trim()
              ? t("tasks.requestModeCoding")
              : t("tasks.requestModePlanning")}
          </p>
        </div>
      </div>
      <form onSubmit={(event) => taskCreator.handleCreateTask(project, event)}>
        <textarea
          value={taskCreator.requestText}
          onChange={(event) =>
            taskCreator.setRequestText(event.currentTarget.value)
          }
          placeholder={t("tasks.requestPlaceholder")}
          aria-label={t("tasks.workRequest")}
          rows={2}
        />
        <button
          type="submit"
          disabled={
            taskCreator.isSubmittingTask ||
            taskCreator.requestText.trim() === ""
          }
        >
          {taskCreator.isSubmittingTask
            ? t("tasks.creating")
            : t("tasks.createTask")}
        </button>
      </form>
      {taskCreator.taskError ? (
        <div className="task-project-error">{taskCreator.taskError}</div>
      ) : null}
    </section>
  );
}

interface TaskBoardProps {
  grouped: Record<StatusGroup, Task[]>;
  isDragging: boolean;
  dragoverStatus: StatusGroup | null;
  draggingId: string | null;
  projectNames: Map<string, string>;
  t: TranslationFn;
  onColumnDragOver: (
    status: StatusGroup,
  ) => (event: DragEvent<HTMLElement>) => void;
  onColumnDragLeave: (
    status: StatusGroup,
  ) => (event: DragEvent<HTMLElement>) => void;
  onColumnDrop: (
    status: StatusGroup,
  ) => (event: DragEvent<HTMLElement>) => void;
  onTaskDragStart: (
    taskId: string,
  ) => (event: DragEvent<HTMLButtonElement>) => void;
  onTaskDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
  onOpenTask: (taskId: string) => void;
}

function TaskBoard({
  grouped,
  isDragging,
  dragoverStatus,
  draggingId,
  projectNames,
  t,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  onTaskDragStart,
  onTaskDragEnd,
  onOpenTask,
}: TaskBoardProps) {
  return (
    <div className="task-board">
      {STATUS_ORDER.map((status) => {
        const column = grouped[status];
        if (shouldHideTaskColumn(status, column, isDragging)) return null;
        const columnClass = `task-column${dragoverStatus === status ? " dragover" : ""}`;

        return (
          <section
            className={columnClass}
            key={status}
            onDragOver={onColumnDragOver(status)}
            onDragLeave={onColumnDragLeave(status)}
            onDrop={onColumnDrop(status)}
            aria-labelledby={`task-column-${status}`}
          >
            <div className="task-column-header" id={`task-column-${status}`}>
              <span>{t(COLUMN_LABEL_KEYS[status])}</span>
              <span className="task-column-count">{column.length}</span>
            </div>
            <ul className="task-column-list">
              {column.map((task) => (
                <li className="task-column-item" key={task.id}>
                  <TaskCard
                    task={task}
                    projectName={
                      task.project_id ? projectNames.get(task.project_id) : null
                    }
                    isDragging={draggingId === task.id}
                    t={t}
                    onDragStart={onTaskDragStart(task.id)}
                    onDragEnd={onTaskDragEnd}
                    onOpen={() => onOpenTask(task.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface ProjectTabsProps {
  projects: Project[];
  selectedProjectId: string;
  t: TranslationFn;
  onSelect: (projectId: string) => void;
}

function ProjectTabs({
  projects,
  selectedProjectId,
  t,
  onSelect,
}: ProjectTabsProps) {
  return (
    <div
      className="task-project-tabs"
      role="tablist"
      aria-label={t("app.tasks")}
    >
      <button
        type="button"
        className={selectedProjectId === "all" ? "active" : ""}
        onClick={() => onSelect("all")}
      >
        {t("tasks.allProjects")}
      </button>
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          className={selectedProjectId === project.id ? "active" : ""}
          onClick={() => onSelect(project.id)}
          title={project.id}
        >
          {project.name || project.id}
        </button>
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  projectName?: string | null;
  isDragging: boolean;
  t: TranslationFn;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
}

function TaskCard({
  task,
  projectName,
  isDragging,
  t,
  onDragStart,
  onDragEnd,
  onOpen,
}: TaskCardProps) {
  const status = normalizeStatus(task.status);
  const timestamp = task.updated_at ?? task.created_at;
  const className = `app-card task-card${isDragging ? " dragging" : ""}`;
  const deliveryBadge = taskDeliveryBadge(task, status);

  return (
    <button
      type="button"
      className={className}
      draggable={true}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{ marginBottom: 8, cursor: "pointer" }}
    >
      <span className="app-card-title">
        {task.title || t("tasks.untitled")}
      </span>
      {task.project_id ? (
        <span className="task-project-chip">
          {projectName || task.project_id}
        </span>
      ) : null}
      {task.description ? (
        <span
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
            lineHeight: 1.45,
          }}
        >
          {task.description.slice(0, 160)}
        </span>
      ) : null}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span className={statusBadgeClass(status)}>
          {t(COLUMN_LABEL_KEYS[status])}
        </span>
        {deliveryBadge ? (
          <span className={deliveryBadge.className}>
            {t(deliveryBadge.labelKey)}
          </span>
        ) : null}
        {task.owner ? (
          <span className="app-card-meta">@{task.owner}</span>
        ) : null}
        {timestamp ? (
          <span className="app-card-meta">{formatRelativeTime(timestamp)}</span>
        ) : null}
      </span>
    </button>
  );
}
