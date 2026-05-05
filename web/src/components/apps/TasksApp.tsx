import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Xmark } from "iconoir-react";

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
import { formatTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { extractTaggedMentions, renderMentions } from "../../lib/mentions";
import { cn } from "../../lib/utils";
import { type Language, useAppStore } from "../../stores/app";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge, type BadgeProps } from "../ui/badge";
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
const DEFAULT_AGENT = "ceo";

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
type BadgeVariant = NonNullable<BadgeProps["variant"]>;

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

function projectLifecycleBadgeVariant(status: ProjectLifecycle): BadgeVariant {
  switch (status) {
    case "done":
      return "secondary";
    case "in_progress":
      return "default";
    case "waiting":
      return "destructive";
    case "not_started":
      return "outline";
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

function taskStatusBadgeVariant(status: StatusGroup): BadgeVariant {
  if (status === "blocked" || status === "pending") return "destructive";
  if (status === "in_progress") return "default";
  if (status === "done" || status === "canceled") return "secondary";
  return "outline";
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
    const details = ticketDetails.trim();
    setTicketError(null);
    try {
      const { task } = await createTask({
        channel: project.channel || "general",
        created_by: HUMAN_SLUG,
        details: details || undefined,
        human_details: details || undefined,
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
        language={language}
        projectCount={projects.length}
        projectCreator={projectCreator}
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
    <Card>
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
          size="icon"
          variant="outline"
          onClick={onCreateProject}
          aria-label={t("tasks.newProject")}
          title={t("tasks.newProject")}
        >
          <Plus width={16} height={16} />
        </Button>
      </CardHeader>
      {projectCreator.isCreatingProject || projectCreator.projectError ? (
        <CardContent className="space-y-3 pt-0">
          {projectCreator.isCreatingProject ? (
            <ProjectCreateForm projectCreator={projectCreator} t={t} />
          ) : null}
          {projectCreator.projectError ? (
            <p className="text-sm text-destructive">
              {projectCreator.projectError}
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
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
      className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      onSubmit={projectCreator.handleCreateProject}
    >
      <div className="grid gap-2">
        <Label htmlFor="project-name">{t("tasks.projectName")}</Label>
        <Input
          id="project-name"
          type="text"
          value={projectCreator.newProjectName}
          onChange={(event) =>
            projectCreator.setNewProjectName(event.currentTarget.value)
          }
          placeholder={t("tasks.projectName")}
          aria-label={t("tasks.projectName")}
        />
      </div>
      <Button
        type="submit"
        disabled={projectCreator.newProjectName.trim() === ""}
      >
        {t("tasks.create")}
      </Button>
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
      <Card>
        <CardContent className="grid gap-1 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("tasks.noProjects")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tasks.projectListEmpty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
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
        <Badge variant={projectLifecycleBadgeVariant(status)}>
          {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex min-w-[320px] flex-wrap gap-1.5">
          <Badge className="gap-1 font-normal" variant="outline">
            <strong>{countValue(counts.notStarted)}</strong>
            {t("tasks.projectTickets.notStarted")}
          </Badge>
          <Badge className="gap-1 font-normal" variant="outline">
            <strong>{countValue(counts.inProgress)}</strong>
            {t("tasks.projectTickets.inProgress")}
          </Badge>
          <Badge className="gap-1 font-normal" variant="outline">
            <strong>{countValue(counts.waiting)}</strong>
            {t("tasks.projectTickets.waiting")}
          </Badge>
          <Badge className="gap-1 font-normal" variant="outline">
            <strong>{countValue(counts.done)}</strong>
            {t("tasks.projectTickets.done")}
          </Badge>
          <Badge className="gap-1 font-normal" variant="secondary">
            {isStatsReady
              ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
              : "..."}
          </Badge>
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
    <Card>
      <CardHeader className="grid gap-4 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
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
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Badge variant={projectLifecycleBadgeVariant(status)}>
            {isStatsReady ? t(projectLifecycleLabelKey(status)) : "..."}
          </Badge>
          <Badge variant="outline">
            {isStatsReady
              ? countLabel(counts.total, "ticket", "tickets", "티켓", language)
              : t("tasks.loadingTasks")}
          </Badge>
        </div>
      </CardHeader>
    </Card>
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
    <Card>
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
          size="icon"
          variant="outline"
          onClick={() => {
            ticketCreator.setTicketError(null);
            ticketCreator.setIsCreatingTicket(true);
          }}
          aria-label={t("tasks.newTicket")}
          title={t("tasks.newTicket")}
        >
          <Plus width={16} height={16} />
        </Button>
      </CardHeader>
      {ticketCreator.isCreatingTicket || ticketCreator.ticketError ? (
        <CardContent className="space-y-3 pt-0">
          {ticketCreator.isCreatingTicket ? (
            <TicketCreateForm
              members={members}
              project={project}
              ticketCreator={ticketCreator}
              t={t}
            />
          ) : null}
          {ticketCreator.ticketError ? (
            <p className="text-sm text-destructive">
              {ticketCreator.ticketError}
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
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
      className="grid gap-3 rounded-md border bg-muted/20 p-3"
      onSubmit={ticketCreator.handleCreateTicket}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid gap-2">
          <Label htmlFor="ticket-title">{t("tasks.ticketTitle")}</Label>
          <Input
            id="ticket-title"
            type="text"
            value={ticketCreator.ticketTitle}
            onChange={(event) =>
              ticketCreator.setTicketTitle(event.currentTarget.value)
            }
            placeholder={t("tasks.ticketTitle")}
            aria-label={t("tasks.ticketTitle")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ticket-owner">{t("tasks.detail.owner")}</Label>
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
      <div className="grid gap-2">
        <Label htmlFor="ticket-details">{t("tasks.ticketDetails")}</Label>
        <Textarea
          id="ticket-details"
          value={ticketCreator.ticketDetails}
          onChange={(event) =>
            ticketCreator.setTicketDetails(event.currentTarget.value)
          }
          placeholder={t("tasks.ticketDetails")}
          aria-label={t("tasks.ticketDetails")}
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          disabled={ticketCreator.ticketTitle.trim() === ""}
        >
          {t("tasks.createTicket")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => ticketCreator.setIsCreatingTicket(false)}
        >
          {t("tasks.cancel")}
        </Button>
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
      <Card>
        <CardContent className="grid gap-1 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("tasks.noTickets")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tasks.noTicketsDesc")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <section aria-label={t("tasks.tickets")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tasks.ticket")}</TableHead>
                <TableHead className="w-[132px]">{t("tasks.status")}</TableHead>
                <TableHead className="w-[220px]">
                  {t("tasks.detail.owner")}
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
        <Badge variant={taskStatusBadgeVariant(status)}>
          {t(STATUS_LABEL_KEYS[status])}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="block truncate text-sm text-muted-foreground">
          {taskOwnerLabel(task, members, t)}
        </span>
      </TableCell>
    </TableRow>
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
  const status = normalizeStatus(task.status);
  const detail = userEnteredTaskDetails(task) || t("tasks.noTicketDetails");
  const channel = taskChannel(task, project);
  const threadId = task.thread_id || task.id;
  const threadMessagesQuery = useQuery({
    queryKey: ["thread-messages", channel, threadId],
    queryFn: () => getThreadMessages(channel, threadId),
    enabled: Boolean(threadId),
    refetchInterval: TASK_REFETCH_MS,
  });
  const threadMessages = threadMessagesQuery.data?.messages ?? [];
  const commentTargets = ticketCommentTargets(instruction, task, members);
  const routeHint =
    instruction.trim() && commentTargets.length > 0
      ? `${t("tasks.notify")} ${commentTargets.map((slug) => agentLabel(slug, members)).join(", ")}`
      : t("tasks.mentionHint");

  async function handleSendInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || isSending) return;
    const taggedTargets = ticketCommentTargets(text, task, members);
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      await postMessage(text, channel, threadId, taggedTargets);
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
    <Sheet>
      <SheetContent
        className="h-auto w-full gap-0 p-0 sm:max-w-2xl"
        style={{
          maxWidth: "44rem",
          top: "var(--topbar-height, 0px)",
          width: "min(100vw, 44rem)",
        }}
        aria-label={t("tasks.ticketDetails")}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
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
          >
            <Xmark width={18} height={18} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-4 px-6 py-4">
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t("tasks.status")}
              </span>
              <Badge className="w-fit" variant={taskStatusBadgeVariant(status)}>
                {t(STATUS_LABEL_KEYS[status])}
              </Badge>
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

          <section className="mx-6 mb-5 grid max-h-32 gap-2 overflow-auto rounded-md bg-muted/40 p-3">
            <h5 className="text-xs font-medium text-muted-foreground">
              {t("tasks.ticketDetails")}
            </h5>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
              {detail}
            </p>
          </section>

          <Separator />

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSendInstruction}
          >
            <div className="px-6 py-4">
              <h5 className="text-sm font-medium text-foreground">
                {t("tasks.agentInstruction")}
              </h5>
            </div>
            <TicketChatFeed
              isLoading={threadMessagesQuery.isLoading}
              members={members}
              messages={threadMessages}
              t={t}
            />
            <div className="border-t bg-background p-4">
              <div className="overflow-hidden rounded-md border bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <Textarea
                  className="min-h-24 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.currentTarget.value);
                    setSent(false);
                  }}
                  placeholder={t("tasks.agentInstructionPlaceholder")}
                  aria-label={t("tasks.agentInstruction")}
                  rows={4}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t bg-muted/20 p-2">
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
}: {
  isLoading: boolean;
  members: OfficeMember[];
  messages: Message[];
  t: TranslationFn;
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
      <div className="mx-6 flex min-h-72 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        {t("tasks.loadingChat")}
      </div>
    );
  }

  if (visibleMessages.length === 0) {
    return (
      <div className="mx-6 flex min-h-72 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
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

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-5" aria-live="polite">
      {visibleMessages.map((message) => {
        const isHuman = isHumanMessage(message);
        const timestamp = message.timestamp
          ? formatTime(message.timestamp)
          : "";
        return (
          <article
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b py-4 last:border-b-0"
            key={message.id}
          >
            <Avatar className={cn(isHuman ? "bg-primary/10" : "bg-muted")}>
              <AvatarFallback>
                {messageAuthorInitial(message, members, t)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <strong className="truncate text-sm font-medium text-foreground">
                  {messageAuthorLabel(message, members, t)}
                </strong>
                {timestamp ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timestamp}
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  "w-fit max-w-full rounded-md border px-3 py-2 text-sm leading-6",
                  isHuman
                    ? "border-primary/15 bg-primary/5 text-foreground"
                    : "bg-muted/30 text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words">
                  {renderMentions(message.content || "", knownSlugs)}
                </p>
              </div>
            </div>
          </article>
        );
      })}
      <div ref={endRef} />
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
