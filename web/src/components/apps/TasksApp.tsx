import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type ActionRecord,
  createDM,
  createProject,
  createTask,
  getActions,
  getOfficeTasks,
  getProjectRepoReadiness,
  getProjects,
  type Project,
  type ProjectRepoReadiness,
  post,
  type Task,
  updateProject,
} from "../../api/client";
import type { OfficeMember } from "../../hooks/useMembers";
import { useOfficeMembers } from "../../hooks/useMembers";
import { formatRelativeTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import type { Language } from "../../stores/app";
import { directChannelSlug, useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";
import { TaskDetailModal } from "./TaskDetailModal";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;
const ACTION_REFETCH_MS = liveEventsSupported ? 45_000 : 15_000;

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
type TaskViewMode = "list" | "board";
type TaskMove = (task: Task, toStatus: StatusGroup) => Promise<void>;
type TaskBoardDragState = ReturnType<typeof useTaskBoardDrag>;
type ProjectCreatorState = ReturnType<typeof useProjectCreator>;
type ProjectGitHubConnectorState = ReturnType<typeof useProjectGitHubConnector>;
type ProjectLeadAgentEditorState = ReturnType<typeof useProjectLeadAgentEditor>;
type ProjectTaskCreatorState = ReturnType<typeof useProjectTaskCreator>;
type ProjectRepoReadinessQueryState = {
  readiness?: ProjectRepoReadiness;
  isError: boolean;
  isLoading: boolean;
  refetch: () => void;
};
type TasksQueryData = { tasks: Task[] };
type TranslationFn = (key: I18nKey) => string;
type TaskBadge = { className: string; labelKey: I18nKey };
type ProjectLeadOption = { label: string; slug: string };
type ProjectTaskStats = {
  active: number;
  blocked: number;
  done: number;
  latestAt?: string;
  owners: string[];
  review: number;
  total: number;
};

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

function taskDeliveryBadge(task: Task, status: StatusGroup): TaskBadge | null {
  if (task.delivery_url?.trim()) {
    return taskDeliveryAttentionBadge(task) ?? taskDeliveryStateBadge(task);
  }
  if (status === "review" && taskRequiresDeliveryReceipt(task)) {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryNeeded",
    };
  }
  return null;
}

function taskDeliveryAttentionBadge(task: Task): TaskBadge | null {
  const reviewDecision = (task.delivery_review_decision ?? "")
    .trim()
    .toLowerCase();
  const checksStatus = (task.delivery_checks_status ?? "").trim().toLowerCase();
  const mergeState = (task.delivery_merge_state ?? "").trim().toLowerCase();
  if (task.delivery_draft) {
    return { className: "badge badge-yellow", labelKey: "tasks.deliveryDraft" };
  }
  if (reviewDecision === "changes_requested") {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryReviewChangesRequested",
    };
  }
  if (checksStatus === "failing") {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryChecksFailing",
    };
  }
  if (mergeState === "dirty") {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryMergeDirty",
    };
  }
  if (checksStatus === "pending") {
    return {
      className: "badge badge-yellow",
      labelKey: "tasks.deliveryChecksPending",
    };
  }
  return null;
}

function taskDeliveryStateBadge(task: Task): TaskBadge {
  switch ((task.delivery_status ?? "").trim().toLowerCase()) {
    case "merged":
      return {
        className: "badge badge-green",
        labelKey: "tasks.deliveryMerged",
      };
    case "open":
      return { className: "badge badge-green", labelKey: "tasks.deliveryOpen" };
    case "closed":
      return {
        className: "badge badge-yellow",
        labelKey: "tasks.deliveryClosed",
      };
    case "verified":
      return {
        className: "badge badge-green",
        labelKey: "tasks.deliveryVerified",
      };
    default:
      return {
        className: "badge badge-green",
        labelKey: "tasks.deliveryReady",
      };
  }
}

function taskExecutionBadge(task: Task): TaskBadge | null {
  if (task.execution_mode?.trim() === "local_worktree") {
    return {
      className: "badge badge-accent",
      labelKey: "tasks.detail.codingTask",
    };
  }
  if (task.project_id?.trim()) {
    return {
      className: "badge badge-muted",
      labelKey: "tasks.detail.planningTask",
    };
  }
  return null;
}

function projectCanCreateCodingTask(
  project: Project,
  readiness?: ProjectRepoReadiness,
): boolean {
  return Boolean(
    project.github_repo_url?.trim() && readiness?.can_create_coding_tasks,
  );
}

function repoReadinessTitleKey(
  repoURL: string | undefined,
  readiness: ProjectRepoReadiness | undefined,
  isLoading: boolean,
  isError: boolean,
): I18nKey {
  if (!repoURL) return "tasks.repoNotConnected";
  if (isLoading) return "tasks.repoChecking";
  if (isError) return "tasks.repoCheckUnavailable";
  switch (readiness?.status) {
    case "ready":
      return "tasks.repoReady";
    case "invalid_url":
      return "tasks.repoInvalid";
    case "gh_missing":
      return "tasks.repoToolMissing";
    case "auth_required":
      return "tasks.repoAuthRequired";
    case "repo_unreachable":
      return "tasks.repoReachabilityFailed";
    case "not_connected":
      return "tasks.repoNotConnected";
    default:
      return "tasks.repoNeedsSetup";
  }
}

function repoReadinessDetailKey(
  repoURL: string | undefined,
  readiness: ProjectRepoReadiness | undefined,
  isLoading: boolean,
  isError: boolean,
): I18nKey {
  if (!repoURL) return "tasks.repoNotConnectedDesc";
  if (isLoading) return "tasks.repoCheckingDesc";
  if (isError) return "tasks.repoCheckUnavailableDesc";
  switch (readiness?.status) {
    case "ready":
      return "tasks.repoReadyDesc";
    case "invalid_url":
      return "tasks.repoInvalidDesc";
    case "gh_missing":
      return "tasks.repoToolMissingDesc";
    case "auth_required":
      return "tasks.repoAuthRequiredDesc";
    case "repo_unreachable":
      return "tasks.repoReachabilityFailedDesc";
    case "not_connected":
      return "tasks.repoNotConnectedDesc";
    default:
      return "tasks.repoNeedsSetupDesc";
  }
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
  return <div className="app-empty-state">{children}</div>;
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

function allProjectsEmptyMessage(
  selectedProject: Project | null,
  projectCount: number,
  t: TranslationFn,
): string | undefined {
  if (selectedProject || projectCount === 0) return undefined;
  return t("tasks.emptyAllProjects");
}

function isAgentSlug(slug: string | undefined): slug is string {
  const owner = slug?.trim().toLowerCase();
  return Boolean(owner && owner !== "human" && owner !== "you");
}

function isActiveStatus(status: StatusGroup): boolean {
  return status !== "done" && status !== "canceled";
}

function taskTimestamp(task: Task): { at: string; time: number } | null {
  const at = task.updated_at ?? task.created_at;
  if (!at) return null;
  const time = Date.parse(at);
  return Number.isNaN(time) ? null : { at, time };
}

function latestTaskTimestamp(
  current: { at: string | undefined; time: number },
  task: Task,
) {
  const next = taskTimestamp(task);
  if (!next || next.time <= current.time) return current;
  return { at: next.at, time: next.time };
}

function projectTaskStats(tasks: Task[]): ProjectTaskStats {
  const owners = new Set<string>();
  let active = 0;
  let blocked = 0;
  let done = 0;
  let review = 0;
  let latest = { at: undefined as string | undefined, time: 0 };

  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    if (isActiveStatus(status)) active += 1;
    if (status === "blocked" || task.blocked) blocked += 1;
    if (status === "done") done += 1;
    if (status === "review") review += 1;
    if (isAgentSlug(task.owner)) owners.add(task.owner.trim().toLowerCase());
    latest = latestTaskTimestamp(latest, task);
  }

  return {
    active,
    blocked,
    done,
    latestAt: latest.at,
    owners: [...owners].sort(),
    review,
    total: tasks.length,
  };
}

function projectProgressPercent(stats: ProjectTaskStats): number {
  if (stats.total === 0) return 0;
  return Math.round((stats.done / stats.total) * 100);
}

function normalizedAgentSlug(slug: string | undefined): string | null {
  return isAgentSlug(slug) ? slug.trim().toLowerCase() : null;
}

function assignableOfficeMembers(members: OfficeMember[]): ProjectLeadOption[] {
  const seen = new Set<string>();
  const options: ProjectLeadOption[] = [];

  for (const member of members) {
    const slug = normalizedAgentSlug(member.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name = member.name?.trim();
    options.push({
      slug,
      label:
        name && name.toLowerCase() !== slug ? `${name} @${slug}` : `@${slug}`,
    });
  }

  return options.sort((a, b) => a.slug.localeCompare(b.slug));
}

function projectLeadOptions(
  members: ProjectLeadOption[],
  currentLead?: string,
): ProjectLeadOption[] {
  const current = normalizedAgentSlug(currentLead);
  if (!current || members.some((member) => member.slug === current)) {
    return members;
  }
  return [{ slug: current, label: `@${current}` }, ...members];
}

function leadAgentForProject(
  project: Project | null,
  tasks: Task[],
  readiness?: ProjectRepoReadiness,
): string {
  const projectLead = normalizedAgentSlug(project?.lead_agent);
  if (projectLead) return projectLead;
  const activeOwner = tasks.find((task) => {
    const status = normalizeStatus(task.status);
    return isActiveStatus(status) && normalizedAgentSlug(task.owner);
  })?.owner;
  const owner = normalizedAgentSlug(activeOwner);
  if (owner) return owner;
  if (readiness?.can_create_coding_tasks || project?.github_repo_url?.trim()) {
    return "founding-engineer";
  }
  return "ceo";
}

function taskStatusSort(status: StatusGroup): number {
  switch (status) {
    case "blocked":
      return 0;
    case "review":
      return 1;
    case "in_progress":
      return 2;
    case "open":
      return 3;
    case "pending":
      return 4;
    case "done":
      return 5;
    case "canceled":
      return 6;
  }
}

function taskUpdatedTime(task: Task): number {
  const timestamp = task.updated_at ?? task.created_at;
  if (!timestamp) return 0;
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? 0 : time;
}

function sortTasksForIssueList(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusDelta =
      taskStatusSort(normalizeStatus(a.status)) -
      taskStatusSort(normalizeStatus(b.status));
    if (statusDelta !== 0) return statusDelta;
    return taskUpdatedTime(b) - taskUpdatedTime(a);
  });
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
  const [newProjectLeadAgent, setNewProjectLeadAgent] = useState("");
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
        lead_agent: newProjectLeadAgent.trim() || undefined,
        github_repo_url: newProjectGitHubRepoURL.trim() || undefined,
        created_by: HUMAN_SLUG,
      });
      setNewProjectLeadAgent("");
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
    newProjectLeadAgent,
    newProjectName,
    projectError,
    setIsCreatingProject,
    setNewProjectGitHubRepoURL,
    setNewProjectLeadAgent,
    setNewProjectName,
    setProjectError,
  };
}

function useProjectLeadAgentEditor(queryClient: QueryClient) {
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  const assign = useCallback(
    async (project: Project, nextLeadAgent: string) => {
      const leadAgent = normalizedAgentSlug(nextLeadAgent);
      const currentLead = normalizedAgentSlug(project.lead_agent);
      if (!leadAgent || leadAgent === currentLead) return;

      setSavingProjectId(project.id);
      try {
        await updateProject({
          id: project.id,
          lead_agent: leadAgent,
          created_by: HUMAN_SLUG,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["actions"] }),
          queryClient.invalidateQueries({ queryKey: ["projects"] }),
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not update project lead";
        showNotice(`Lead update failed: ${message}`, "error");
      } finally {
        setSavingProjectId(null);
      }
    },
    [queryClient],
  );

  return { assign, savingProjectId };
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
      queryClient.invalidateQueries({ queryKey: ["project-repo-readiness"] }),
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

function buildProjectTaskRequest(
  project: Project,
  request: string,
  canCreateCodingTask: boolean,
) {
  const leadAgent = normalizedAgentSlug(project.lead_agent);
  return {
    title: request,
    details: request,
    project_id: project.id,
    channel: project.channel || "general",
    owner: leadAgent ?? (canCreateCodingTask ? "founding-engineer" : "ceo"),
    task_type: canCreateCodingTask ? "feature" : "research",
    execution_mode: canCreateCodingTask ? "local_worktree" : "office",
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
  queryClient.setQueryData<TasksQueryData>(
    ["office-tasks", "project-list"],
    (data) => upsertTaskData(data, task),
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
    canCreateCodingTask: boolean,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const request = requestText.trim();
    if (!request) return;
    setTaskError(null);
    setIsSubmittingTask(true);
    try {
      const { task } = await createTask(
        buildProjectTaskRequest(project, request, canCreateCodingTask),
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
  const enterDM = useAppStore((s) => s.enterDM);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const { language, t } = useI18n();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<Task | null>(
    null,
  );
  const [taskView, setTaskView] = useState<TaskViewMode>("list");
  const projectCreator = useProjectCreator(queryClient, setSelectedProjectId);
  const githubConnector = useProjectGitHubConnector(queryClient);
  const leadAgentEditor = useProjectLeadAgentEditor(queryClient);
  const taskCreator = useProjectTaskCreator(queryClient, (task) => {
    setSelectedTaskSnapshot(task);
    setSelectedTaskId(task.id);
  });
  const officeMembersQuery = useOfficeMembers();
  const leadMembers = useMemo(
    () => assignableOfficeMembers(officeMembersQuery.data ?? []),
    [officeMembersQuery.data],
  );
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
    refetchInterval: TASK_REFETCH_MS,
  });
  const allTasksQuery = useQuery({
    queryKey: ["office-tasks", "project-list"],
    queryFn: () => getOfficeTasks({ includeDone: true }),
    enabled: projectsQuery.isSuccess,
    refetchInterval: TASK_REFETCH_MS,
  });

  const actionsQuery = useQuery({
    queryKey: ["actions"],
    queryFn: () => getActions(),
    enabled: Boolean(selectedProjectFilter),
    refetchInterval: ACTION_REFETCH_MS,
  });

  const moveTask = useTaskMove();
  const tasks = data?.tasks ?? [];
  const allProjectTasks = allTasksQuery.data?.tasks ?? [];
  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const selectedProject = useMemo(
    () => findSelectedProject(projects, selectedProjectId),
    [projects, selectedProjectId],
  );
  const selectedProjectRepoURL = selectedProject?.github_repo_url?.trim() ?? "";
  const repoReadinessQuery = useQuery({
    queryKey: [
      "project-repo-readiness",
      selectedProject?.id ?? "",
      selectedProjectRepoURL,
    ],
    queryFn: () => getProjectRepoReadiness(selectedProject?.id ?? ""),
    enabled: Boolean(selectedProject?.id && selectedProjectRepoURL),
    staleTime: 60_000,
    retry: false,
  });
  const repoReadinessState: ProjectRepoReadinessQueryState = {
    readiness: repoReadinessQuery.data?.readiness,
    isError: repoReadinessQuery.isError,
    isLoading: repoReadinessQuery.isLoading,
    refetch: () => {
      void repoReadinessQuery.refetch();
    },
  };
  const projectActivities = useMemo(
    () =>
      selectedProject
        ? projectActivityEvents(
            actionsQuery.data?.actions ?? [],
            selectedProject.id,
            tasks,
          )
        : [],
    [actionsQuery.data?.actions, selectedProject, tasks],
  );
  const grouped = useMemo(() => groupTasks(tasks), [tasks]);
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const boardDrag = useTaskBoardDrag(tasksById, moveTask);
  const leadAgent = leadAgentForProject(
    selectedProject,
    tasks,
    repoReadinessState.readiness,
  );
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
  const handleOpenAgentChat = (agentSlug: string) => {
    const slug = agentSlug.trim().toLowerCase();
    if (!isAgentSlug(slug)) return;
    createDM(slug)
      .then((dm) => {
        enterDM(slug, dm.slug || directChannelSlug(slug));
      })
      .catch((err: Error) => {
        showNotice(`Could not open @${slug}: ${err.message}`, "error");
      });
  };

  return (
    <>
      <ProjectToolbar
        projectCreator={projectCreator}
        leadMembers={leadMembers}
        projectNames={projectNames}
        selectedProjectId={selectedProjectId}
        language={language}
        t={t}
      />

      <div className="project-workspace-layout">
        <ProjectListPanel
          isLoadingTasks={allTasksQuery.isLoading}
          isStatsReady={Boolean(allTasksQuery.data)}
          language={language}
          projects={projects}
          selectedProjectId={selectedProjectId || "all"}
          tasks={allProjectTasks}
          t={t}
          onChatAgent={handleOpenAgentChat}
          onCreateProject={handleOpenProjectCreator}
          onSelectProject={setSelectedProjectId}
        />
        <ProjectWorkspaceMain
          githubConnector={githubConnector}
          isActivityLoading={actionsQuery.isLoading}
          isTaskLoading={isTaskLoading}
          language={language}
          leadAgent={leadAgent}
          leadAgentEditor={leadAgentEditor}
          leadMembers={leadMembers}
          projectActivities={projectActivities}
          projectCount={projects.length}
          repoReadinessState={repoReadinessState}
          selectedProject={selectedProject}
          taskCreator={taskCreator}
          taskWorkArea={
            <SelectedTaskWorkArea
              boardDrag={boardDrag}
              error={error}
              emptyMessage={allProjectsEmptyMessage(
                selectedProject,
                projects.length,
                t,
              )}
              grouped={grouped}
              isTaskLoading={isTaskLoading}
              projectNames={projectNames}
              selectedProject={selectedProject}
              taskView={taskView}
              tasks={tasks}
              t={t}
              onOpenTask={setSelectedTaskId}
            />
          }
          tasks={tasks}
          taskView={taskView}
          t={t}
          onChatAgent={handleOpenAgentChat}
          onCreateProject={handleOpenProjectCreator}
          onOpenWiki={handleOpenProjectWiki}
          onTaskViewChange={setTaskView}
        />
      </div>
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

interface ProjectWorkspaceMainProps {
  githubConnector: ProjectGitHubConnectorState;
  isActivityLoading: boolean;
  isTaskLoading: boolean;
  language: Language;
  leadAgent: string;
  leadAgentEditor: ProjectLeadAgentEditorState;
  leadMembers: ProjectLeadOption[];
  projectActivities: ActionRecord[];
  projectCount: number;
  repoReadinessState: ProjectRepoReadinessQueryState;
  selectedProject: Project | null;
  taskCreator: ProjectTaskCreatorState;
  taskWorkArea: ReactNode;
  tasks: Task[];
  taskView: TaskViewMode;
  t: TranslationFn;
  onChatAgent: (agentSlug: string) => void;
  onCreateProject: () => void;
  onOpenWiki: () => void;
  onTaskViewChange: (view: TaskViewMode) => void;
}

function ProjectWorkspaceMain({
  githubConnector,
  isActivityLoading,
  isTaskLoading,
  language,
  leadAgent,
  leadAgentEditor,
  leadMembers,
  projectActivities,
  projectCount,
  repoReadinessState,
  selectedProject,
  taskCreator,
  taskWorkArea,
  tasks,
  taskView,
  t,
  onChatAgent,
  onCreateProject,
  onOpenWiki,
  onTaskViewChange,
}: ProjectWorkspaceMainProps) {
  const issueScopeLabel = selectedProject
    ? projectWorkspaceName(selectedProject, language)
    : projectCount > 0
      ? t("tasks.allProjects")
      : undefined;

  return (
    <div className="project-workspace-main">
      {selectedProject ? (
        <>
          <ProjectWorkspaceOverview
            project={selectedProject}
            projectCount={projectCount}
            githubConnector={githubConnector}
            isLoadingTasks={isTaskLoading}
            language={language}
            leadAgent={leadAgent}
            leadAgentEditor={leadAgentEditor}
            leadMembers={leadMembers}
            repoReadinessState={repoReadinessState}
            tasks={tasks}
            t={t}
            onChatAgent={onChatAgent}
            onCreateProject={onCreateProject}
            onOpenWiki={onOpenWiki}
          />
          <ProjectIssueToolbar
            scopeLabel={issueScopeLabel}
            taskCount={tasks.length}
            taskView={taskView}
            t={t}
            onTaskViewChange={onTaskViewChange}
          />
          {taskWorkArea}
          <ProjectWorkRequest
            project={selectedProject}
            repoReadinessState={repoReadinessState}
            taskCreator={taskCreator}
            t={t}
          />
          <ProjectActivityLog
            activities={projectActivities}
            isLoading={isActivityLoading}
            language={language}
            project={selectedProject}
            t={t}
          />
        </>
      ) : (
        <>
          <ProjectWorkspaceOverview
            project={selectedProject}
            projectCount={projectCount}
            githubConnector={githubConnector}
            isLoadingTasks={isTaskLoading}
            language={language}
            leadAgent={leadAgent}
            leadAgentEditor={leadAgentEditor}
            leadMembers={leadMembers}
            repoReadinessState={repoReadinessState}
            tasks={tasks}
            t={t}
            onChatAgent={onChatAgent}
            onCreateProject={onCreateProject}
            onOpenWiki={onOpenWiki}
          />
          {projectCount > 0 ? (
            <ProjectIssueToolbar
              scopeLabel={issueScopeLabel}
              taskCount={tasks.length}
              taskView={taskView}
              t={t}
              onTaskViewChange={onTaskViewChange}
            />
          ) : null}
          {taskWorkArea}
        </>
      )}
    </div>
  );
}

interface ProjectToolbarProps {
  leadMembers: ProjectLeadOption[];
  language: Language;
  projectCreator: ProjectCreatorState;
  projectNames: Map<string, string>;
  selectedProjectId: string;
  t: TranslationFn;
}

function ProjectToolbar({
  leadMembers,
  language,
  projectCreator,
  projectNames,
  selectedProjectId,
  t,
}: ProjectToolbarProps) {
  return (
    <div className="task-toolbar">
      <div className="task-heading-row">
        <div>
          <h3 className="task-heading-title">{t("tasks.workspace.title")}</h3>
          <div className="task-heading-subtitle">
            {selectedProjectLabel(selectedProjectId, projectNames, language)}
          </div>
        </div>
      </div>

      {projectCreator.isCreatingProject ? (
        <ProjectCreateForm
          leadMembers={leadMembers}
          projectCreator={projectCreator}
          t={t}
        />
      ) : null}
      {projectCreator.projectError ? (
        <div className="task-project-error">{projectCreator.projectError}</div>
      ) : null}
    </div>
  );
}

function ProjectCreateForm({
  leadMembers,
  projectCreator,
  t,
}: {
  leadMembers: ProjectLeadOption[];
  projectCreator: ProjectCreatorState;
  t: TranslationFn;
}) {
  const leadOptions = projectLeadOptions(
    leadMembers,
    projectCreator.newProjectLeadAgent,
  );

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
      <select
        value={projectCreator.newProjectLeadAgent}
        onChange={(event) =>
          projectCreator.setNewProjectLeadAgent(event.currentTarget.value)
        }
        aria-label={t("tasks.projectLead")}
      >
        <option value="">{t("tasks.leadAgentAuto")}</option>
        {leadOptions.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={projectCreator.newProjectName.trim() === ""}
      >
        {t("tasks.create")}
      </button>
    </form>
  );
}

interface ProjectListPanelProps {
  isLoadingTasks: boolean;
  isStatsReady: boolean;
  language: Language;
  projects: Project[];
  selectedProjectId: string;
  tasks: Task[];
  t: TranslationFn;
  onChatAgent: (agentSlug: string) => void;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
}

function ProjectListPanel({
  isLoadingTasks,
  isStatsReady,
  language,
  projects,
  selectedProjectId,
  tasks,
  t,
  onChatAgent,
  onCreateProject,
  onSelectProject,
}: ProjectListPanelProps) {
  const allStats = projectTaskStats(tasks);
  const showAllProjects = projects.length > 1;

  return (
    <aside className="project-list-panel" aria-label={t("tasks.projectList")}>
      <div className="project-list-head">
        <div>
          <h4>{t("tasks.projectList")}</h4>
          <span>
            {isLoadingTasks
              ? t("tasks.loadingTasks")
              : countLabel(
                  projects.length,
                  "project",
                  "projects",
                  "프로젝트",
                  language,
                )}
          </span>
        </div>
        <button
          type="button"
          className="project-list-new"
          onClick={onCreateProject}
          aria-label={t("tasks.newProject")}
          title={t("tasks.newProject")}
        >
          +
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="project-list-empty">
          <strong>{t("tasks.noProjects")}</strong>
          <span>{t("tasks.projectListEmpty")}</span>
        </div>
      ) : (
        <div className="project-list-stack">
          {showAllProjects ? (
            <ProjectListRow
              isActive={selectedProjectId === "all"}
              isLoadingStats={!isStatsReady}
              language={language}
              leadAgent={null}
              name={t("tasks.allProjects")}
              stats={allStats}
              t={t}
              onChatAgent={onChatAgent}
              onSelect={() => onSelectProject("all")}
            />
          ) : null}
          {projects.map((project) => {
            const projectTasks = tasks.filter(
              (task) => task.project_id === project.id,
            );
            return (
              <ProjectListRow
                key={project.id}
                description={project.description || project.id}
                isActive={selectedProjectId === project.id}
                isLoadingStats={!isStatsReady}
                language={language}
                leadAgent={leadAgentForProject(project, projectTasks)}
                name={project.name || project.id}
                stats={projectTaskStats(projectTasks)}
                t={t}
                onChatAgent={onChatAgent}
                onSelect={() => onSelectProject(project.id)}
              />
            );
          })}
        </div>
      )}
    </aside>
  );
}

interface ProjectListRowProps {
  description?: string;
  isActive: boolean;
  isLoadingStats: boolean;
  language: Language;
  leadAgent: string | null;
  name: string;
  stats: ProjectTaskStats;
  t: TranslationFn;
  onChatAgent: (agentSlug: string) => void;
  onSelect: () => void;
}

function ProjectListRow({
  description,
  isActive,
  isLoadingStats,
  language,
  leadAgent,
  name,
  stats,
  t,
  onChatAgent,
  onSelect,
}: ProjectListRowProps) {
  const progress = projectProgressPercent(stats);
  const countValue = (value: number) => (isLoadingStats ? "..." : value);

  return (
    <div className={`project-list-row${isActive ? " active" : ""}`}>
      <button type="button" className="project-list-main" onClick={onSelect}>
        <span className="project-list-title-line">
          <span className="project-list-title">{name}</span>
          {leadAgent ? (
            <span className="project-list-lead">@{leadAgent}</span>
          ) : null}
        </span>
        {description ? (
          <span className="project-list-description">{description}</span>
        ) : null}
        <span className="project-list-counts">
          <span>
            <strong>{countValue(stats.active)}</strong> {t("tasks.activeCount")}
          </span>
          <span>
            <strong>{countValue(stats.done)}</strong> {t("tasks.doneCount")}
          </span>
          <span>
            <strong>{countValue(stats.review)}</strong> {t("tasks.reviewCount")}
          </span>
          <span>
            <strong>{countValue(stats.blocked)}</strong>{" "}
            {t("tasks.blockedCount")}
          </span>
        </span>
        <span className="project-list-progress-line">
          <span>{t("tasks.progress")}</span>
          <strong>{isLoadingStats ? "..." : `${progress}%`}</strong>
        </span>
        <span
          className="project-list-progress"
          role="progressbar"
          aria-label={`${t("tasks.progress")} ${isLoadingStats ? 0 : progress}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={isLoadingStats ? 0 : progress}
        >
          <span style={{ width: `${isLoadingStats ? 0 : progress}%` }} />
        </span>
        <span className="project-list-meta">
          {isLoadingStats
            ? t("tasks.loadingTasks")
            : stats.latestAt
              ? `${t("tasks.latestActivity")} ${formatRelativeTime(stats.latestAt)}`
              : countLabel(stats.total, "task", "tasks", "작업", language)}
        </span>
      </button>
      {leadAgent ? (
        <div className="project-list-agents">
          <button
            type="button"
            className="project-agent-chat"
            onClick={() => onChatAgent(leadAgent)}
            aria-label={`${t("tasks.chatWithAgent")} @${leadAgent}`}
            title={`${t("tasks.chatWithAgent")} @${leadAgent}`}
          >
            {t("tasks.chatLead")}
          </button>
        </div>
      ) : null}
    </div>
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
  emptyMessage?: string;
  error: unknown;
  isTaskLoading: boolean;
  selectedProject: Project | null;
  tasks: Task[];
  t: TranslationFn;
}

function TaskWorkArea({
  children,
  emptyMessage,
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
        {emptyMessage ??
          (selectedProject
            ? t("tasks.emptyProject")
            : t("tasks.emptyNoProject"))}
      </div>
    );
  }
  return children;
}

interface SelectedTaskWorkAreaProps {
  boardDrag: TaskBoardDragState;
  emptyMessage?: string;
  error: unknown;
  grouped: Record<StatusGroup, Task[]>;
  isTaskLoading: boolean;
  projectNames: Map<string, string>;
  selectedProject: Project | null;
  tasks: Task[];
  taskView: TaskViewMode;
  t: TranslationFn;
  onOpenTask: (taskId: string) => void;
}

function SelectedTaskWorkArea({
  boardDrag,
  emptyMessage,
  error,
  grouped,
  isTaskLoading,
  projectNames,
  selectedProject,
  tasks,
  taskView,
  t,
  onOpenTask,
}: SelectedTaskWorkAreaProps) {
  return (
    <TaskWorkArea
      emptyMessage={emptyMessage}
      error={error}
      isTaskLoading={isTaskLoading}
      selectedProject={selectedProject}
      tasks={tasks}
      t={t}
    >
      {taskView === "list" ? (
        <IssueList
          projectNames={projectNames}
          tasks={tasks}
          t={t}
          onOpenTask={onOpenTask}
        />
      ) : (
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
          onOpenTask={onOpenTask}
        />
      )}
    </TaskWorkArea>
  );
}

interface ProjectWorkspaceOverviewProps {
  project: Project | null;
  projectCount: number;
  githubConnector: ProjectGitHubConnectorState;
  isLoadingTasks: boolean;
  language: Language;
  leadAgent: string;
  leadAgentEditor: ProjectLeadAgentEditorState;
  leadMembers: ProjectLeadOption[];
  repoReadinessState: ProjectRepoReadinessQueryState;
  tasks: Task[];
  t: TranslationFn;
  onChatAgent: (agentSlug: string) => void;
  onCreateProject: () => void;
  onOpenWiki: () => void;
}

function ProjectWorkspaceOverview({
  project,
  projectCount,
  githubConnector,
  isLoadingTasks,
  language,
  leadAgent,
  leadAgentEditor,
  leadMembers,
  repoReadinessState,
  tasks,
  t,
  onChatAgent,
  onCreateProject,
  onOpenWiki,
}: ProjectWorkspaceOverviewProps) {
  if (!project) {
    if (projectCount > 0) {
      return (
        <section
          className="task-workspace-strip task-workspace-header"
          aria-label={t("tasks.overview.label")}
        >
          <div className="task-workspace-strip-main">
            <span className="task-workspace-kicker">
              {t("tasks.allProjects")}
            </span>
            <strong>{t("tasks.issueList")}</strong>
            <span>{t("tasks.allProjectsSummary")}</span>
          </div>
          <div className="task-workspace-actions">
            <button
              type="button"
              className="task-workspace-action task-workspace-action-primary"
              onClick={onCreateProject}
            >
              <strong>{t("tasks.newProjectCta")}</strong>
            </button>
          </div>
        </section>
      );
    }

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

  const stats = projectTaskStats(tasks);
  const activeTaskCount = stats.active;
  const repoURL = project.github_repo_url?.trim();
  const projectSummary = isLoadingTasks
    ? t("tasks.loadingTasks")
    : `${t("tasks.progress")} ${projectProgressPercent(stats)}% · ${countLabel(
        activeTaskCount,
        "active task",
        "active tasks",
        "활성 작업",
        language,
      )} · ${countLabel(
        stats.done,
        "done task",
        "done tasks",
        "완료 작업",
        language,
      )} · ${countLabel(
        stats.review,
        "review task",
        "review tasks",
        "리뷰 작업",
        language,
      )} / ${countLabel(
        stats.blocked,
        "blocked task",
        "blocked tasks",
        "막힌 작업",
        language,
      )}`;

  return (
    <section
      className="task-workspace-strip task-workspace-header"
      aria-label={t("tasks.overview.label")}
    >
      <div className="task-workspace-strip-main">
        <span className="task-workspace-kicker">{t("tasks.project")}</span>
        <strong>{projectWorkspaceName(project, language)}</strong>
        <span>{projectSummary}</span>
      </div>
      <div className="task-workspace-actions">
        <button
          type="button"
          className="task-workspace-action"
          aria-label={t("tasks.openProjectWiki")}
          title={t("tasks.openProjectWiki")}
          onClick={onOpenWiki}
        >
          <strong>{t("tasks.projectWiki")}</strong>
        </button>
        <ProjectLeadControl
          editor={leadAgentEditor}
          fallbackLeadAgent={leadAgent}
          leadMembers={leadMembers}
          project={project}
          t={t}
          onChatAgent={onChatAgent}
        />
        <ProjectGitHubStripItem
          compact={true}
          connector={githubConnector}
          t={t}
          project={project}
          repoURL={repoURL}
          repoReadinessState={repoReadinessState}
        />
      </div>
    </section>
  );
}

interface ProjectLeadControlProps {
  editor: ProjectLeadAgentEditorState;
  fallbackLeadAgent: string;
  leadMembers: ProjectLeadOption[];
  project: Project;
  t: TranslationFn;
  onChatAgent: (agentSlug: string) => void;
}

function ProjectLeadControl({
  editor,
  fallbackLeadAgent,
  leadMembers,
  project,
  t,
  onChatAgent,
}: ProjectLeadControlProps) {
  const currentLead =
    normalizedAgentSlug(project.lead_agent) ??
    normalizedAgentSlug(fallbackLeadAgent) ??
    "ceo";
  const leadOptions = projectLeadOptions(leadMembers, currentLead);
  const isSaving = editor.savingProjectId === project.id;

  return (
    <div className="task-workspace-lead-control">
      <select
        value={currentLead}
        disabled={isSaving}
        onChange={(event) => {
          void editor.assign(project, event.currentTarget.value);
        }}
        aria-label={t("tasks.projectLead")}
      >
        {leadOptions.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => onChatAgent(currentLead)}
        aria-label={`${t("tasks.chatWithAgent")} @${currentLead}`}
      >
        {t("tasks.chatLead")}
      </button>
    </div>
  );
}

interface ProjectGitHubStripItemProps {
  compact?: boolean;
  connector: ProjectGitHubConnectorState;
  project: Project;
  repoReadinessState: ProjectRepoReadinessQueryState;
  repoURL?: string;
  t: TranslationFn;
}

function ProjectGitHubStripItem({
  compact = false,
  connector,
  project,
  repoReadinessState,
  repoURL,
  t,
}: ProjectGitHubStripItemProps) {
  const isEditing = connector.editingProjectId === project.id;
  const isSaving = connector.isSaving(project.id);
  const titleKey = repoReadinessTitleKey(
    repoURL,
    repoReadinessState.readiness,
    repoReadinessState.isLoading,
    repoReadinessState.isError,
  );
  const detailKey = repoReadinessDetailKey(
    repoURL,
    repoReadinessState.readiness,
    repoReadinessState.isLoading,
    repoReadinessState.isError,
  );
  const className = compact
    ? "task-workspace-github-action"
    : "task-workspace-strip-item task-workspace-strip-github";

  return (
    <div className={className}>
      <span className="task-workspace-kicker">GitHub</span>
      <strong>{t(titleKey)}</strong>
      {compact ? null : (
        <span className="task-github-readiness-detail">{t(detailKey)}</span>
      )}
      {!compact && repoReadinessState.readiness?.default_branch ? (
        <span className="task-github-readiness-meta">
          {t("tasks.defaultBranch")}
          {repoReadinessState.readiness.default_branch}
        </span>
      ) : null}
      {repoURL && !isEditing && !compact ? (
        <span className="task-github-readiness-detail">
          {repoReadinessState.readiness?.can_create_coding_tasks
            ? t("tasks.repoCodingEnabled")
            : t("tasks.repoCodingBlocked")}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {repoReadinessState.isLoading ? t("tasks.repoChecking") : ""}
      </span>
      {isEditing ? (
        <ProjectGitHubEditForm
          connector={connector}
          isSaving={isSaving}
          project={project}
          repoReadinessState={repoReadinessState}
          t={t}
        />
      ) : (
        <ProjectGitHubActions
          connector={connector}
          isSaving={isSaving}
          project={project}
          repoReadinessState={repoReadinessState}
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
  repoReadinessState: ProjectRepoReadinessQueryState;
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
  repoReadinessState,
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
          disabled={repoReadinessState.isLoading}
          onClick={repoReadinessState.refetch}
        >
          {repoReadinessState.isLoading
            ? t("tasks.repoChecking")
            : t("tasks.checkGitHubReadiness")}
        </button>
      ) : null}
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
  repoReadinessState: ProjectRepoReadinessQueryState;
  taskCreator: ProjectTaskCreatorState;
  t: TranslationFn;
}

function ProjectWorkRequest({
  project,
  repoReadinessState,
  taskCreator,
  t,
}: ProjectWorkRequestProps) {
  if (!project) return null;
  const repoURL = project.github_repo_url?.trim();
  const canCreateCodingTask = projectCanCreateCodingTask(
    project,
    repoReadinessState.readiness,
  );
  const isCheckingRepo = Boolean(repoURL && repoReadinessState.isLoading);
  const requestModeKey: I18nKey = !repoURL
    ? "tasks.requestModePlanning"
    : isCheckingRepo
      ? "tasks.requestModeRepoChecking"
      : canCreateCodingTask
        ? "tasks.requestModeCoding"
        : "tasks.requestModeRepoSetupNeeded";

  return (
    <section
      className="task-request-panel task-command-bar"
      aria-label={t("tasks.requestComposer")}
    >
      <div className="task-request-panel-head">
        <div>
          <h4>{t("tasks.commandBar")}</h4>
          <p>{t(requestModeKey)}</p>
        </div>
      </div>
      <form
        onSubmit={(event) =>
          taskCreator.handleCreateTask(project, canCreateCodingTask, event)
        }
      >
        <textarea
          value={taskCreator.requestText}
          onChange={(event) =>
            taskCreator.setRequestText(event.currentTarget.value)
          }
          placeholder={t("tasks.requestPlaceholder")}
          aria-label={t("tasks.workRequest")}
          rows={1}
        />
        <button
          type="submit"
          disabled={
            taskCreator.isSubmittingTask ||
            isCheckingRepo ||
            taskCreator.requestText.trim() === ""
          }
        >
          {isCheckingRepo
            ? t("tasks.repoChecking")
            : taskCreator.isSubmittingTask
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

interface ProjectIssueToolbarProps {
  scopeLabel?: string;
  taskCount: number;
  taskView: TaskViewMode;
  t: TranslationFn;
  onTaskViewChange: (view: TaskViewMode) => void;
}

function ProjectIssueToolbar({
  scopeLabel,
  taskCount,
  taskView,
  t,
  onTaskViewChange,
}: ProjectIssueToolbarProps) {
  return (
    <div className="issue-toolbar">
      <div>
        <h4>{t("tasks.issueList")}</h4>
        <span>
          {scopeLabel ? `${scopeLabel} · ` : ""}
          {taskCount} {t("tasks.issueCount")}
        </span>
      </div>
      <div className="issue-view-toggle" title={t("tasks.issueView")}>
        <button
          type="button"
          className={taskView === "list" ? "active" : ""}
          onClick={() => onTaskViewChange("list")}
          aria-pressed={taskView === "list"}
        >
          {t("tasks.viewList")}
        </button>
        <button
          type="button"
          className={taskView === "board" ? "active" : ""}
          onClick={() => onTaskViewChange("board")}
          aria-pressed={taskView === "board"}
        >
          {t("tasks.viewBoard")}
        </button>
      </div>
    </div>
  );
}

interface IssueListProps {
  projectNames: Map<string, string>;
  tasks: Task[];
  t: TranslationFn;
  onOpenTask: (taskId: string) => void;
}

function IssueList({ projectNames, tasks, t, onOpenTask }: IssueListProps) {
  const sortedTasks = sortTasksForIssueList(tasks);

  return (
    <section className="issue-list" aria-label={t("tasks.issueList")}>
      <table>
        <thead>
          <tr>
            <th>{t("tasks.issue")}</th>
            <th>{t("tasks.status")}</th>
            <th>{t("tasks.detail.owner")}</th>
            <th>{t("tasks.delivery")}</th>
            <th>{t("tasks.detail.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => {
            const status = normalizeStatus(task.status);
            const executionBadge = taskExecutionBadge(task);
            const deliveryBadge = taskDeliveryBadge(task, status);
            const updated = task.updated_at ?? task.created_at;
            return (
              <tr key={task.id}>
                <td data-label={t("tasks.issue")}>
                  <button
                    type="button"
                    className="issue-title-button"
                    onClick={() => onOpenTask(task.id)}
                  >
                    <span>{task.title || t("tasks.untitled")}</span>
                    {task.project_id ? (
                      <small>
                        {projectNames.get(task.project_id) ?? task.project_id}
                      </small>
                    ) : null}
                  </button>
                </td>
                <td data-label={t("tasks.status")}>
                  <span className={statusBadgeClass(status)}>
                    {t(COLUMN_LABEL_KEYS[status])}
                  </span>
                </td>
                <td data-label={t("tasks.detail.owner")}>
                  <span className="issue-owner">
                    {task.owner
                      ? `@${task.owner}`
                      : t("tasks.detail.pickOwner")}
                  </span>
                </td>
                <td data-label={t("tasks.delivery")}>
                  <span className="issue-badges">
                    {executionBadge ? (
                      <span className={executionBadge.className}>
                        {t(executionBadge.labelKey)}
                      </span>
                    ) : null}
                    {deliveryBadge ? (
                      <span className={deliveryBadge.className}>
                        {t(deliveryBadge.labelKey)}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td data-label={t("tasks.detail.updated")}>
                  <span className="issue-updated">
                    {updated ? formatRelativeTime(updated) : "-"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const executionBadge = taskExecutionBadge(task);
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
        {executionBadge ? (
          <span className={executionBadge.className}>
            {t(executionBadge.labelKey)}
          </span>
        ) : null}
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
