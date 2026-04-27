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
  createProject,
  createTask,
  getOfficeTasks,
  getProjects,
  type Project,
  post,
  type Task,
  updateProject,
} from "../../api/client";
import { formatRelativeTime } from "../../lib/format";
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

const DND_MIME = "application/x-laf-office-task-id";
const HUMAN_SLUG = "human";
const HIDDEN_EMPTY_COLUMNS = new Set<StatusGroup>([
  "pending",
  "blocked",
  "canceled",
]);

const COLUMN_LABEL: Record<StatusGroup, string> = {
  in_progress: "in progress",
  open: "open",
  review: "review",
  pending: "pending",
  blocked: "blocked",
  done: "done",
  canceled: "won't do",
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
): string {
  if (selectedProjectId === "") return "Open a project workspace.";
  if (selectedProjectId === "all") return "All active lanes across the office.";
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

function taskCountLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
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
        await queryClient.invalidateQueries({ queryKey: ["office-tasks"] });
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
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      await queryClient.invalidateQueries({ queryKey: ["office-tasks"] });
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

  const moveTask = useTaskMove();
  const tasks = data?.tasks ?? [];
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const selectedProject = findSelectedProject(projects, selectedProjectId);
  const grouped = groupTasks(tasks);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const boardDrag = useTaskBoardDrag(tasksById, moveTask);
  const selectedTask = selectedTaskId
    ? (tasksById.get(selectedTaskId) ??
      (selectedTaskSnapshot?.id === selectedTaskId
        ? selectedTaskSnapshot
        : null))
    : null;
  const isTaskLoading = shouldLoadTasks && isLoading;

  if (projectsQuery.isLoading) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Loading tasks...
      </div>
    );
  }

  if (projectsQuery.error) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Could not load tasks.
      </div>
    );
  }

  const handleOpenProjectWiki = () => {
    if (!selectedProject) return;
    setWikiPath(`projects/${selectedProject.id}`);
    setCurrentApp("wiki");
  };

  return (
    <>
      <ProjectToolbar
        projectCreator={projectCreator}
        projectNames={projectNames}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />

      <ProjectWorkspaceOverview
        project={selectedProject}
        projectCount={projects.length}
        githubConnector={githubConnector}
        isLoadingTasks={isTaskLoading}
        tasks={tasks}
        onOpenWiki={handleOpenProjectWiki}
      />

      <ProjectWorkRequest project={selectedProject} taskCreator={taskCreator} />

      <TaskWorkArea
        error={error}
        isTaskLoading={isTaskLoading}
        selectedProject={selectedProject}
        tasks={tasks}
      >
        <TaskBoard
          grouped={grouped}
          isDragging={boardDrag.isDragging}
          dragoverStatus={boardDrag.dragoverStatus}
          draggingId={boardDrag.draggingId}
          projectNames={projectNames}
          onColumnDragOver={boardDrag.handleColumnDragOver}
          onColumnDragLeave={boardDrag.handleColumnDragLeave}
          onColumnDrop={boardDrag.handleColumnDrop}
          onTaskDragStart={boardDrag.handleDragStart}
          onTaskDragEnd={boardDrag.handleDragEnd}
          onOpenTask={setSelectedTaskId}
        />
      </TaskWorkArea>
      {selectedTask ? (
        <TaskDetailModal
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
  projectCreator: ProjectCreatorState;
  projectNames: Map<string, string>;
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
}

function ProjectToolbar({
  projectCreator,
  projectNames,
  projects,
  selectedProjectId,
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
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Project workspace</h3>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginTop: 4,
            }}
          >
            {selectedProjectLabel(selectedProjectId, projectNames)}
          </div>
        </div>
        <button
          type="button"
          className="task-project-new"
          onClick={toggleProjectForm}
          aria-label="New project"
          title="New project"
        >
          +
        </button>
      </div>

      <ProjectTabs
        projects={projects}
        selectedProjectId={selectedProjectId || "all"}
        onSelect={onSelectProject}
      />
      {projectCreator.isCreatingProject ? (
        <ProjectCreateForm projectCreator={projectCreator} />
      ) : null}
      {projectCreator.projectError ? (
        <div className="task-project-error">{projectCreator.projectError}</div>
      ) : null}
    </div>
  );
}

function ProjectCreateForm({
  projectCreator,
}: {
  projectCreator: ProjectCreatorState;
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
        placeholder="Project name"
        aria-label="Project name"
      />
      <input
        type="text"
        value={projectCreator.newProjectGitHubRepoURL}
        onChange={(event) =>
          projectCreator.setNewProjectGitHubRepoURL(event.currentTarget.value)
        }
        placeholder="GitHub repo URL (optional)"
        aria-label="GitHub repo URL"
      />
      <button
        type="submit"
        disabled={projectCreator.newProjectName.trim() === ""}
      >
        Create
      </button>
    </form>
  );
}

interface TaskWorkAreaProps {
  children: ReactNode;
  error: unknown;
  isTaskLoading: boolean;
  selectedProject: Project | null;
  tasks: Task[];
}

function TaskWorkArea({
  children,
  error,
  isTaskLoading,
  selectedProject,
  tasks,
}: TaskWorkAreaProps) {
  if (error) {
    return (
      <div className="task-empty-state">Could not load project tasks.</div>
    );
  }
  if (isTaskLoading) {
    return <div className="task-empty-state">Loading project tasks...</div>;
  }
  if (tasks.length === 0) {
    return (
      <div className="task-empty-state">
        {selectedProject
          ? "No work queued in this project yet."
          : "Create or select a project to open its workspace."}
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
  tasks: Task[];
  onOpenWiki: () => void;
}

function ProjectWorkspaceOverview({
  project,
  projectCount,
  githubConnector,
  isLoadingTasks,
  tasks,
  onOpenWiki,
}: ProjectWorkspaceOverviewProps) {
  if (!project) {
    return (
      <section
        className="task-workspace-overview"
        aria-label="Project workspace overview"
      >
        <article className="task-workspace-card task-workspace-card-wide">
          <span className="task-workspace-kicker">Projects</span>
          <strong>
            {projectCount === 0
              ? "Create the first project"
              : taskCountLabel(projectCount, "project")}
          </strong>
          <span>
            Open one project to see its wiki, queue, agents, and repo.
          </span>
        </article>
      </section>
    );
  }

  const activeTaskCount = countActiveTasks(tasks);
  const agentOwnedTaskCount = countAgentOwnedTasks(tasks);
  const repoURL = project.github_repo_url?.trim();

  return (
    <section
      className="task-workspace-overview"
      aria-label="Project workspace overview"
    >
      <article className="task-workspace-card task-workspace-card-wide">
        <span className="task-workspace-kicker">Project</span>
        <strong>{project.name || project.id} workspace</strong>
        <span>Goals, decisions, constraints, and handoff notes live here.</span>
      </article>
      <article className="task-workspace-card">
        <span className="task-workspace-kicker">Wiki context</span>
        <strong>Project wiki</strong>
        <span>Planning memory for humans and agents.</span>
        <button type="button" onClick={onOpenWiki}>
          Open project wiki
        </button>
      </article>
      <article className="task-workspace-card">
        <span className="task-workspace-kicker">Task queue</span>
        <strong>
          {isLoadingTasks
            ? "Loading tasks..."
            : taskCountLabel(activeTaskCount, "active task")}
        </strong>
        <span>Open, in-progress, review, pending, and blocked work.</span>
      </article>
      <article className="task-workspace-card">
        <span className="task-workspace-kicker">Agent work</span>
        <strong>
          {isLoadingTasks
            ? "Loading assignments..."
            : taskCountLabel(agentOwnedTaskCount, "agent-owned task")}
        </strong>
        <span>Work currently assigned away from the human owner.</span>
      </article>
      <ProjectGitHubCard
        connector={githubConnector}
        project={project}
        repoURL={repoURL}
      />
    </section>
  );
}

interface ProjectGitHubCardProps {
  connector: ProjectGitHubConnectorState;
  project: Project;
  repoURL?: string;
}

function ProjectGitHubCard({
  connector,
  project,
  repoURL,
}: ProjectGitHubCardProps) {
  const isEditing = connector.editingProjectId === project.id;
  const isSaving = connector.isSaving(project.id);

  return (
    <article className="task-workspace-card">
      <span className="task-workspace-kicker">GitHub</span>
      <strong>{repoURL ? "Repo connected" : "Repo not connected"}</strong>
      <span>
        {repoURL
          ? "Ready for project-scoped coding work."
          : "Connect it only when code work starts."}
      </span>
      {isEditing ? (
        <ProjectGitHubEditForm
          connector={connector}
          isSaving={isSaving}
          project={project}
        />
      ) : (
        <ProjectGitHubActions
          connector={connector}
          isSaving={isSaving}
          project={project}
          repoURL={repoURL}
        />
      )}
    </article>
  );
}

interface ProjectGitHubChildProps {
  connector: ProjectGitHubConnectorState;
  isSaving: boolean;
  project: Project;
}

function ProjectGitHubEditForm({
  connector,
  isSaving,
  project,
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
        aria-label="GitHub repository URL"
      />
      <div className="task-github-actions">
        <button
          type="submit"
          disabled={isSaving || connector.repoURL.trim() === ""}
        >
          {isSaving ? "Saving..." : "Save GitHub repo"}
        </button>
        <button type="button" onClick={connector.cancel}>
          Cancel
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
}: ProjectGitHubChildProps & { repoURL?: string }) {
  return (
    <div className="task-github-actions">
      {repoURL ? (
        <a href={repoURL} target="_blank" rel="noreferrer">
          Open GitHub repo
        </a>
      ) : null}
      <button type="button" onClick={() => connector.begin(project)}>
        {repoURL ? "Change GitHub repo" : "Connect GitHub repo"}
      </button>
      {repoURL ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void connector.disconnect(project)}
        >
          {isSaving ? "Saving..." : "Disconnect"}
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
}

function ProjectWorkRequest({ project, taskCreator }: ProjectWorkRequestProps) {
  if (!project) return null;

  return (
    <section className="task-request-panel" aria-label="Project task composer">
      <form onSubmit={(event) => taskCreator.handleCreateTask(project, event)}>
        <textarea
          value={taskCreator.requestText}
          onChange={(event) =>
            taskCreator.setRequestText(event.currentTarget.value)
          }
          placeholder="Ask for the next project task"
          aria-label="Project work request"
          rows={2}
        />
        <button
          type="submit"
          disabled={
            taskCreator.isSubmittingTask ||
            taskCreator.requestText.trim() === ""
          }
        >
          {taskCreator.isSubmittingTask ? "Creating..." : "Create task"}
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
              <span>{COLUMN_LABEL[status]}</span>
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
  onSelect: (projectId: string) => void;
}

function ProjectTabs({
  projects,
  selectedProjectId,
  onSelect,
}: ProjectTabsProps) {
  return (
    <div className="task-project-tabs" role="tablist" aria-label="Projects">
      <button
        type="button"
        className={selectedProjectId === "all" ? "active" : ""}
        onClick={() => onSelect("all")}
      >
        All projects
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
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
}

function TaskCard({
  task,
  projectName,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: TaskCardProps) {
  const status = normalizeStatus(task.status);
  const timestamp = task.updated_at ?? task.created_at;
  const className = `app-card task-card${isDragging ? " dragging" : ""}`;

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
      <span className="app-card-title">{task.title || "Untitled"}</span>
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
        <span className={statusBadgeClass(status)}>{COLUMN_LABEL[status]}</span>
        {task.owner ? (
          <span className="app-card-meta">@{task.owner}</span>
        ) : null}
        {task.channel ? (
          <span className="app-card-meta">#{task.channel}</span>
        ) : null}
        {timestamp ? (
          <span className="app-card-meta">{formatRelativeTime(timestamp)}</span>
        ) : null}
      </span>
    </button>
  );
}
