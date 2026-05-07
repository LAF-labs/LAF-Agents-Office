import {
  type FormEvent,
  type KeyboardEvent,
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
import { Plus } from "iconoir-react";

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
  updateTask,
} from "../../api/client";
import { type OfficeMember, useOfficeMembers } from "../../hooks/useMembers";
import { formatTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { extractTaggedMentions, renderMentions } from "../../lib/mentions";
import { cn } from "../../lib/utils";
import { type Language, useAppStore } from "../../stores/app";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
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

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;
const HUMAN_SLUG = "human";
const DEFAULT_AGENT = "architect";

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

function defaultProjectAgent(
  project: Project | null,
  members: OfficeMember[],
): string {
  return agentSlugs(members, project?.lead_agent || DEFAULT_AGENT)[0] ?? "";
}

function taskOwnerLabel(task: Task, members: OfficeMember[], t: TranslationFn) {
  return task.owner ? agentLabel(task.owner, members) : t("tasks.unassigned");
}

function taskCreatorLabel(
  task: Task,
  members: OfficeMember[],
  t: TranslationFn,
) {
  const creator = task.created_by?.trim();
  if (!creator) return t("tasks.unassigned");
  if (isHumanSlug(creator)) return t("tasks.you");
  return agentLabel(creator, members);
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
  upsertCachedTask(queryClient, task);
}

function agentDisplayName(slug: string, members: OfficeMember[]): string {
  const member = members.find((candidate) => candidate.slug === slug);
  return member?.name?.trim() || `@${slug}`;
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

function extractQuotedHumanDetail(raw: string): string {
  const reportedIssue = raw.match(/(?:reported .*? issue|issue):\s*`([^`]+)`/i);
  if (reportedIssue?.[1]) return reportedIssue[1].trim();

  const quoted = raw.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) return quoted[1].trim();

  const beforeTreat = raw.match(/issue:\s*(.+?)\s+Treat this as/i);
  if (beforeTreat?.[1]) return beforeTreat[1].trim().replace(/^[:\s]+/, "");

  return "";
}

function looksGeneratedTaskDetail(raw: string): boolean {
  return (
    /^Still blocked:/i.test(raw) ||
    /^Automatic error recovery:/i.test(raw) ||
    raw.includes("Automatic error recovery:") ||
    (/^Picking up the reported /i.test(raw) && /bugfix lane/i.test(raw)) ||
    (/^Pick up the .* issue:/i.test(raw) && /Treat this as/i.test(raw)) ||
    (/^No isolated .* worktree/i.test(raw) &&
      /Ticket chat now routes/i.test(raw)) ||
    (/^No isolated .* worktree/i.test(raw) &&
      /The narrow repo fix/i.test(raw)) ||
    (/Inspect the .* flow/i.test(raw) &&
      /report the exact verification/i.test(raw))
  );
}

function userEnteredTaskDetails(task: Task): string {
  const humanDetails = task.human_details?.trim();
  if (humanDetails) {
    const extracted = extractQuotedHumanDetail(humanDetails);
    if (extracted) return extracted;
    return looksGeneratedTaskDetail(humanDetails) ? "" : humanDetails;
  }
  const raw = (task.details || task.description || "").trim();
  if (!raw) return "";
  const extracted = extractQuotedHumanDetail(raw);
  if (extracted) return extracted;
  const creator = (task.created_by || "").trim();
  if (!isHumanSlug(creator)) return "";
  return looksGeneratedTaskDetail(raw) ? "" : raw;
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

function ticketCommentTargets(
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

function activeTicketTypingSlugs(
  members: OfficeMember[],
  task: Task,
): string[] {
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

interface TicketMessageGroup {
  from: string;
  id: string;
  isHuman: boolean;
  messages: Message[];
  minuteKey: string;
}

function ticketMessageMinuteKey(message: Message): string {
  if (!message.timestamp) return message.id;
  const parsed = Date.parse(message.timestamp);
  if (Number.isNaN(parsed)) return `${message.id}:${message.timestamp}`;
  return new Date(parsed).toISOString().slice(0, 16);
}

function groupTicketMessages(messages: Message[]): TicketMessageGroup[] {
  const groups: TicketMessageGroup[] = [];
  for (const message of messages) {
    const from = message.from || "";
    const minuteKey = ticketMessageMinuteKey(message);
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
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  function handleCancelProjectCreate() {
    setIsCreatingProject(false);
    setIsSavingProject(false);
    setNewProjectName("");
    setProjectError(null);
  }

  async function handleCreateProjectFromName(
    nameInput = newProjectName,
  ): Promise<boolean> {
    const name = nameInput.trim();
    if (!name || isSavingProject) return false;
    setProjectError(null);
    setIsSavingProject(true);
    try {
      const { project } = await createProject({
        created_by: HUMAN_SLUG,
        name,
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
      return false;
    } finally {
      setIsSavingProject(false);
    }
    return true;
  }

  return {
    handleCancelProjectCreate,
    handleCreateProjectFromName,
    isCreatingProject,
    isSavingProject,
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
  const [isSavingTicket, setIsSavingTicket] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDetails, setTicketDetails] = useState("");
  const [ticketOwner, setTicketOwner] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);

  function resetTicketDraft() {
    setTicketTitle("");
    setTicketDetails("");
    setTicketOwner(defaultProjectAgent(project, members));
    setTicketError(null);
  }

  function handleOpenTicketDraft() {
    resetTicketDraft();
    setIsCreatingTicket(true);
  }

  function handleCloseTicketDraft() {
    setIsCreatingTicket(false);
    resetTicketDraft();
  }

  useEffect(() => {
    setTicketTitle("");
    setTicketDetails("");
    setTicketOwner(defaultProjectAgent(project, members));
    setTicketError(null);
    setIsCreatingTicket(false);
  }, [project, members]);

  async function persistTicketDraft(
    currentProject: Project,
    title: string,
    owner: string,
    details: string,
  ) {
    setTicketError(null);
    setIsSavingTicket(true);
    try {
      const { task } = await createTask({
        channel: currentProject.channel || "general",
        created_by: HUMAN_SLUG,
        details: details || undefined,
        human_details: details || undefined,
        owner,
        project_id: currentProject.id,
        title,
      });
      const channel = taskChannel(task, currentProject);
      const threadId = task.thread_id || task.id;
      await postTicketAssignmentAck(task, currentProject, owner, t);
      upsertCachedTask(queryClient, task);
      resetTicketDraft();
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
    } finally {
      setIsSavingTicket(false);
    }
  }

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || isSavingTicket) return;
    const title = ticketTitle.trim();
    if (!title) return;
    const owner = ticketOwner.trim() || defaultProjectAgent(project, members);
    await persistTicketDraft(project, title, owner, ticketDetails.trim());
  }

  return {
    handleCloseTicketDraft,
    handleCreateTicket,
    handleOpenTicketDraft,
    isCreatingTicket,
    isSavingTicket,
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
    projectCreator.setNewProjectName("");
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
        projectCreator={projectCreator}
        projects={projects}
        tasks={tasks}
        t={t}
        onCreateProject={handleOpenProjectCreator}
        onFocusProject={setProjectFocusId}
      />
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
              : countLabel(taskCount, "ticket", "tickets", "티켓", language)}
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
  projectCreator: ProjectCreatorState;
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
  projectCreator,
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

  if (projects.length === 0 && !projectCreator.isCreatingProject) {
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
                <TableHead>{t("tasks.projectTable.tickets")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectCreator.isCreatingProject ? (
                <ProjectDraftRow
                  isStatsReady={isStatsReady}
                  language={language}
                  projectCreator={projectCreator}
                  t={t}
                />
              ) : null}
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
            </TableBody>
          </Table>
        </section>
      </CardContent>
    </Card>
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

function ProjectDraftRow({
  isStatsReady,
  language,
  projectCreator,
  t,
}: {
  isStatsReady: boolean;
  language: Language;
  projectCreator: ProjectCreatorState;
  t: TranslationFn;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const counts: ProjectTicketCounts = {
    done: 0,
    inProgress: 0,
    notStarted: 0,
    total: 0,
    waiting: 0,
  };
  const countValue = (value: number) => (isStatsReady ? value : "...");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function commitDraft() {
    const name = projectCreator.newProjectName.trim();
    if (!name) {
      projectCreator.handleCancelProjectCreate();
      return;
    }
    await projectCreator.handleCreateProjectFromName(name);
  }

  return (
    <TableRow className="project-draft-row" data-state="selected">
      <TableCell className="min-w-[220px]">
        <span className="grid min-w-0 gap-1">
          <Input
            ref={inputRef}
            id="project-name"
            className="project-row-input"
            type="text"
            value={projectCreator.newProjectName}
            onBlur={() => {
              void commitDraft();
            }}
            onChange={(event) =>
              projectCreator.setNewProjectName(event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitDraft();
              } else if (event.key === "Escape") {
                event.preventDefault();
                projectCreator.handleCancelProjectCreate();
              }
            }}
            placeholder={t("tasks.projectName")}
            aria-label={t("tasks.projectName")}
            disabled={projectCreator.isSavingProject}
          />
          {projectCreator.projectError ? (
            <small className="project-draft-error">
              {projectCreator.projectError}
            </small>
          ) : null}
        </span>
      </TableCell>
      <TableCell>
        <span className="project-inline-status is-not_started">
          {isStatsReady ? t("tasks.projectStatus.notStarted") : "..."}
        </span>
      </TableCell>
      <TableCell>
        <div className="project-ticket-metrics">
          <span className="project-ticket-metric">
            <strong>{countValue(counts.notStarted)}</strong>
            {t("tasks.projectTickets.notStarted")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.inProgress)}</strong>
            {t("tasks.projectTickets.inProgress")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.waiting)}</strong>
            {t("tasks.projectTickets.waiting")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.done)}</strong>
            {t("tasks.projectTickets.done")}
          </span>
          <span className="project-ticket-metric is-total">
            {isStatsReady
              ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
              : "..."}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="project-draft-cancel"
            onMouseDown={(event) => event.preventDefault()}
            onClick={projectCreator.handleCancelProjectCreate}
            aria-label={t("tasks.cancel")}
            disabled={projectCreator.isSavingProject}
          >
            <TicketPanelCloseIcon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
              {project.id}
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
        <div className="project-ticket-metrics">
          <span className="project-ticket-metric">
            <strong>{countValue(counts.notStarted)}</strong>
            {t("tasks.projectTickets.notStarted")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.inProgress)}</strong>
            {t("tasks.projectTickets.inProgress")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.waiting)}</strong>
            {t("tasks.projectTickets.waiting")}
          </span>
          <span className="project-ticket-metric">
            <strong>{countValue(counts.done)}</strong>
            {t("tasks.projectTickets.done")}
          </span>
          <span className="project-ticket-metric is-total">
            {isStatsReady
              ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
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
  const openTicketDraft = () => {
    onCloseTask();
    ticketCreator.handleOpenTicketDraft();
  };
  const selectTask = (taskId: string) => {
    ticketCreator.handleCloseTicketDraft();
    onSelectTask(taskId);
  };

  return (
    <main className="project-app">
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
        t={t}
        ticketCount={tasks.length}
        onCreateTicket={openTicketDraft}
      />
      <ProjectTicketList
        members={members}
        selectedTaskId={selectedTaskId}
        tasks={sortedTasks}
        t={t}
        onCreateTicket={openTicketDraft}
        onSelectTask={selectTask}
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
      ) : ticketCreator.isCreatingTicket ? (
        <TicketDraftSidePanel
          members={members}
          project={project}
          ticketCreator={ticketCreator}
          t={t}
          onClose={ticketCreator.handleCloseTicketDraft}
        />
      ) : null}
    </main>
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
    <Card className="project-directory-card project-detail-card">
      <CardHeader className="grid gap-4 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-back-button"
          onClick={onBack}
        >
          {t("tasks.backToProjects")}
        </Button>
        <div className="min-w-0">
          <CardTitle>
            <h3 className="truncate text-lg font-semibold leading-none">
              {project.name || project.id}
            </h3>
          </CardTitle>
          <CardDescription className="mt-1">{project.id}</CardDescription>
        </div>
        <div className="project-detail-metrics md:justify-end">
          <span className={cn("project-inline-status", `is-${status}`)}>
            {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
          </span>
          <span className="project-ticket-metric is-total">
            {isStatsReady
              ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
              : t("tasks.loadingTasks")}
          </span>
        </div>
      </CardHeader>
    </Card>
  );
}

function ProjectTicketToolbar({
  language,
  t,
  ticketCount,
  onCreateTicket,
}: {
  language: Language;
  t: TranslationFn;
  ticketCount: number;
  onCreateTicket: () => void;
}) {
  return (
    <Card className="project-directory-card project-ticket-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4">
        <div>
          <CardTitle>
            <h4 className="text-sm font-semibold leading-none">
              {t("tasks.tickets")}
            </h4>
          </CardTitle>
          <CardDescription className="mt-1">
            {countLabel(ticketCount, "ticket", "tickets", "티켓", language)}
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          className="project-create-button"
          onClick={onCreateTicket}
          aria-label={t("tasks.newTicket")}
          title={t("tasks.newTicket")}
        >
          <Plus width={16} height={16} />
          <span>{t("tasks.newTicket")}</span>
        </Button>
      </CardHeader>
    </Card>
  );
}

function TicketDraftSidePanel({
  members,
  project,
  ticketCreator,
  t,
  onClose,
}: {
  members: OfficeMember[];
  project: Project;
  ticketCreator: TicketCreatorState;
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
        className="ticket-side-panel ticket-draft-panel h-auto w-full gap-0 p-0 sm:max-w-2xl"
        style={{
          maxWidth: "40rem",
          top: "var(--topbar-height, 0px)",
          width: "min(100vw, 40rem)",
        }}
        role="complementary"
        aria-label={t("tasks.newTicket")}
      >
        <form
          className="ticket-draft-form flex min-h-0 flex-1 flex-col"
          onSubmit={ticketCreator.handleCreateTicket}
        >
          <div className="ticket-side-panel-header ticket-draft-header flex items-start justify-between gap-4 border-b px-6 py-5">
            <SheetHeader className="min-w-0">
              <SheetDescription>{project.name || project.id}</SheetDescription>
              <SheetTitle className="ticket-draft-title-shell">
                <Input
                  ref={titleRef}
                  id="ticket-title"
                  className="ticket-draft-title-input"
                  type="text"
                  value={ticketCreator.ticketTitle}
                  onChange={(event) =>
                    ticketCreator.setTicketTitle(event.currentTarget.value)
                  }
                  placeholder={t("tasks.ticketTitle")}
                  aria-label={t("tasks.ticketTitle")}
                  disabled={ticketCreator.isSavingTicket}
                />
              </SheetTitle>
            </SheetHeader>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onClose}
              aria-label={t("tasks.close")}
              disabled={ticketCreator.isSavingTicket}
              className="ticket-panel-close"
            >
              <TicketPanelCloseIcon />
            </Button>
          </div>

          <div className="ticket-side-panel-body flex min-h-0 flex-1 flex-col">
            <div className="ticket-side-panel-meta grid grid-cols-2 gap-4 px-6 py-4">
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
                  htmlFor="ticket-owner"
                >
                  {t("tasks.detail.owner")}
                </Label>
                <AgentSelect
                  id="ticket-owner"
                  agent={ticketCreator.ticketOwner}
                  label={t("tasks.detail.owner")}
                  members={members}
                  preferred={project.lead_agent}
                  onChange={ticketCreator.setTicketOwner}
                />
              </div>
            </div>

            <section className="ticket-side-panel-detail ticket-draft-detail mx-6 mb-5 grid gap-2 overflow-y-auto overflow-x-hidden border-y bg-transparent py-3">
              <Label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="ticket-details"
              >
                {t("tasks.ticketDetails")}
              </Label>
              <Textarea
                id="ticket-details"
                className="ticket-draft-details"
                value={ticketCreator.ticketDetails}
                onChange={(event) =>
                  ticketCreator.setTicketDetails(event.currentTarget.value)
                }
                placeholder={t("tasks.ticketDetails")}
                aria-label={t("tasks.ticketDetails")}
                rows={8}
                disabled={ticketCreator.isSavingTicket}
              />
            </section>

            <div className="ticket-draft-footer mt-auto grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t px-6 py-4">
              <span className="truncate text-sm text-destructive">
                {ticketCreator.ticketError ?? ""}
              </span>
              <Button
                type="submit"
                disabled={
                  ticketCreator.ticketTitle.trim() === "" ||
                  ticketCreator.isSavingTicket
                }
              >
                {t("tasks.createTicket")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={ticketCreator.isSavingTicket}
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

function ProjectTicketList({
  members,
  selectedTaskId,
  tasks,
  t,
  onCreateTicket,
  onSelectTask,
}: {
  members: OfficeMember[];
  selectedTaskId: string | null;
  tasks: Task[];
  t: TranslationFn;
  onCreateTicket: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <Card className="project-directory-card project-empty-card">
        <CardContent className="grid gap-3 py-10 text-center">
          <div className="project-empty-icon" aria-hidden="true">
            <Plus width={18} height={18} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("tasks.noTickets")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tasks.noTicketsDesc")}
          </p>
          <Button
            className="project-empty-action"
            type="button"
            variant="outline"
            onClick={onCreateTicket}
          >
            <Plus width={16} height={16} />
            {t("tasks.newTicket")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="project-directory-card project-ticket-list-card">
      <CardContent className="p-0">
        <section aria-label={t("tasks.tickets")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tasks.ticket")}</TableHead>
                <TableHead className="w-[126px]">{t("tasks.status")}</TableHead>
                <TableHead className="w-[190px]">
                  {t("tasks.detail.owner")}
                </TableHead>
                <TableHead className="w-[170px]">
                  {t("tasks.detail.createdBy")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
            </TableBody>
          </Table>
        </section>
      </CardContent>
    </Card>
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
  const detail = userEnteredTaskDetails(task);
  return (
    <TableRow data-state={isSelected ? "selected" : undefined}>
      <TableCell className="min-w-[280px]">
        <Button
          type="button"
          className="h-auto w-full justify-start p-0 text-left font-normal hover:bg-transparent"
          variant="ghost"
          onClick={onSelect}
          aria-current={isSelected ? "true" : undefined}
        >
          <span className="grid min-w-0 gap-1">
            <strong className="truncate text-sm font-medium text-foreground">
              {task.title || t("tasks.untitled")}
            </strong>
            <small className="truncate text-xs text-muted-foreground">
              {task.id}
            </small>
            {detail ? (
              <em className="truncate text-xs not-italic text-muted-foreground">
                {detail}
              </em>
            ) : null}
          </span>
        </Button>
      </TableCell>
      <TableCell>
        <span className={cn("task-inline-status", `is-${status}`)}>
          {t(STATUS_LABEL_KEYS[status])}
        </span>
      </TableCell>
      <TableCell>
        <span className="block truncate text-sm text-muted-foreground">
          {taskOwnerLabel(task, members, t)}
        </span>
      </TableCell>
      <TableCell>
        <span className="block truncate text-sm text-muted-foreground">
          {taskCreatorLabel(task, members, t)}
        </span>
      </TableCell>
    </TableRow>
  );
}

function TicketPanelCloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="ticket-panel-close-icon"
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

function submitTicketCommentOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
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

function TicketDetailSection({
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

  async function persistTicketDetails(clearDetails: boolean) {
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
    <section className="ticket-side-panel-detail mx-6 mb-5 grid gap-3 overflow-x-hidden border-y bg-transparent py-3">
      <div className="ticket-detail-section-head flex items-center justify-between gap-3">
        <h5 className="text-xs font-medium text-muted-foreground">
          {t("tasks.ticketDetails")}
        </h5>
        {isEditingDetails ? null : (
          <div className="ticket-detail-actions flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ticket-detail-action"
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
              className="ticket-detail-action is-danger"
              disabled={!detailText || isClearingDetails}
              onClick={() => void persistTicketDetails(true)}
            >
              {isClearingDetails
                ? t("tasks.detail.deleting")
                : t("tasks.detail.delete")}
            </Button>
          </div>
        )}
      </div>
      {isEditingDetails ? (
        <div className="ticket-detail-edit grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`ticket-edit-title-${task.id}`}>
              {t("tasks.ticketTitle")}
            </Label>
            <Input
              id={`ticket-edit-title-${task.id}`}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              aria-label={t("tasks.ticketTitle")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`ticket-edit-details-${task.id}`}>
              {t("tasks.ticketDetails")}
            </Label>
            <Textarea
              id={`ticket-edit-details-${task.id}`}
              value={draftDetails}
              onChange={(event) => setDraftDetails(event.currentTarget.value)}
              aria-label={t("tasks.ticketDetails")}
              rows={5}
            />
          </div>
          {detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : null}
          <div className="ticket-detail-edit-actions flex justify-end gap-2">
            <Button
              type="button"
              disabled={!draftTitle.trim() || isSavingDetails}
              onClick={() => void persistTicketDetails(false)}
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
            {detailText || t("tasks.noTicketDetails")}
          </p>
          {detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : null}
        </>
      )}
    </section>
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
  const [instruction, setInstruction] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [pendingReply, setPendingReply] = useState<{
    afterMessageId: string | null;
    slugs: string[];
  }>({ afterMessageId: null, slugs: [] });
  const status = normalizeStatus(task.status);
  const channel = taskChannel(task, project);
  const threadId = task.thread_id || task.id;
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
    ...activeTicketTypingSlugs(members, task),
  ]);
  const commentTargets = ticketCommentTargets(instruction, task, members);
  const routeHint =
    instruction.trim() && commentTargets.length > 0
      ? `${t("tasks.notify")} ${commentTargets.map((slug) => agentLabel(slug, members)).join(", ")}`
      : t("tasks.mentionHint");

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
        slugs,
      };
    });
  }, [threadMessages]);

  async function handleSendInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || isSending) return;
    const taggedTargets = ticketCommentTargets(text, task, members);
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      const sentMessage = await postMessage(
        text,
        channel,
        threadId,
        taggedTargets,
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

  return (
    <Sheet>
      <SheetContent
        className="ticket-side-panel h-auto w-full gap-0 p-0 sm:max-w-2xl"
        style={{
          maxWidth: "40rem",
          top: "var(--topbar-height, 0px)",
          width: "min(100vw, 40rem)",
        }}
        role="complementary"
        aria-label={t("tasks.ticketDetails")}
      >
        <div className="ticket-side-panel-header flex items-start justify-between gap-4 border-b px-6 py-5">
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
            className="ticket-panel-close"
          >
            <TicketPanelCloseIcon />
          </Button>
        </div>

        <div className="ticket-side-panel-body flex min-h-0 flex-1 flex-col">
          <div className="ticket-side-panel-meta grid grid-cols-2 gap-4 px-6 py-4">
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

          <TicketDetailSection
            project={project}
            queryClient={queryClient}
            task={task}
            t={t}
          />

          <Separator />

          <form
            className="ticket-side-panel-form flex min-h-0 flex-1 flex-col"
            onSubmit={handleSendInstruction}
          >
            <div className="ticket-chat-heading px-6 py-4">
              <h5 className="text-sm font-medium text-foreground">
                {t("tasks.agentInstruction")}
              </h5>
            </div>
            <TicketChatFeed
              isLoading={threadMessagesQuery.isLoading}
              members={members}
              messages={threadMessages}
              t={t}
              typingSlugs={typingSlugs}
            />
            <div className="ticket-chat-composer-shell border-t bg-background p-4">
              <div className="ticket-chat-composer overflow-hidden border-y bg-transparent shadow-none focus-within:border-ring">
                <Textarea
                  className="ticket-chat-input min-h-24 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.currentTarget.value);
                    setSent(false);
                  }}
                  onKeyDown={submitTicketCommentOnEnter}
                  placeholder={t("tasks.agentInstructionPlaceholder")}
                  aria-label={t("tasks.agentInstruction")}
                  rows={4}
                />
                <div className="ticket-chat-composer-footer grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t bg-transparent p-2">
                  <span
                    className={cn(
                      "truncate text-xs",
                      sendError ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {sendError ? sendError : sent ? t("tasks.sent") : routeHint}
                  </span>
                  <Button
                    type="submit"
                    disabled={!instruction.trim() || isSending}
                  >
                    {isSending
                      ? t("tasks.sending")
                      : t("tasks.sendInstruction")}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TicketChatFeed({
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
      <div className="ticket-chat-empty mx-6 flex min-h-72 flex-1 items-center justify-center border-y border-dashed bg-transparent p-4 text-sm text-muted-foreground">
        {t("tasks.loadingChat")}
      </div>
    );
  }

  if (visibleMessages.length === 0 && typingSlugs.length === 0) {
    return (
      <div className="ticket-chat-empty mx-6 flex min-h-72 flex-1 items-center justify-center border-y border-dashed bg-transparent p-4 text-center text-sm text-muted-foreground">
        <div className="grid gap-1">
          <strong className="font-medium text-foreground">
            {t("tasks.noTicketChat")}
          </strong>
          <span>{t("tasks.noTicketChatHint")}</span>
        </div>
      </div>
    );
  }

  const knownSlugs = agentSlugs(members);
  const messageGroups = groupTicketMessages(visibleMessages);

  return (
    <div
      className="ticket-chat-feed min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent px-6 py-5"
      aria-live="polite"
    >
      <div className="ticket-chat-feed-inner grid gap-3">
        {visibleMessages.length === 0 ? (
          <div className="border-y border-dashed bg-transparent p-4 text-center text-sm text-muted-foreground">
            {t("tasks.noTicketChatHint")}
          </div>
        ) : null}
        {messageGroups.map((group) => (
          <TicketMessageGroupView
            group={group}
            knownSlugs={knownSlugs}
            key={group.id}
            members={members}
            t={t}
          />
        ))}
        {typingSlugs.length > 0 ? (
          <TicketTypingIndicator members={members} slugs={typingSlugs} t={t} />
        ) : null}
      </div>
      <div ref={endRef} />
    </div>
  );
}

function TicketMessageGroupView({
  group,
  knownSlugs,
  members,
  t,
}: {
  group: TicketMessageGroup;
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
        "ticket-message-group flex items-start gap-3",
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
          "ticket-message-stack grid min-w-0 max-w-[82%] gap-1",
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
                "ticket-message-bubble min-w-0 w-fit max-w-full rounded-2xl border px-3 py-2 text-sm leading-6 shadow-none",
                group.isHuman
                  ? "ticket-message-bubble-human rounded-br-md border-primary/30 bg-primary text-primary-foreground"
                  : "ticket-message-bubble-agent rounded-bl-md bg-background text-foreground",
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

function TicketTypingIndicator({
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
        <div className="ticket-typing-bubble w-fit rounded-2xl rounded-bl-md border bg-background px-3 py-2 shadow-none">
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
