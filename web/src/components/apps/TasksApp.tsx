import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { NavArrowLeft, Plus } from "iconoir-react";

import {
  createExecutionPlan,
  createProject,
  createTask,
  type ExecutionEvent,
  type ExecutionPlan,
  type ExecutionReceipt,
  getBridgeAvailability,
  getExecutionPlan,
  getExecutionPlanEvents,
  getOfficeTasks,
  getProjectLocalBindings,
  getProjects,
  getRunnerStatus,
  getThreadMessages,
  type Message,
  type ModelMode,
  type Project,
  postMessage,
  postMessageAs,
  type RunnerStatusResponse,
  type Task,
  updateProject,
  updateTask,
} from "../../api/client";
import { subscribeExecutionPlanEvents } from "../../api/executionEvents";
import { type OfficeMember, useOfficeMembers } from "../../hooks/useMembers";
import { formatTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { extractTaggedMentions, renderMentions } from "../../lib/mentions";
import { cn } from "../../lib/utils";
import { type Language, useAppStore } from "../../stores/app";
import { ModelModeToggle } from "../ModelModeToggle";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { confirm } from "../ui/ConfirmDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Textarea } from "../ui/textarea";
import {
  bridgeDeviceForBinding,
  defaultProjectBinding,
} from "./tasks/bridgeUtils";
import { ProjectBridgeWorkspacePanel } from "./tasks/ProjectBridgeWorkspacePanel";
import { ProjectTaskKanban } from "./tasks/ProjectTaskKanban";
import {
  agentLabel,
  isHumanSlug,
  normalizeStatus,
  STATUS_LABEL_KEYS,
  STATUS_ORDER,
  type StatusGroup,
  taskOwnerLabel,
  userEnteredTaskDetails,
} from "./tasks/taskDisplay";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;
const TASK_PENDING_REPLY_TIMEOUT_MS = 90_000;
const HUMAN_SLUG = "human";
const DEFAULT_AGENT = "ceo";
const DEFAULT_MODEL_MODE: ModelMode = "record_only";

type ProjectCreatorState = ReturnType<typeof useProjectCreator>;
type TaskCreatorState = ReturnType<typeof useTaskCreator>;
type TranslationFn = (key: I18nKey) => string;
type ProjectLifecycle = "not_started" | "in_progress" | "done" | "waiting";
type ProjectTaskCounts = {
  done: number;
  inProgress: number;
  notStarted: number;
  total: number;
  waiting: number;
};
type ProjectSaveState = "idle" | "saving" | "saved" | "error";
type RunnerSignalState =
  | "connected"
  | "loading"
  | "no_runner"
  | "queued"
  | "running"
  | "stale";
type RunnerSignal = {
  labelKey: I18nKey;
  state: RunnerSignalState;
};
type ProjectInfoDraft = {
  additionalInfo: string;
  code: string;
  description: string;
  githubRepoUrl: string;
  name: string;
  recipeFileName: string;
  recipeMarkdown: string;
};

function normalizeProjectCodeInput(value: string) {
  return value
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 12);
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

function projectTaskCounts(tasks: Task[]): ProjectTaskCounts {
  const counts: ProjectTaskCounts = {
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
  counts: ProjectTaskCounts,
): ProjectLifecycle {
  const explicit = normalizeProjectLifecycle(project.status);
  if (explicit) return explicit;
  if (counts.total === 0) return "not_started";
  if (counts.done === counts.total) return "done";
  if (counts.waiting > 0 && counts.inProgress === 0) return "waiting";
  if (counts.inProgress > 0 || counts.done > 0) return "in_progress";
  return "not_started";
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

function runnerSignalFromStatus(
  status: RunnerStatusResponse | undefined,
  isLoading: boolean,
): RunnerSignal {
  if (isLoading && !status) {
    return { labelKey: "tasks.runnerChecking", state: "loading" };
  }

  const jobs = status?.jobs ?? [];
  const runners = status?.runners ?? [];
  const diagnostics = status?.diagnostics ?? [];
  const hasConnectedRunner = runners.some(
    (runner) => runner.status === "connected",
  );
  const hasStaleRunner = runners.some(
    (runner) => runner.status === "stale" || runner.status === "disconnected",
  );
  const hasCriticalRunnerBlocker = diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "critical" &&
      [
        "no_capable_runner",
        "no_connected_runner",
        "runner_missing_execution_mode",
        "runner_missing_git",
        "runner_missing_github_auth",
        "runner_missing_provider",
      ].includes(diagnostic.kind),
  );

  if (jobs.some((job) => job.status === "running" || job.status === "leased")) {
    return { labelKey: "tasks.runnerJobRunning", state: "running" };
  }
  if (jobs.some((job) => job.status === "queued" || job.status === "expired")) {
    if (!hasConnectedRunner || hasCriticalRunnerBlocker) {
      return { labelKey: "tasks.runnerNoCapable", state: "no_runner" };
    }
    return { labelKey: "tasks.runnerJobQueued", state: "queued" };
  }
  if (hasConnectedRunner) {
    return { labelKey: "tasks.runnerConnected", state: "connected" };
  }
  if (hasStaleRunner) {
    return { labelKey: "tasks.runnerStale", state: "stale" };
  }
  return { labelKey: "tasks.runnerNoCapable", state: "no_runner" };
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

function defaultProjectAgent(
  project: Project | null,
  members: OfficeMember[],
): string {
  return agentSlugs(members, project?.lead_agent || DEFAULT_AGENT)[0] ?? "";
}

function updateCachedTask(queryClient: QueryClient, task: Task) {
  queryClient.setQueriesData<{ tasks: Task[] }>(
    { queryKey: ["office-tasks"] },
    (current) => {
      if (!current?.tasks) return current;
      return {
        ...current,
        tasks: current.tasks.map((candidate) =>
          candidate.id === task.id ? task : candidate,
        ),
      };
    },
  );
}

function upsertCachedTask(queryClient: QueryClient, task: Task) {
  queryClient.setQueriesData<{ tasks: Task[] }>(
    { queryKey: ["office-tasks"] },
    (current) => {
      if (!current?.tasks) return current;
      const exists = current.tasks.some(
        (candidate) => candidate.id === task.id,
      );
      return {
        ...current,
        tasks: exists
          ? current.tasks.map((candidate) =>
              candidate.id === task.id ? task : candidate,
            )
          : [task, ...current.tasks],
      };
    },
  );
}

function agentDisplayName(slug: string, members: OfficeMember[]): string {
  const member = members.find((candidate) => candidate.slug === slug);
  return member?.name?.trim() || `@${slug}`;
}

function taskChannel(task: Task, project: Project): string {
  return task.channel || project.channel || "general";
}

function normalizeTaskModelMode(mode?: string | null): ModelMode {
  if (mode === "local_cli") return "my_bridge";
  if (
    mode === "laf_model" ||
    mode === "my_bridge" ||
    mode === "team_bridge" ||
    mode === "record_only"
  ) {
    return mode;
  }
  return DEFAULT_MODEL_MODE;
}

function executionPlanIsTerminal(plan?: ExecutionPlan | null): boolean {
  return ["completed", "failed", "cancelled", "expired"].includes(
    String(plan?.status || ""),
  );
}

function eventPayloadPreview(event: ExecutionEvent): string {
  const payload = event.payload || {};
  for (const key of ["summary", "message", "line", "text", "error"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function assignmentAck(t: TranslationFn): string {
  return t("tasks.assignmentAck");
}

async function postTaskAssignmentAck(
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
    // Task creation should not fail if the lightweight ack cannot post.
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

function messageAuthorInitial(
  message: Message,
  members: OfficeMember[],
  t: TranslationFn,
): string {
  const label = messageAuthorLabel(message, members, t).replace(/^@/, "");
  return label.trim().slice(0, 1).toUpperCase() || "?";
}

function isHumanMessage(message: Message): boolean {
  return message.from === "you" || message.from === "human";
}

function isAgentMessage(message: Message): boolean {
  return !isHumanMessage(message) && message.from !== "system";
}

function taskCommentTargets(
  content: string,
  task: Task,
  members: OfficeMember[],
): string[] {
  const knownSlugs = agentSlugs(members, task.owner || DEFAULT_AGENT);
  const explicitTargets = extractTaggedMentions(content, knownSlugs);
  if (explicitTargets.length > 0) return explicitTargets;
  const owner = task.owner?.trim();
  return owner && !isHumanSlug(owner) ? [owner] : [];
}

function uniqueTypingSlugs(slugs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of slugs) {
    const slug = raw.trim();
    if (!slug || isHumanSlug(slug) || slug === "system" || seen.has(slug))
      continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

function activeTaskTypingSlugs(members: OfficeMember[], task: Task): string[] {
  const owner = task.owner?.trim();
  return uniqueTypingSlugs(
    members
      .filter((member) => {
        if (member.status !== "active") return false;
        if (!owner || isHumanSlug(owner)) return true;
        return member.slug === owner;
      })
      .map((member) => member.slug),
  );
}

function removeRespondedTypingSlugs(
  pendingSlugs: string[],
  messages: Message[],
  afterMessageId: string | null,
): string[] {
  if (pendingSlugs.length === 0) return pendingSlugs;
  const afterIndex = messages.findIndex(
    (message) => message.id === afterMessageId,
  );
  if (afterIndex < 0) return pendingSlugs;
  const responded = new Set<string>();
  for (const message of messages.slice(afterIndex + 1)) {
    if (isAgentMessage(message) && !message.content?.startsWith("[STATUS]")) {
      responded.add(message.from);
    }
  }
  return pendingSlugs.filter((slug) => !responded.has(slug));
}

interface TaskMessageGroup {
  from: string;
  id: string;
  isHuman: boolean;
  messages: Message[];
  minuteKey: string;
}

function taskMessageMinuteKey(message: Message): string {
  if (!message.timestamp) return message.id;
  const parsed = Date.parse(message.timestamp);
  if (Number.isNaN(parsed)) return `${message.id}:${message.timestamp}`;
  return new Date(parsed).toISOString().slice(0, 16);
}

function groupTaskMessages(messages: Message[]): TaskMessageGroup[] {
  const groups: TaskMessageGroup[] = [];
  for (const message of messages) {
    const from = message.from || "";
    const minuteKey = taskMessageMinuteKey(message);
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.from === from &&
      previous.minuteKey === minuteKey
    ) {
      previous.messages.push(message);
      continue;
    }
    groups.push({
      from,
      id: `${from}:${minuteKey}:${message.id}`,
      isHuman: isHumanMessage(message),
      messages: [message],
      minuteKey,
    });
  }
  return groups;
}

function useProjectCreator(
  queryClient: QueryClient,
  onProjectCreated: (projectId: string) => void,
) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [newProjectCode, setNewProjectCode] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectAdditionalInfo, setNewProjectAdditionalInfo] = useState("");
  const [newProjectGitHubRepoUrl, setNewProjectGitHubRepoUrl] = useState("");
  const [newProjectRecipeFileName, setNewProjectRecipeFileName] = useState("");
  const [newProjectRecipeMarkdown, setNewProjectRecipeMarkdown] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  function handleCancelProjectCreate() {
    setIsCreatingProject(false);
    setIsSavingProject(false);
    setNewProjectCode("");
    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectAdditionalInfo("");
    setNewProjectGitHubRepoUrl("");
    setNewProjectRecipeFileName("");
    setNewProjectRecipeMarkdown("");
    setProjectError(null);
  }

  async function handleCreateProject(): Promise<boolean> {
    const name = newProjectName.trim();
    const code = normalizeProjectCodeInput(newProjectCode);
    if (!(name && code) || isSavingProject) return false;
    setProjectError(null);
    setIsSavingProject(true);
    const recipeMarkdown = newProjectRecipeMarkdown.trim();
    const recipeFileName = recipeMarkdown
      ? newProjectRecipeFileName.trim() || "project-brief.md"
      : newProjectRecipeFileName.trim();
    try {
      const { project } = await createProject({
        additional_info: newProjectAdditionalInfo.trim(),
        code,
        created_by: HUMAN_SLUG,
        description: newProjectDescription.trim(),
        github_repo_url: newProjectGitHubRepoUrl.trim(),
        name,
        recipe_filename: recipeFileName,
        recipe_markdown: recipeMarkdown,
      });
      queryClient.setQueryData<{ projects: Project[] }>(
        ["projects"],
        (current) => {
          const projects = current?.projects ?? [];
          const nextProjects = projects.some(
            (candidate) => candidate.id === project.id,
          )
            ? projects.map((candidate) =>
                candidate.id === project.id ? project : candidate,
              )
            : [...projects, project];
          return { projects: nextProjects };
        },
      );
      handleCancelProjectCreate();
      onProjectCreated(project.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create project";
      setProjectError(message);
      return false;
    } finally {
      setIsSavingProject(false);
    }
    return true;
  }

  return {
    handleCancelProjectCreate,
    handleCreateProject,
    isCreatingProject,
    isSavingProject,
    newProjectAdditionalInfo,
    newProjectCode,
    newProjectDescription,
    newProjectGitHubRepoUrl,
    newProjectName,
    newProjectRecipeFileName,
    newProjectRecipeMarkdown,
    projectError,
    setNewProjectAdditionalInfo,
    setNewProjectCode,
    setNewProjectDescription,
    setNewProjectGitHubRepoUrl,
    setIsCreatingProject,
    setNewProjectName,
    setNewProjectRecipeFileName,
    setNewProjectRecipeMarkdown,
    setProjectError,
  };
}

function useTaskCreator(
  queryClient: QueryClient,
  project: Project | null,
  members: OfficeMember[],
  t: TranslationFn,
  onTaskCreated: (taskId: string) => void,
) {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);

  function resetTaskDraft() {
    setTaskTitle("");
    setTaskDetails("");
    setTaskOwner(defaultProjectAgent(project, members));
    setTaskError(null);
  }

  function handleOpenTaskDraft() {
    resetTaskDraft();
    setIsCreatingTask(true);
  }

  function handleCloseTaskDraft() {
    setIsCreatingTask(false);
    resetTaskDraft();
  }

  useEffect(() => {
    setTaskTitle("");
    setTaskDetails("");
    setTaskOwner(defaultProjectAgent(project, members));
    setTaskError(null);
    setIsCreatingTask(false);
  }, [project, members]);

  async function persistTaskDraft(
    currentProject: Project,
    title: string,
    owner: string,
    details: string,
  ) {
    setTaskError(null);
    setIsSavingTask(true);
    try {
      const { task } = await createTask({
        assignee_id: owner,
        assignee_type: isHumanSlug(owner) ? "human" : "agent",
        channel: currentProject.channel || "general",
        created_by: HUMAN_SLUG,
        details: details || undefined,
        human_details: details || undefined,
        model_mode: DEFAULT_MODEL_MODE,
        owner,
        project_id: currentProject.id,
        title,
      });
      const channel = taskChannel(task, currentProject);
      const threadId = task.thread_id || task.id;
      await postTaskAssignmentAck(task, currentProject, owner, t);
      upsertCachedTask(queryClient, task);
      resetTaskDraft();
      setIsCreatingTask(false);
      onTaskCreated(task.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", channel] }),
        queryClient.invalidateQueries({
          queryKey: ["thread-messages", channel, threadId],
        }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create task";
      setTaskError(message);
    } finally {
      setIsSavingTask(false);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || isSavingTask) return;
    const title = taskTitle.trim();
    if (!title) return;
    const owner = taskOwner.trim() || defaultProjectAgent(project, members);
    await persistTaskDraft(project, title, owner, taskDetails.trim());
  }

  return {
    handleCloseTaskDraft,
    handleCreateTask,
    handleOpenTaskDraft,
    isCreatingTask,
    isSavingTask,
    setIsCreatingTask,
    setTaskDetails,
    setTaskError,
    setTaskOwner,
    setTaskTitle,
    taskDetails,
    taskError,
    taskOwner,
    taskTitle,
  };
}

function projectInfoDraftFromProject(project: Project): ProjectInfoDraft {
  return {
    additionalInfo: project.additional_info ?? "",
    code: normalizeProjectCodeInput(project.code ?? ""),
    description: project.description ?? "",
    githubRepoUrl: project.github_repo_url ?? "",
    name: project.name || project.id,
    recipeFileName: project.recipe_filename ?? "",
    recipeMarkdown: project.recipe_markdown ?? "",
  };
}

function useProjectInfoEditor(
  project: Project,
  queryClient: QueryClient,
  t: TranslationFn,
) {
  const [draft, setDraft] = useState<ProjectInfoDraft>(() =>
    projectInfoDraftFromProject(project),
  );
  const [saveState, setSaveState] = useState<ProjectSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<ProjectInfoDraft>(
    projectInfoDraftFromProject(project),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = projectInfoDraftFromProject(project);
    draftRef.current = next;
    setDraft(next);
    setSaveState("idle");
    setError(null);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, [project]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function persist(
    nextDraft = draftRef.current,
    opts?: { clearRecipe?: boolean },
  ) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const code = normalizeProjectCodeInput(nextDraft.code);
    if (!code) {
      setSaveState("error");
      setError(t("tasks.projectCodeRequired"));
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const { project: updated } = await updateProject({
        code,
        id: project.id,
        name: nextDraft.name.trim() || project.name || project.id,
        description: nextDraft.description,
        additional_info: nextDraft.additionalInfo,
        github_repo_url: nextDraft.githubRepoUrl,
        recipe_filename: opts?.clearRecipe
          ? ""
          : nextDraft.recipeFileName.trim(),
        recipe_markdown: opts?.clearRecipe ? "" : nextDraft.recipeMarkdown,
        clear_recipe: opts?.clearRecipe,
        created_by: HUMAN_SLUG,
      });
      queryClient.setQueryData<{ projects: Project[] }>(
        ["projects"],
        (current) => ({
          projects: (current?.projects ?? []).map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        }),
      );
      setDraft(projectInfoDraftFromProject(updated));
      setSaveState("saved");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("tasks.projectInfoSaveFailed");
      setError(message);
      setSaveState("error");
    }
  }

  function schedulePersist(nextDraft: ProjectInfoDraft) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => {
      void persist(nextDraft);
    }, 650);
  }

  function updateField<K extends keyof ProjectInfoDraft>(
    field: K,
    value: ProjectInfoDraft[K],
  ) {
    setDraft((current) => {
      const next = { ...current };
      next[field] = (
        field === "code" ? normalizeProjectCodeInput(String(value)) : value
      ) as ProjectInfoDraft[K];
      draftRef.current = next;
      schedulePersist(next);
      return next;
    });
  }

  async function handleRecipeUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      setSaveState("error");
      setError(t("tasks.projectRecipeMdOnly"));
      return;
    }
    const markdown = await file.text();
    const next = {
      ...draft,
      recipeFileName: file.name,
      recipeMarkdown: markdown,
    };
    draftRef.current = next;
    setDraft(next);
    await persist(next);
  }

  async function clearRecipe() {
    const next = { ...draft, recipeFileName: "", recipeMarkdown: "" };
    draftRef.current = next;
    setDraft(next);
    await persist(next, { clearRecipe: true });
  }

  return {
    clearRecipe,
    draft,
    error,
    handleRecipeUpload,
    persist,
    saveState,
    updateField,
  };
}

export function TasksApp() {
  const queryClient = useQueryClient();
  const projectFocusId = useAppStore((s) => s.projectFocusId);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const selectedTaskId = useAppStore((s) => s.taskFocusId);
  const setSelectedTaskId = useAppStore((s) => s.setTaskFocusId);
  const { language, t } = useI18n();
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
  const projectIds = new Set(projects.map((project) => project.id));
  const projectTaskCount = tasks.filter(
    (task) => task.project_id && projectIds.has(task.project_id),
  ).length;
  const selectedProject = projectFocusId
    ? (projects.find((project) => project.id === projectFocusId) ?? null)
    : null;
  const selectedProjectTasks = selectedProject
    ? tasks.filter((task) => task.project_id === selectedProject.id)
    : [];
  const selectedTask =
    selectedProjectTasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    if (!(allTasksQuery.data && selectedTaskId)) return;
    if (selectedProject && selectedTask) return;
    setSelectedTaskId(null);
  }, [
    allTasksQuery.data,
    selectedProject,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
  ]);

  const taskCreator = useTaskCreator(
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
    projectCreator.setNewProjectName("");
    projectCreator.setNewProjectDescription("");
    projectCreator.setNewProjectAdditionalInfo("");
    projectCreator.setNewProjectGitHubRepoUrl("");
    projectCreator.setNewProjectRecipeFileName("project-brief.md");
    projectCreator.setNewProjectRecipeMarkdown("");
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
        taskCreator={taskCreator}
        t={t}
        onBack={() => setProjectFocusId(null)}
        onCloseTask={() => setSelectedTaskId(null)}
        onSelectTask={setSelectedTaskId}
      />
    );
  }

  return (
    <main className="project-app">
      <ProjectDirectoryToolbar
        isLoadingTasks={allTasksQuery.isLoading}
        isCreatingProject={projectCreator.isCreatingProject}
        language={language}
        projectCount={projects.length}
        t={t}
        taskCount={projectTaskCount}
        onCreateProject={handleOpenProjectCreator}
      />
      <ProjectDirectoryList
        focusedProjectId={projectFocusId}
        isStatsReady={Boolean(allTasksQuery.data)}
        language={language}
        projects={projects}
        tasks={tasks}
        t={t}
        onCreateProject={handleOpenProjectCreator}
        onFocusProject={setProjectFocusId}
      />
      {projectCreator.isCreatingProject ? (
        <ProjectCreateModal
          projectCreator={projectCreator}
          t={t}
          onClose={projectCreator.handleCancelProjectCreate}
        />
      ) : null}
    </main>
  );
}

function TaskWorkspaceState({ children }: { children: string }) {
  return (
    <Card className="m-5">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

interface ProjectDirectoryToolbarProps {
  isLoadingTasks: boolean;
  isCreatingProject: boolean;
  language: Language;
  projectCount: number;
  t: TranslationFn;
  taskCount: number;
  onCreateProject: () => void;
}

function ProjectDirectoryToolbar({
  isLoadingTasks,
  isCreatingProject,
  language,
  projectCount,
  t,
  taskCount,
  onCreateProject,
}: ProjectDirectoryToolbarProps) {
  return (
    <Card className="project-directory-card project-directory-toolbar">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4">
        <div className="min-w-0">
          <CardTitle>
            <h3 className="text-base font-semibold leading-none">
              {t("tasks.projectDirectory.title")}
            </h3>
          </CardTitle>
          <CardDescription className="mt-1">
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
              : countLabel(taskCount, "task", "tasks", "업무", language)}
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          className="project-create-button"
          onClick={onCreateProject}
          disabled={isCreatingProject}
          aria-label={t("tasks.newProject")}
          title={t("tasks.newProject")}
        >
          <Plus width={16} height={16} />
          <span>{t("tasks.newProject")}</span>
        </Button>
      </CardHeader>
    </Card>
  );
}

interface ProjectDirectoryListProps {
  focusedProjectId: string | null;
  isStatsReady: boolean;
  language: Language;
  projects: Project[];
  tasks: Task[];
  t: TranslationFn;
  onCreateProject: () => void;
  onFocusProject: (projectId: string) => void;
}

function ProjectDirectoryList({
  focusedProjectId,
  isStatsReady,
  language,
  projects,
  tasks,
  t,
  onCreateProject,
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
      <Card className="project-directory-card project-empty-card">
        <CardContent className="grid gap-3 py-10 text-center">
          <div className="project-empty-icon" aria-hidden="true">
            <Plus width={18} height={18} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("tasks.noProjects")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tasks.projectListEmpty")}
          </p>
          <Button
            className="project-empty-action"
            type="button"
            variant="outline"
            onClick={onCreateProject}
          >
            <Plus width={16} height={16} />
            {t("tasks.newProject")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="project-directory-card">
      <CardContent className="p-0">
        <section aria-label={t("tasks.projectList")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tasks.projectTable.name")}</TableHead>
                <TableHead className="w-[132px]">
                  {t("tasks.projectTable.status")}
                </TableHead>
                <TableHead>{t("tasks.projectTable.tasks")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const projectTasks = tasks.filter(
                  (task) => task.project_id === project.id,
                );
                const counts = projectTaskCounts(projectTasks);
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
            </TableBody>
          </Table>
        </section>
      </CardContent>
    </Card>
  );
}

interface ProjectDirectoryRowProps {
  counts: ProjectTaskCounts;
  id: string;
  isFocused: boolean;
  isStatsReady: boolean;
  language: Language;
  project: Project;
  status: ProjectLifecycle;
  t: TranslationFn;
  onFocus: () => void;
}

function ProjectCreateModal({
  projectCreator,
  t,
  onClose,
}: {
  projectCreator: ProjectCreatorState;
  t: TranslationFn;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const saving = projectCreator.isSavingProject;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleClose() {
    if (!saving) onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) handleClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") handleClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void projectCreator.handleCreateProject();
  }

  return (
    <div
      className="creation-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-create-title"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <form className="creation-modal" onSubmit={handleSubmit}>
        <header className="creation-modal-header">
          <div>
            <p className="creation-modal-kicker">{t("tasks.newProject")}</p>
            <h2 id="project-create-title">{t("tasks.newProjectModalTitle")}</h2>
            <p>{t("tasks.newProjectModalDescription")}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="creation-modal-close"
            onClick={handleClose}
            aria-label={t("tasks.cancel")}
            disabled={saving}
          >
            <TaskPanelCloseIcon />
          </Button>
        </header>
        <div className="creation-modal-body">
          <section className="creation-modal-section">
            <div className="creation-modal-section-head">
              <h3>{t("tasks.projectName")}</h3>
              <span className="creation-field-badge is-required">
                {t("tasks.requiredField")}
              </span>
            </div>
            <label className="creation-field" htmlFor="project-create-name">
              <span>{t("tasks.projectName")}</span>
              <Input
                ref={nameRef}
                id="project-create-name"
                value={projectCreator.newProjectName}
                onChange={(event) =>
                  projectCreator.setNewProjectName(event.currentTarget.value)
                }
                placeholder={t("tasks.projectNamePlaceholder")}
                aria-label={t("tasks.projectName")}
                disabled={saving}
                required={true}
              />
            </label>
            <label className="creation-field" htmlFor="project-create-code">
              <span>
                {t("tasks.projectCode")}
                <em>{t("tasks.requiredField")}</em>
              </span>
              <Input
                id="project-create-code"
                value={projectCreator.newProjectCode}
                onChange={(event) =>
                  projectCreator.setNewProjectCode(
                    normalizeProjectCodeInput(event.currentTarget.value),
                  )
                }
                placeholder={t("tasks.projectCodePlaceholder")}
                aria-label={t("tasks.projectCode")}
                disabled={saving}
                required={true}
              />
              <small className="creation-field-help">
                {t("tasks.projectCodeHelp")}
              </small>
            </label>
            <label className="creation-field" htmlFor="project-create-github">
              <span>
                {t("tasks.githubRepoUrl")}
                <em>{t("tasks.recommendedField")}</em>
              </span>
              <Input
                id="project-create-github"
                type="url"
                value={projectCreator.newProjectGitHubRepoUrl}
                onChange={(event) =>
                  projectCreator.setNewProjectGitHubRepoUrl(
                    event.currentTarget.value,
                  )
                }
                placeholder="https://github.com/org/repo"
                aria-label={t("tasks.githubRepoUrl")}
                disabled={saving}
              />
            </label>
          </section>

          <section className="creation-modal-section">
            <div className="creation-modal-section-head">
              <div>
                <h3>{t("tasks.projectCreateContextTitle")}</h3>
                <p>{t("tasks.projectCreateContextDescription")}</p>
              </div>
              <span className="creation-field-badge">
                {t("tasks.recommendedField")}
              </span>
            </div>
            <label className="creation-field" htmlFor="project-create-summary">
              <span>{t("tasks.projectCreateSummary")}</span>
              <Textarea
                id="project-create-summary"
                value={projectCreator.newProjectDescription}
                onChange={(event) =>
                  projectCreator.setNewProjectDescription(
                    event.currentTarget.value,
                  )
                }
                placeholder={t("tasks.projectCreateSummaryPlaceholder")}
                rows={4}
                aria-label={t("tasks.projectCreateSummary")}
                disabled={saving}
              />
            </label>
            <label className="creation-field" htmlFor="project-create-notes">
              <span>{t("tasks.projectCreateAdditional")}</span>
              <Textarea
                id="project-create-notes"
                value={projectCreator.newProjectAdditionalInfo}
                onChange={(event) =>
                  projectCreator.setNewProjectAdditionalInfo(
                    event.currentTarget.value,
                  )
                }
                placeholder={t("tasks.projectCreateAdditionalPlaceholder")}
                rows={6}
                aria-label={t("tasks.projectCreateAdditional")}
                disabled={saving}
              />
            </label>
          </section>

          <section className="creation-modal-section is-wide">
            <div className="creation-modal-section-head">
              <div>
                <h3>{t("tasks.projectCreateRecipe")}</h3>
                <p>{t("tasks.projectCreateRecipeDescription")}</p>
              </div>
              <span className="creation-field-badge">
                {t("tasks.recommendedField")}
              </span>
            </div>
            <label
              className="creation-field"
              htmlFor="project-create-recipe-file"
            >
              <span>{t("tasks.projectCreateRecipeFile")}</span>
              <Input
                id="project-create-recipe-file"
                value={projectCreator.newProjectRecipeFileName}
                onChange={(event) =>
                  projectCreator.setNewProjectRecipeFileName(
                    event.currentTarget.value,
                  )
                }
                placeholder={t("tasks.projectCreateRecipeFilePlaceholder")}
                aria-label={t("tasks.projectCreateRecipeFile")}
                disabled={saving}
              />
            </label>
            <label className="creation-field" htmlFor="project-create-recipe">
              <span>{t("tasks.projectCreateRecipe")}</span>
              <Textarea
                id="project-create-recipe"
                value={projectCreator.newProjectRecipeMarkdown}
                onChange={(event) =>
                  projectCreator.setNewProjectRecipeMarkdown(
                    event.currentTarget.value,
                  )
                }
                placeholder={t("tasks.projectCreateRecipePlaceholder")}
                rows={10}
                aria-label={t("tasks.projectCreateRecipe")}
                disabled={saving}
              />
            </label>
          </section>
        </div>
        {projectCreator.projectError ? (
          <p className="creation-modal-error">{projectCreator.projectError}</p>
        ) : null}
        <footer className="creation-modal-footer">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={saving}
          >
            {t("tasks.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              !projectCreator.newProjectName.trim() ||
              !projectCreator.newProjectCode.trim()
            }
          >
            {saving
              ? t("tasks.projectCreateSaving")
              : t("tasks.projectCreateSubmit")}
          </Button>
        </footer>
      </form>
    </div>
  );
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
    <TableRow id={id} data-state={isFocused ? "selected" : undefined}>
      <TableCell className="min-w-[220px]">
        <Button
          type="button"
          className="h-auto w-full justify-start p-0 text-left font-normal hover:bg-transparent"
          variant="ghost"
          onClick={onFocus}
          aria-current={isFocused ? "true" : undefined}
        >
          <span className="grid min-w-0 gap-1">
            <strong className="truncate text-sm font-medium text-foreground">
              {project.name || project.id}
            </strong>
            <small className="truncate text-xs text-muted-foreground">
              {project.code ? `${project.code} · ${project.id}` : project.id}
            </small>
          </span>
        </Button>
      </TableCell>
      <TableCell>
        <span className={cn("project-inline-status", `is-${status}`)}>
          {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
        </span>
      </TableCell>
      <TableCell>
        <div className="project-task-metrics">
          <span className="project-task-metric">
            <strong>{countValue(counts.notStarted)}</strong>
            {t("tasks.projectTasks.notStarted")}
          </span>
          <span className="project-task-metric">
            <strong>{countValue(counts.inProgress)}</strong>
            {t("tasks.projectTasks.inProgress")}
          </span>
          <span className="project-task-metric">
            <strong>{countValue(counts.waiting)}</strong>
            {t("tasks.projectTasks.waiting")}
          </span>
          <span className="project-task-metric">
            <strong>{countValue(counts.done)}</strong>
            {t("tasks.projectTasks.done")}
          </span>
          <span className="project-task-metric is-total">
            {isStatsReady
              ? countLabel(counts.total, "task", "tasks", "업무", language)
              : "..."}
          </span>
        </div>
      </TableCell>
    </TableRow>
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
  taskCreator: TaskCreatorState;
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
  taskCreator,
  t,
  onBack,
  onCloseTask,
  onSelectTask,
}: ProjectDetailViewProps) {
  const sortedTasks = useMemo(() => sortProjectTasks(tasks), [tasks]);
  const counts = projectTaskCounts(tasks);
  const lifecycle = projectLifecycle(project, counts);
  const projectInfoEditor = useProjectInfoEditor(project, queryClient, t);
  const runnerStatusQuery = useQuery({
    queryKey: ["runner-status", project.id],
    queryFn: () => getRunnerStatus({ projectId: project.id }),
    refetchInterval: TASK_REFETCH_MS,
    staleTime: 5_000,
  });
  const runnerSignal = runnerSignalFromStatus(
    runnerStatusQuery.data,
    runnerStatusQuery.isLoading,
  );
  const openTaskDraft = () => {
    onCloseTask();
    taskCreator.handleOpenTaskDraft();
  };
  const selectTask = (taskId: string) => {
    taskCreator.handleCloseTaskDraft();
    onSelectTask(taskId);
  };

  return (
    <main className="project-app project-detail-app">
      <ProjectDetailHeader
        bridgeWorkspace={
          <ProjectBridgeWorkspacePanel
            project={project}
            runnerSignal={runnerSignal}
            runnerStatus={runnerStatusQuery.data}
            t={t}
          />
        }
        codeLocked={tasks.length > 0}
        editor={projectInfoEditor}
        project={project}
        t={t}
        onBack={onBack}
      />
      <div className="project-detail-overview">
        <ProjectTaskToolbar
          counts={counts}
          isStatsReady={isStatsReady}
          language={language}
          runnerSignal={runnerSignal}
          status={lifecycle}
          t={t}
          onCreateTask={openTaskDraft}
        />
      </div>
      <ProjectTaskKanban
        members={members}
        selectedTaskId={selectedTaskId}
        tasks={sortedTasks}
        t={t}
        onCreateTask={openTaskDraft}
        onSelectTask={selectTask}
      />
      {selectedTask ? (
        <TaskSidePanel
          key={selectedTask.id}
          members={members}
          project={project}
          queryClient={queryClient}
          task={selectedTask}
          t={t}
          onClose={onCloseTask}
        />
      ) : taskCreator.isCreatingTask ? (
        <TaskDraftSidePanel
          members={members}
          project={project}
          taskCreator={taskCreator}
          t={t}
          onClose={taskCreator.handleCloseTaskDraft}
        />
      ) : null}
    </main>
  );
}

function ProjectDetailHeader({
  bridgeWorkspace,
  codeLocked,
  editor,
  project,
  t,
  onBack,
}: {
  bridgeWorkspace: ReactNode;
  codeLocked: boolean;
  editor: ReturnType<typeof useProjectInfoEditor>;
  project: Project;
  t: TranslationFn;
  onBack: () => void;
}) {
  const projectCode = project.code || project.id;
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const saveLabel =
    editor.saveState === "saving"
      ? t("tasks.projectInfoSaving")
      : editor.saveState === "saved"
        ? t("tasks.projectInfoSaved")
        : editor.saveState === "error"
          ? editor.error || t("tasks.projectInfoSaveFailed")
          : t("tasks.projectInfoAutosave");
  const showSaveState = isInfoExpanded || editor.saveState !== "idle";

  useEffect(() => {
    if (editor.saveState === "error") setIsInfoExpanded(true);
  }, [editor.saveState]);

  return (
    <section
      className={cn("project-detail-header", isInfoExpanded && "is-expanded")}
      aria-label={project.name || project.id}
    >
      <div className="project-detail-heading">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="project-back-button"
          onClick={onBack}
          aria-label={`${project.name || project.id} ${t("tasks.backToProjects")}`}
        >
          <NavArrowLeft width={18} height={18} aria-hidden="true" />
          <span className="sr-only">{t("tasks.backToProjects")}</span>
        </Button>
        <div className="project-detail-title-block">
          <div className="project-detail-title-row">
            <span className="project-detail-code">{projectCode}</span>
            <h3 className="project-detail-title truncate">
              {project.name || project.id}
            </h3>
          </div>
          <p className="project-detail-subtitle">{project.id}</p>
        </div>
        <div className="project-detail-actions">
          {showSaveState ? (
            <span className={cn("project-info-save-state", editor.saveState)}>
              {saveLabel}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="project-info-toggle"
            aria-expanded={isInfoExpanded}
            onClick={() => setIsInfoExpanded((current) => !current)}
          >
            {isInfoExpanded
              ? t("tasks.projectInfoCollapse")
              : t("tasks.projectInfoExpand")}
          </Button>
        </div>
      </div>
      {isInfoExpanded ? (
        <ProjectInfoPanel
          bridgeWorkspace={bridgeWorkspace}
          codeLocked={codeLocked}
          editor={editor}
          t={t}
        />
      ) : null}
    </section>
  );
}

function ProjectTaskToolbar({
  counts,
  isStatsReady,
  language,
  runnerSignal,
  status,
  t,
  onCreateTask,
}: {
  counts: ProjectTaskCounts;
  isStatsReady: boolean;
  language: Language;
  runnerSignal: RunnerSignal;
  status: ProjectLifecycle;
  t: TranslationFn;
  onCreateTask: () => void;
}) {
  return (
    <Card className="project-directory-card project-task-card">
      <CardHeader className="project-task-toolbar-row flex flex-row items-center justify-between gap-4 space-y-0 p-4">
        <div className="project-detail-metrics">
          <span className={cn("project-inline-status", `is-${status}`)}>
            {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
          </span>
          <span className="project-task-metric is-total">
            {isStatsReady
              ? countLabel(counts.total, "task", "tasks", "업무", language)
              : t("tasks.loadingTasks")}
          </span>
          <span
            className={cn(
              "project-inline-status",
              "is-runner",
              `is-runner-${runnerSignal.state}`,
            )}
          >
            {t(runnerSignal.labelKey)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="project-create-button project-task-create-button"
          onClick={onCreateTask}
          aria-label={t("tasks.newTask")}
          title={t("tasks.newTask")}
        >
          <Plus width={16} height={16} />
          <span>{t("tasks.newTask")}</span>
        </Button>
      </CardHeader>
    </Card>
  );
}

function ProjectInfoPanel({
  bridgeWorkspace,
  codeLocked,
  editor,
  t,
}: {
  bridgeWorkspace: ReactNode;
  codeLocked: boolean;
  editor: ReturnType<typeof useProjectInfoEditor>;
  t: TranslationFn;
}) {
  const recipeInputRef = useRef<HTMLInputElement>(null);

  function commitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.blur();
    void editor.persist();
  }

  return (
    <section
      aria-label={t("tasks.projectInfo")}
      className="project-info-form project-detail-info-panel"
    >
      <div className="project-info-body">
        <div className="project-info-grid">
          <label className="project-info-field" htmlFor="project-info-name">
            <span>{t("tasks.projectInfoName")}</span>
            <Input
              id="project-info-name"
              value={editor.draft.name}
              onBlur={() => void editor.persist()}
              onChange={(event) =>
                editor.updateField("name", event.currentTarget.value)
              }
              onKeyDown={commitOnEnter}
              aria-label={t("tasks.projectInfoName")}
            />
          </label>
          <label className="project-info-field" htmlFor="project-info-code">
            <span>{t("tasks.projectInfoCode")}</span>
            <Input
              id="project-info-code"
              value={editor.draft.code}
              disabled={codeLocked}
              onBlur={() => void editor.persist()}
              onChange={(event) =>
                editor.updateField(
                  "code",
                  normalizeProjectCodeInput(event.currentTarget.value),
                )
              }
              onKeyDown={commitOnEnter}
              placeholder={t("tasks.projectCodePlaceholder")}
              aria-label={t("tasks.projectInfoCode")}
            />
            <small className="project-info-help">
              {codeLocked
                ? t("tasks.projectCodeLocked")
                : t("tasks.projectCodeHelp")}
            </small>
          </label>
          <label className="project-info-field" htmlFor="project-info-github">
            <span>{t("tasks.projectInfoGithub")}</span>
            <Input
              id="project-info-github"
              type="url"
              value={editor.draft.githubRepoUrl}
              onBlur={() => void editor.persist()}
              onChange={(event) =>
                editor.updateField("githubRepoUrl", event.currentTarget.value)
              }
              onKeyDown={commitOnEnter}
              placeholder="https://github.com/org/repo"
              aria-label={t("tasks.projectInfoGithub")}
            />
          </label>
        </div>
        {bridgeWorkspace}
        <label className="project-info-field" htmlFor="project-info-summary">
          <span>{t("tasks.projectInfoSummary")}</span>
          <Textarea
            id="project-info-summary"
            value={editor.draft.description}
            onBlur={() => void editor.persist()}
            onChange={(event) =>
              editor.updateField("description", event.currentTarget.value)
            }
            placeholder={t("tasks.projectInfoSummaryPlaceholder")}
            rows={2}
            aria-label={t("tasks.projectInfoSummary")}
          />
        </label>
        <label className="project-info-field" htmlFor="project-info-additional">
          <span>{t("tasks.projectInfoAdditional")}</span>
          <Textarea
            id="project-info-additional"
            value={editor.draft.additionalInfo}
            onBlur={() => void editor.persist()}
            onChange={(event) =>
              editor.updateField("additionalInfo", event.currentTarget.value)
            }
            placeholder={t("tasks.projectInfoAdditionalPlaceholder")}
            rows={4}
            aria-label={t("tasks.projectInfoAdditional")}
          />
        </label>
        <div className="project-info-field project-recipe-field">
          <div className="project-recipe-heading">
            <span>{t("tasks.projectRecipe")}</span>
            <input
              ref={recipeInputRef}
              type="file"
              accept=".md,text/markdown"
              className="sr-only"
              onChange={editor.handleRecipeUpload}
              aria-label={t("tasks.projectRecipeUpload")}
            />
            <Button
              type="button"
              variant="outline"
              className="project-recipe-upload"
              onClick={() => recipeInputRef.current?.click()}
            >
              {t("tasks.projectRecipeUpload")}
            </Button>
            {editor.draft.recipeFileName ? (
              <Button
                type="button"
                variant="ghost"
                className="project-recipe-clear"
                onClick={() => void editor.clearRecipe()}
              >
                {t("tasks.projectRecipeClear")}
              </Button>
            ) : null}
          </div>
          {editor.draft.recipeFileName ? (
            <>
              <small className="project-recipe-file">
                {editor.draft.recipeFileName}
              </small>
              <Textarea
                value={editor.draft.recipeMarkdown}
                onBlur={() => void editor.persist()}
                onChange={(event) =>
                  editor.updateField(
                    "recipeMarkdown",
                    event.currentTarget.value,
                  )
                }
                rows={7}
                aria-label={t("tasks.projectRecipe")}
              />
            </>
          ) : (
            <p className="project-recipe-empty">
              {t("tasks.projectRecipeEmpty")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function TaskDraftSidePanel({
  members,
  project,
  taskCreator,
  t,
  onClose,
}: {
  members: OfficeMember[];
  project: Project;
  taskCreator: TaskCreatorState;
  t: TranslationFn;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <Sheet>
      <SheetContent
        className="task-side-panel task-draft-panel h-auto w-full gap-0 p-0 sm:max-w-2xl"
        style={{
          maxWidth: "40rem",
          top: "var(--topbar-height, 0px)",
          width: "min(100vw, 40rem)",
        }}
        role="complementary"
        aria-label={t("tasks.newTask")}
      >
        <form
          className="task-draft-form flex min-h-0 flex-1 flex-col"
          onSubmit={taskCreator.handleCreateTask}
        >
          <div className="task-side-panel-header task-draft-header flex items-start justify-between gap-4 border-b px-6 py-5">
            <SheetHeader className="min-w-0">
              <SheetDescription>{project.name || project.id}</SheetDescription>
              <SheetTitle className="task-draft-title-shell">
                <Input
                  ref={titleRef}
                  id="task-title"
                  className="task-draft-title-input"
                  type="text"
                  value={taskCreator.taskTitle}
                  onChange={(event) =>
                    taskCreator.setTaskTitle(event.currentTarget.value)
                  }
                  placeholder={t("tasks.taskTitle")}
                  aria-label={t("tasks.taskTitle")}
                  disabled={taskCreator.isSavingTask}
                />
              </SheetTitle>
            </SheetHeader>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onClose}
              aria-label={t("tasks.close")}
              disabled={taskCreator.isSavingTask}
              className="task-panel-close"
            >
              <TaskPanelCloseIcon />
            </Button>
          </div>

          <div className="task-side-panel-body flex min-h-0 flex-1 flex-col">
            <div className="task-side-panel-meta grid grid-cols-2 gap-4 px-6 py-4">
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("tasks.status")}
                </span>
                <span className="task-inline-status is-open">
                  {t("tasks.status.open")}
                </span>
              </div>
              <div className="grid min-w-0 gap-1">
                <Label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="task-owner"
                >
                  {t("tasks.detail.owner")}
                </Label>
                <AgentSelect
                  id="task-owner"
                  agent={taskCreator.taskOwner}
                  label={t("tasks.detail.owner")}
                  members={members}
                  preferred={project.lead_agent}
                  onChange={taskCreator.setTaskOwner}
                />
              </div>
            </div>

            <section className="task-side-panel-detail task-draft-detail mx-6 mb-5 grid gap-2 overflow-y-auto overflow-x-hidden border-y bg-transparent py-3">
              <Label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="task-details"
              >
                {t("tasks.taskDetails")}
              </Label>
              <Textarea
                id="task-details"
                className="task-draft-details"
                value={taskCreator.taskDetails}
                onChange={(event) =>
                  taskCreator.setTaskDetails(event.currentTarget.value)
                }
                placeholder={t("tasks.taskDetails")}
                aria-label={t("tasks.taskDetails")}
                rows={8}
                disabled={taskCreator.isSavingTask}
              />
            </section>

            <div className="task-draft-footer mt-auto grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t px-6 py-4">
              <span className="truncate text-sm text-destructive">
                {taskCreator.taskError ?? ""}
              </span>
              <Button
                type="submit"
                disabled={
                  taskCreator.taskTitle.trim() === "" ||
                  taskCreator.isSavingTask
                }
              >
                {t("tasks.createTask")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={taskCreator.isSavingTask}
              >
                {t("tasks.cancel")}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TaskPanelCloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="task-panel-close-icon"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <path
        d="M5 5L13 13M13 5L5 13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function submitTaskCommentOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.nativeEvent.isComposing
  ) {
    return;
  }
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function TaskDetailSection({
  project,
  queryClient,
  task,
  t,
}: {
  project: Project;
  queryClient: QueryClient;
  task: Task;
  t: TranslationFn;
}) {
  const detailText = userEnteredTaskDetails(task);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title || "");
  const [draftDetails, setDraftDetails] = useState(detailText);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isClearingDetails, setIsClearingDetails] = useState(false);
  const channel = taskChannel(task, project);

  useEffect(() => {
    setIsEditingDetails(false);
    setDraftTitle(task.title || "");
    setDraftDetails(detailText);
    setDetailError(null);
  }, [task.title, detailText]);

  async function persistTaskDetails(clearDetails: boolean) {
    const title = draftTitle.trim();
    if (!(title || clearDetails)) {
      setDetailError(t("tasks.detail.titleRequired"));
      return;
    }
    const details = clearDetails ? "" : draftDetails.trim();
    setDetailError(null);
    if (clearDetails) setIsClearingDetails(true);
    else setIsSavingDetails(true);

    try {
      const { task: updatedTask } = await updateTask({
        channel,
        clear_details: clearDetails,
        created_by: HUMAN_SLUG,
        details,
        human_details: details,
        id: task.id,
        model_mode: normalizeTaskModelMode(task.model_mode),
        project_id: task.project_id || project.id,
        title: clearDetails ? task.title : title,
      });
      updateCachedTask(queryClient, updatedTask);
      await queryClient.invalidateQueries({ queryKey: ["office-tasks"] });
      setDraftTitle(updatedTask.title || "");
      setDraftDetails(userEnteredTaskDetails(updatedTask));
      setIsEditingDetails(false);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : t("tasks.detail.updateFailed"),
      );
    } finally {
      setIsSavingDetails(false);
      setIsClearingDetails(false);
    }
  }

  return (
    <section className="task-side-panel-detail mx-6 mb-5 grid gap-3 overflow-x-hidden border-y bg-transparent py-3">
      <div className="task-detail-section-head flex items-center justify-between gap-3">
        <h5 className="text-xs font-medium text-muted-foreground">
          {t("tasks.taskDetails")}
        </h5>
        {isEditingDetails ? null : (
          <div className="task-detail-actions flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="task-detail-action"
              onClick={() => {
                setDraftTitle(task.title || "");
                setDraftDetails(detailText);
                setDetailError(null);
                setIsEditingDetails(true);
              }}
            >
              {t("tasks.detail.edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="task-detail-action is-danger"
              disabled={!detailText || isClearingDetails}
              onClick={() => void persistTaskDetails(true)}
            >
              {isClearingDetails
                ? t("tasks.detail.deleting")
                : t("tasks.detail.delete")}
            </Button>
          </div>
        )}
      </div>
      {isEditingDetails ? (
        <div className="task-detail-edit grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`task-edit-title-${task.id}`}>
              {t("tasks.taskTitle")}
            </Label>
            <Input
              id={`task-edit-title-${task.id}`}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              aria-label={t("tasks.taskTitle")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`task-edit-details-${task.id}`}>
              {t("tasks.taskDetails")}
            </Label>
            <Textarea
              id={`task-edit-details-${task.id}`}
              value={draftDetails}
              onChange={(event) => setDraftDetails(event.currentTarget.value)}
              aria-label={t("tasks.taskDetails")}
              rows={5}
            />
          </div>
          {detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : null}
          <div className="task-detail-edit-actions flex justify-end gap-2">
            <Button
              type="button"
              disabled={!draftTitle.trim() || isSavingDetails}
              onClick={() => void persistTaskDetails(false)}
            >
              {isSavingDetails
                ? t("tasks.detail.saving")
                : t("tasks.detail.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditingDetails(false);
                setDraftTitle(task.title || "");
                setDraftDetails(detailText);
                setDetailError(null);
              }}
            >
              {t("tasks.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {detailText || t("tasks.noTaskDetails")}
          </p>
          {detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function taskBridgeBlocker({
  bridgeReason,
  deviceIsOnline,
  hasBinding,
  isLoading,
  modelMode,
  myBridgeAvailable,
  t,
}: {
  bridgeReason?: string;
  deviceIsOnline: boolean;
  hasBinding: boolean;
  isLoading: boolean;
  modelMode: ModelMode;
  myBridgeAvailable: boolean;
  t: TranslationFn;
}): string {
  if (modelMode !== "my_bridge") return "";
  if (isLoading) return t("tasks.bridgeChecking");
  if (!myBridgeAvailable) return bridgeReason || t("tasks.bridgeUnavailable");
  if (!hasBinding) return t("tasks.bridgeNoBindingReason");
  if (!deviceIsOnline) return t("tasks.bridgeBindingOfflineReason");
  return "";
}

function taskRouteHint({
  bridgeBlocker,
  commentTargets,
  instruction,
  members,
  modelMode,
  t,
}: {
  bridgeBlocker: string;
  commentTargets: string[];
  instruction: string;
  members: OfficeMember[];
  modelMode: ModelMode;
  t: TranslationFn;
}): string {
  if (modelMode === "my_bridge") {
    return bridgeBlocker || t("tasks.bridgeReadyToRun");
  }
  if (!instruction.trim() || commentTargets.length === 0) {
    return t("tasks.mentionHint");
  }
  return `${t("tasks.notify")} ${commentTargets
    .map((slug) => agentLabel(slug, members))
    .join(", ")}`;
}

function taskComposerStatusText({
  modelMode,
  routeHint,
  sendError,
  sent,
  t,
}: {
  modelMode: ModelMode;
  routeHint: string;
  sendError: string | null;
  sent: boolean;
  t: TranslationFn;
}): string {
  if (sendError) return sendError;
  if (!sent) return routeHint;
  return modelMode === "my_bridge"
    ? t("tasks.bridgePlanCreated")
    : t("tasks.sent");
}

type BridgeExecutionSubmitResult = { ok: true } | { error: string; ok: false };

function useTaskBridgeExecutionState({
  modelMode,
  projectID,
  queryClient,
  taskID,
  threadKey,
  t,
}: {
  modelMode: ModelMode;
  projectID: string;
  queryClient: QueryClient;
  taskID: string;
  threadKey: string;
  t: TranslationFn;
}) {
  const [createdPlan, setCreatedPlan] = useState<ExecutionPlan | null>(null);
  const bridgeAvailabilityQuery = useQuery({
    queryKey: ["bridge-availability"],
    queryFn: () => getBridgeAvailability(),
    enabled: modelMode === "my_bridge",
    staleTime: 30_000,
  });
  const bridgeBindingsQuery = useQuery({
    queryKey: ["project-local-bindings", projectID],
    queryFn: () => getProjectLocalBindings(projectID),
    enabled: modelMode === "my_bridge",
    staleTime: 15_000,
  });
  const bridgeDevices = bridgeAvailabilityQuery.data?.devices ?? [];
  const bridgeBinding = defaultProjectBinding(
    bridgeBindingsQuery.data?.bindings ?? [],
    bridgeDevices,
  );
  const bridgeDevice = bridgeDeviceForBinding(bridgeBinding, bridgeDevices);
  const bridgeBlocker = taskBridgeBlocker({
    bridgeReason: bridgeAvailabilityQuery.data?.my_bridge.reason,
    deviceIsOnline: bridgeDevice?.status === "online",
    hasBinding: Boolean(bridgeBinding),
    isLoading:
      bridgeAvailabilityQuery.isLoading || bridgeBindingsQuery.isLoading,
    modelMode,
    myBridgeAvailable: Boolean(
      bridgeAvailabilityQuery.data?.my_bridge.available,
    ),
    t,
  });
  const activePlanID = createdPlan?.id || "";
  const executionPlanQuery = useQuery({
    queryKey: ["execution-plan", activePlanID],
    queryFn: () => getExecutionPlan(activePlanID),
    enabled: Boolean(activePlanID),
    refetchInterval: (query) => {
      const latestPlan =
        (query.state.data as { plan?: ExecutionPlan } | undefined)?.plan ??
        createdPlan;
      return activePlanID && !executionPlanIsTerminal(latestPlan)
        ? 3_000
        : false;
    },
  });
  const executionEventsQuery = useQuery({
    queryKey: ["execution-plan-events", activePlanID],
    queryFn: () => getExecutionPlanEvents(activePlanID),
    enabled: Boolean(activePlanID),
    refetchInterval:
      activePlanID && !executionPlanIsTerminal(executionPlanQuery.data?.plan)
        ? 3_000
        : false,
  });
  const executionPlan = executionPlanQuery.data?.plan ?? createdPlan;

  useEffect(() => {
    if (threadKey) setCreatedPlan(null);
  }, [threadKey]);

  useEffect(() => {
    if (!activePlanID) return;
    return subscribeExecutionPlanEvents(activePlanID, () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["execution-plan", activePlanID],
        }),
        queryClient.invalidateQueries({
          queryKey: ["execution-plan-events", activePlanID],
        }),
      ]);
    });
  }, [activePlanID, queryClient]);

  async function submitExecutionPlan(
    text: string,
  ): Promise<BridgeExecutionSubmitResult> {
    if (bridgeBlocker || !bridgeBinding) {
      return {
        error: bridgeBlocker || t("tasks.bridgeNoBindingReason"),
        ok: false,
      };
    }
    try {
      const result = await createExecutionPlan({
        binding_id: bridgeBinding.id,
        device_id: bridgeBinding.device_id,
        message: text,
        mode: "my_bridge",
        provider: "codex",
        task_id: taskID,
      });
      setCreatedPlan(result.plan);
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["execution-plan", result.plan.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["execution-plan-events", result.plan.id],
        }),
      ]);
      return { ok: true };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : t("tasks.bridgePlanFailed"),
        ok: false,
      };
    }
  }

  return {
    activePlanID,
    bridgeBlocker,
    executionEvents: executionEventsQuery.data?.events ?? [],
    executionPlan,
    executionPlanIsLoading: executionPlanQuery.isLoading,
    executionReceipt: executionPlanQuery.data?.receipt ?? null,
    submitExecutionPlan,
  };
}

function useTaskSidePanelController({
  members,
  project,
  queryClient,
  task,
  t,
}: {
  members: OfficeMember[];
  project: Project;
  queryClient: QueryClient;
  task: Task;
  t: TranslationFn;
}) {
  const [instruction, setInstruction] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>(() =>
    normalizeTaskModelMode(task.model_mode),
  );
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [pendingReply, setPendingReply] = useState<{
    afterMessageId: string | null;
    sentAt: number | null;
    slugs: string[];
  }>({ afterMessageId: null, sentAt: null, slugs: [] });
  const status = normalizeStatus(task.status);
  const channel = taskChannel(task, project);
  const threadId = task.thread_id || task.id;
  const threadKey = `${channel}:${threadId}`;
  const previousThreadKeyRef = useRef(threadKey);
  const bridgeExecution = useTaskBridgeExecutionState({
    modelMode,
    projectID: project.id,
    queryClient,
    taskID: task.id,
    threadKey,
    t,
  });
  const threadMessagesQuery = useQuery({
    queryKey: ["thread-messages", channel, threadId],
    queryFn: () => getThreadMessages(channel, threadId),
    enabled: Boolean(threadId),
    refetchInterval: TASK_REFETCH_MS,
  });
  const serverThreadMessages = threadMessagesQuery.data?.messages ?? [];
  const threadMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return serverThreadMessages;
    const seen = new Set(serverThreadMessages.map((message) => message.id));
    return [
      ...serverThreadMessages,
      ...optimisticMessages.filter((message) => !seen.has(message.id)),
    ];
  }, [optimisticMessages, serverThreadMessages]);
  const typingSlugs = uniqueTypingSlugs([
    ...pendingReply.slugs,
    ...activeTaskTypingSlugs(members, task),
  ]);
  const commentTargets = taskCommentTargets(instruction, task, members);
  const routeHint = taskRouteHint({
    bridgeBlocker: bridgeExecution.bridgeBlocker,
    commentTargets,
    instruction,
    members,
    modelMode,
    t,
  });

  useEffect(() => {
    setModelMode(normalizeTaskModelMode(task.model_mode));
  }, [task.model_mode]);

  useEffect(() => {
    setPendingReply((current) => {
      const slugs = removeRespondedTypingSlugs(
        current.slugs,
        threadMessages,
        current.afterMessageId,
      );
      if (slugs.length === current.slugs.length) return current;
      return {
        afterMessageId: slugs.length > 0 ? current.afterMessageId : null,
        sentAt: slugs.length > 0 ? current.sentAt : null,
        slugs,
      };
    });
  }, [threadMessages]);

  useEffect(() => {
    if (previousThreadKeyRef.current === threadKey) return;
    previousThreadKeyRef.current = threadKey;
    setPendingReply({ afterMessageId: null, sentAt: null, slugs: [] });
    setOptimisticMessages([]);
    setSendError(null);
    setSent(false);
  }, [threadKey]);

  useEffect(() => {
    if (
      pendingReply.slugs.length === 0 ||
      typeof pendingReply.sentAt !== "number"
    )
      return;
    const remaining =
      TASK_PENDING_REPLY_TIMEOUT_MS - (Date.now() - pendingReply.sentAt);
    if (remaining <= 0) {
      setPendingReply({ afterMessageId: null, sentAt: null, slugs: [] });
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      setPendingReply({ afterMessageId: null, sentAt: null, slugs: [] });
    }, remaining);
    return () => globalThis.clearTimeout(timeout);
  }, [pendingReply.sentAt, pendingReply.slugs.length]);

  async function submitBridgeExecutionPlan(text: string) {
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      const result = await bridgeExecution.submitExecutionPlan(text);
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      setInstruction("");
      setSent(true);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || isSending) return;
    if (modelMode === "my_bridge") {
      if (bridgeExecution.bridgeBlocker) {
        setSendError(bridgeExecution.bridgeBlocker);
        return;
      }
      confirm({
        cancelLabel: t("common.cancel"),
        confirmLabel: t("tasks.bridgeConfirmSubmit"),
        message: t("tasks.bridgeConfirmMessage"),
        onConfirm: () => submitBridgeExecutionPlan(text),
        title: t("tasks.bridgeConfirmTitle"),
      });
      return;
    }
    const taggedTargets = taskCommentTargets(text, task, members);
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      const sentMessage = await postMessage(
        text,
        channel,
        threadId,
        taggedTargets,
        {
          model_mode: modelMode,
          project_id: project.id,
          scope: "task_execution",
          task_id: task.id,
        },
      );
      const sentMessageId = sentMessage.id || `local-${Date.now()}`;
      setOptimisticMessages((current) =>
        current.some((message) => message.id === sentMessageId)
          ? current
          : [
              ...current,
              {
                channel,
                content: text,
                from: "you",
                id: sentMessageId,
                reply_to: threadId,
                thread_id: threadId,
                timestamp: new Date().toISOString(),
              },
            ],
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", channel] }),
        queryClient.invalidateQueries({
          queryKey: ["thread-messages", channel, threadId],
        }),
      ]);
      setPendingReply({
        afterMessageId: sentMessageId,
        sentAt: Date.now(),
        slugs: taggedTargets,
      });
      setInstruction("");
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("tasks.chatFailed"));
    } finally {
      setIsSending(false);
    }
  }

  return {
    activePlanID: bridgeExecution.activePlanID,
    bridgeBlocker: bridgeExecution.bridgeBlocker,
    executionEvents: bridgeExecution.executionEvents,
    executionPlan: bridgeExecution.executionPlan,
    executionPlanIsLoading: bridgeExecution.executionPlanIsLoading,
    executionReceipt: bridgeExecution.executionReceipt,
    handleInstructionChange: (value: string) => {
      setInstruction(value);
      setSent(false);
    },
    handleSendInstruction,
    instruction,
    isSending,
    modelMode,
    routeHint,
    sendError,
    sent,
    setModelMode,
    status,
    threadMessages,
    threadMessagesIsLoading: threadMessagesQuery.isLoading,
    typingSlugs,
  };
}

function TaskSidePanel({
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
  const controller = useTaskSidePanelController({
    members,
    project,
    queryClient,
    task,
    t,
  });

  return (
    <Sheet>
      <SheetContent
        className="task-side-panel h-auto w-full gap-0 p-0 sm:max-w-2xl"
        style={{
          maxWidth: "40rem",
          top: "var(--topbar-height, 0px)",
          width: "min(100vw, 40rem)",
        }}
        role="complementary"
        aria-label={t("tasks.taskDetails")}
      >
        <TaskSidePanelHeader task={task} t={t} onClose={onClose} />

        <TaskSidePanelBody
          activePlanID={controller.activePlanID}
          bridgeBlocker={controller.bridgeBlocker}
          executionEvents={controller.executionEvents}
          executionPlan={controller.executionPlan}
          executionPlanIsLoading={controller.executionPlanIsLoading}
          executionReceipt={controller.executionReceipt}
          instruction={controller.instruction}
          isSending={controller.isSending}
          members={members}
          modelMode={controller.modelMode}
          project={project}
          queryClient={queryClient}
          routeHint={controller.routeHint}
          sendError={controller.sendError}
          sent={controller.sent}
          status={controller.status}
          task={task}
          t={t}
          threadMessages={controller.threadMessages}
          threadMessagesIsLoading={controller.threadMessagesIsLoading}
          typingSlugs={controller.typingSlugs}
          onInstructionChange={controller.handleInstructionChange}
          onModelModeChange={controller.setModelMode}
          onSubmit={controller.handleSendInstruction}
        />
      </SheetContent>
    </Sheet>
  );
}

function TaskSidePanelBody({
  activePlanID,
  bridgeBlocker,
  executionEvents,
  executionPlan,
  executionPlanIsLoading,
  executionReceipt,
  instruction,
  isSending,
  members,
  modelMode,
  project,
  queryClient,
  routeHint,
  sendError,
  sent,
  status,
  task,
  t,
  threadMessages,
  threadMessagesIsLoading,
  typingSlugs,
  onInstructionChange,
  onModelModeChange,
  onSubmit,
}: {
  activePlanID: string;
  bridgeBlocker: string;
  executionEvents: ExecutionEvent[];
  executionPlan: ExecutionPlan | null;
  executionPlanIsLoading: boolean;
  executionReceipt: ExecutionReceipt | null;
  instruction: string;
  isSending: boolean;
  members: OfficeMember[];
  modelMode: ModelMode;
  project: Project;
  queryClient: QueryClient;
  routeHint: string;
  sendError: string | null;
  sent: boolean;
  status: StatusGroup;
  task: Task;
  t: TranslationFn;
  threadMessages: Message[];
  threadMessagesIsLoading: boolean;
  typingSlugs: string[];
  onInstructionChange: (value: string) => void;
  onModelModeChange: (mode: ModelMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="task-side-panel-body flex min-h-0 flex-1 flex-col">
      <TaskSidePanelMeta members={members} status={status} task={task} t={t} />
      <TaskDetailSection
        project={project}
        queryClient={queryClient}
        task={task}
        t={t}
      />
      <Separator />
      <form
        className="task-side-panel-form flex min-h-0 flex-1 flex-col"
        onSubmit={onSubmit}
      >
        <div className="task-chat-heading px-6 py-4">
          <h5 className="text-sm font-medium text-foreground">
            {t("tasks.agentInstruction")}
          </h5>
        </div>
        <TaskChatFeed
          isLoading={threadMessagesIsLoading}
          members={members}
          messages={threadMessages}
          t={t}
          typingSlugs={typingSlugs}
        />
        {activePlanID ? (
          <BridgeExecutionPanel
            events={executionEvents}
            isLoading={executionPlanIsLoading}
            plan={executionPlan}
            receipt={executionReceipt}
            t={t}
          />
        ) : null}
        <TaskChatComposer
          bridgeBlocker={bridgeBlocker}
          instruction={instruction}
          isSending={isSending}
          modelMode={modelMode}
          routeHint={routeHint}
          sendError={sendError}
          sent={sent}
          t={t}
          onInstructionChange={onInstructionChange}
          onModelModeChange={onModelModeChange}
        />
      </form>
    </div>
  );
}

function TaskSidePanelHeader({
  task,
  t,
  onClose,
}: {
  task: Task;
  t: TranslationFn;
  onClose: () => void;
}) {
  return (
    <div className="task-side-panel-header flex items-start justify-between gap-4 border-b px-6 py-5">
      <SheetHeader className="min-w-0">
        <SheetDescription>{task.id}</SheetDescription>
        <SheetTitle className="truncate">
          {task.title || t("tasks.untitled")}
        </SheetTitle>
      </SheetHeader>
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={onClose}
        aria-label={t("tasks.close")}
        className="task-panel-close"
      >
        <TaskPanelCloseIcon />
      </Button>
    </div>
  );
}

function TaskSidePanelMeta({
  members,
  status,
  task,
  t,
}: {
  members: OfficeMember[];
  status: StatusGroup;
  task: Task;
  t: TranslationFn;
}) {
  return (
    <div className="task-side-panel-meta grid grid-cols-2 gap-4 px-6 py-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("tasks.status")}
        </span>
        <span className={cn("task-inline-status", `is-${status}`)}>
          {t(STATUS_LABEL_KEYS[status])}
        </span>
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("tasks.detail.owner")}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {taskOwnerLabel(task, members, t)}
        </span>
      </div>
    </div>
  );
}

function TaskChatComposer({
  bridgeBlocker,
  instruction,
  isSending,
  modelMode,
  routeHint,
  sendError,
  sent,
  t,
  onInstructionChange,
  onModelModeChange,
}: {
  bridgeBlocker: string;
  instruction: string;
  isSending: boolean;
  modelMode: ModelMode;
  routeHint: string;
  sendError: string | null;
  sent: boolean;
  t: TranslationFn;
  onInstructionChange: (value: string) => void;
  onModelModeChange: (mode: ModelMode) => void;
}) {
  const statusText = taskComposerStatusText({
    modelMode,
    routeHint,
    sendError,
    sent,
    t,
  });

  return (
    <div className="task-chat-composer-shell border-t bg-background p-4">
      <div className="task-chat-composer overflow-hidden border-y bg-transparent shadow-none focus-within:border-ring">
        <Textarea
          className="task-chat-input min-h-24 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          value={instruction}
          onChange={(event) => onInstructionChange(event.currentTarget.value)}
          onKeyDown={submitTaskCommentOnEnter}
          placeholder={t("tasks.agentInstructionPlaceholder")}
          aria-label={t("tasks.agentInstruction")}
          rows={4}
        />
        <div className="task-chat-composer-footer grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t bg-transparent p-2">
          <div className="grid min-w-0 gap-2">
            <span
              className={cn(
                "truncate text-xs",
                sendError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {statusText}
            </span>
            <ModelModeToggle value={modelMode} onChange={onModelModeChange} />
          </div>
          <Button
            type="submit"
            disabled={
              !instruction.trim() ||
              isSending ||
              (modelMode === "my_bridge" && Boolean(bridgeBlocker))
            }
          >
            {isSending
              ? t("tasks.sending")
              : modelMode === "my_bridge"
                ? t("tasks.createExecutionPlan")
                : t("tasks.sendInstruction")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BridgeExecutionPanel({
  events,
  isLoading,
  plan,
  receipt,
  t,
}: {
  events: ExecutionEvent[];
  isLoading: boolean;
  plan: ExecutionPlan | null;
  receipt: ExecutionReceipt | null;
  t: TranslationFn;
}) {
  const status = plan?.status || (isLoading ? "loading" : "pending");
  return (
    <section
      className="task-bridge-execution mx-6 mb-4 grid gap-3 border-y bg-transparent py-3"
      aria-label={t("tasks.bridgeExecution")}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h5 className="text-sm font-medium text-foreground">
            {t("tasks.bridgeExecution")}
          </h5>
          <p className="text-xs text-muted-foreground">
            {t("tasks.bridgeExecutionStatus")} {status}
          </p>
        </div>
        <span className={cn("task-inline-status", `is-${status}`)}>
          {status}
        </span>
      </div>

      {events.length > 0 ? (
        <ol className="task-bridge-event-list">
          {events.slice(-5).map((event) => (
            <li className="task-bridge-event" key={event.id}>
              <span>{event.event_type}</span>
              <p>{eventPayloadPreview(event) || t("tasks.bridgeEvent")}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("tasks.bridgeExecutionNoEvents")}
        </p>
      )}

      {receipt ? (
        <div className="task-bridge-receipt">
          <div className="text-xs font-medium text-muted-foreground">
            {t("tasks.bridgeExecutionReceipt")}
          </div>
          <p>{receipt.summary || t("tasks.bridgeExecutionReceiptEmpty")}</p>
        </div>
      ) : null}
    </section>
  );
}

function TaskChatFeed({
  isLoading,
  members,
  messages,
  t,
  typingSlugs,
}: {
  isLoading: boolean;
  members: OfficeMember[];
  messages: Message[];
  t: TranslationFn;
  typingSlugs: string[];
}) {
  const visibleMessages = messages.filter(
    (message) => !message.content?.startsWith("[STATUS]"),
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  });

  if (isLoading) {
    return (
      <div className="task-chat-empty mx-6 flex min-h-72 flex-1 items-center justify-center border-y border-dashed bg-transparent p-4 text-sm text-muted-foreground">
        {t("tasks.loadingChat")}
      </div>
    );
  }

  if (visibleMessages.length === 0 && typingSlugs.length === 0) {
    return (
      <div className="task-chat-empty mx-6 flex min-h-72 flex-1 items-center justify-center border-y border-dashed bg-transparent p-4 text-center text-sm text-muted-foreground">
        <div className="grid gap-1">
          <strong className="font-medium text-foreground">
            {t("tasks.noTaskChat")}
          </strong>
          <span>{t("tasks.noTaskChatHint")}</span>
        </div>
      </div>
    );
  }

  const knownSlugs = agentSlugs(members);
  const messageGroups = groupTaskMessages(visibleMessages);

  return (
    <div
      className="task-chat-feed min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent px-6 py-5"
      aria-live="polite"
    >
      <div className="task-chat-feed-inner grid gap-3">
        {visibleMessages.length === 0 ? (
          <div className="border-y border-dashed bg-transparent p-4 text-center text-sm text-muted-foreground">
            {t("tasks.noTaskChatHint")}
          </div>
        ) : null}
        {messageGroups.map((group) => (
          <TaskMessageGroupView
            group={group}
            knownSlugs={knownSlugs}
            key={group.id}
            members={members}
            t={t}
          />
        ))}
        {typingSlugs.length > 0 ? (
          <TaskTypingIndicator members={members} slugs={typingSlugs} t={t} />
        ) : null}
      </div>
      <div ref={endRef} />
    </div>
  );
}

function TaskMessageGroupView({
  group,
  knownSlugs,
  members,
  t,
}: {
  group: TaskMessageGroup;
  knownSlugs: string[];
  members: OfficeMember[];
  t: TranslationFn;
}) {
  const [firstMessage] = group.messages;
  const timestamp = firstMessage?.timestamp
    ? formatTime(firstMessage.timestamp)
    : "";

  return (
    <article
      className={cn(
        "task-message-group flex items-start gap-3",
        group.isHuman ? "justify-end" : "justify-start",
      )}
    >
      {group.isHuman || !firstMessage ? null : (
        <Avatar className="h-8 w-8 bg-muted">
          <AvatarFallback>
            {messageAuthorInitial(firstMessage, members, t)}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "task-message-stack grid min-w-0 max-w-[82%] gap-1",
          group.isHuman ? "justify-items-end" : "justify-items-start",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            group.isHuman ? "justify-end" : "justify-start",
          )}
        >
          <strong className="truncate text-xs font-medium text-foreground">
            {firstMessage ? messageAuthorLabel(firstMessage, members, t) : ""}
          </strong>
          {timestamp ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {timestamp}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "grid gap-1",
            group.isHuman ? "justify-items-end" : "justify-items-start",
          )}
        >
          {group.messages.map((message) => (
            <div
              className={cn(
                "task-message-bubble min-w-0 w-fit max-w-full rounded-2xl border px-3 py-2 text-sm leading-6 shadow-none",
                group.isHuman
                  ? "task-message-bubble-human rounded-br-md border-primary/30 bg-primary text-primary-foreground"
                  : "task-message-bubble-agent rounded-bl-md bg-background text-foreground",
              )}
              key={message.id}
            >
              <p className="whitespace-pre-wrap break-words">
                {renderMentions(message.content || "", knownSlugs)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function TaskTypingIndicator({
  members,
  slugs,
  t,
}: {
  members: OfficeMember[];
  slugs: string[];
  t: TranslationFn;
}) {
  const names = slugs.map((slug) => agentDisplayName(slug, members));
  const label =
    names.length === 1
      ? `${names[0]} ${t("tasks.isTyping")}`
      : `${names.join(", ")} ${t("tasks.areTyping")}`;
  const firstSlug = slugs[0] || "agent";

  return (
    <div className="flex items-end gap-3" role="status">
      <Avatar className="h-8 w-8 bg-muted">
        <AvatarFallback>
          {(
            agentDisplayName(firstSlug, members).trim().slice(0, 1) || "?"
          ).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 max-w-[82%] justify-items-start gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <div className="task-typing-bubble w-fit rounded-2xl rounded-bl-md border bg-background px-3 py-2 shadow-none">
          <div className="typing-dots" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentSelect({
  agent,
  id,
  label,
  members,
  preferred,
  onChange,
}: {
  agent: string;
  id?: string;
  label: string;
  members: OfficeMember[];
  preferred?: string;
  onChange: (agent: string) => void;
}) {
  const options = agentSlugs(members, agent || preferred || DEFAULT_AGENT);
  return (
    <Select
      id={id}
      value={agent || options[0] || ""}
      onChange={(event) => onChange(event.currentTarget.value)}
      aria-label={label}
    >
      {options.map((slug) => (
        <option key={slug} value={slug}>
          {agentLabel(slug, members)}
        </option>
      ))}
    </Select>
  );
}
