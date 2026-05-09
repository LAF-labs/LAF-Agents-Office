/**
 * Typed LAFOfficeAPI client.
 * Mirrors every method from the legacy IIFE in index.legacy.html.
 */

const apiBase = "/api";
let brokerDirect = "http://localhost:7890";
let useProxy = true;
let token: string | null = null;

// ── Init ──

export async function initApi(): Promise<void> {
  try {
    const r = await fetch("/api-token", { credentials: "include" });
    if (!r.ok) {
      useProxy = true;
      token = null;
      return;
    }
    const data = await r.json();
    const { broker_url: brokerURL, token: apiToken } = data;
    token = apiToken;
    if (brokerURL) {
      brokerDirect = String(brokerURL).replace(/\/+$/, "");
    }
    useProxy = true;
  } catch {
    useProxy = false;
    try {
      const r = await fetch(`${brokerDirect}/web-token`, {
        credentials: "include",
      });
      const data = await r.json();
      const { token: apiToken } = data;
      token = apiToken;
    } catch {
      // broker unreachable — will fail on first request
    }
  }
}

// ── Internal helpers ──

function baseURL(): string {
  return useProxy ? apiBase : brokerDirect;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (!useProxy && token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function get<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  let url = baseURL() + path;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== null)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const r = await fetch(url, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).trim();
    throw new Error(text || `${r.status} ${r.statusText}`);
  }
  return r.json();
}

export async function getText(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<string> {
  let url = baseURL() + path;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== null)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const r = await fetch(url, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).trim();
    throw new Error(text || `${r.status} ${r.statusText}`);
  }
  return r.text();
}

export async function post<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(baseURL() + path, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).trim();
    throw new Error(text || `${r.status} ${r.statusText}`);
  }
  return r.json();
}

export async function postWithTimeout<T = unknown>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(baseURL() + path, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) {
      const text = (await r.text().catch(() => "")).trim();
      throw new Error(text || `${r.status} ${r.statusText}`);
    }
    return r.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function del<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(baseURL() + path, {
    method: "DELETE",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).trim();
    throw new Error(text || `${r.status} ${r.statusText}`);
  }
  return r.json();
}

// ── SSE ──

export function sseURL(path: string): string {
  let url = baseURL() + path;
  if (!useProxy && token) url += `?token=${encodeURIComponent(token)}`;
  return url;
}

// ── Auth/session ──

export interface WorkspaceTeam {
  id: string;
  name: string;
  slug: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  team_id: string;
  role: "owner" | "admin" | "member" | string;
  status: string;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUser;
  team?: WorkspaceTeam;
}

export function getAuthSession() {
  return get<AuthSessionResponse>("/auth/session");
}

export function getAuthUsers() {
  return get<{ users: AuthUser[] }>("/auth/users");
}

export function signup(body: {
  email: string;
  name: string;
  password: string;
  team_action: "create" | "join";
  team_name?: string;
  invite_token?: string;
}) {
  return post<{ user: AuthUser; team: WorkspaceTeam }>("/auth/signup", body);
}

export function login(body: { email: string; password: string }) {
  return post<{ user: AuthUser; team: WorkspaceTeam }>("/auth/login", body);
}

export function logout() {
  return post<{ status: string }>("/auth/logout", {});
}

export async function patchJSON<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(baseURL() + path, {
    method: "PATCH",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).trim();
    throw new Error(text || `${r.status} ${r.statusText}`);
  }
  return r.json();
}

export function updateAuthUserRole(body: {
  user_id: string;
  role: "owner" | "admin" | "member";
}) {
  return patchJSON<{ user: AuthUser; users: AuthUser[] }>("/auth/users", body);
}

export interface HumanIdentity {
  name: string;
  email: string;
  slug: string;
}

export function getHumans() {
  return get<{ humans: HumanIdentity[] }>("/humans");
}

export function getTeams() {
  return get<{ teams: WorkspaceTeam[] }>("/teams");
}

// ── Messages ──

export interface Message {
  id: string;
  from: string;
  channel: string;
  content: string;
  timestamp: string;
  reply_to?: string;
  thread_id?: string;
  thread_count?: number;
  reactions?: Record<string, string[]>;
  tagged?: string[];
  usage?: TokenUsage;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
}

export function getMessages(
  channel: string,
  sinceId?: string | null,
  limit = 50,
) {
  return get<{ messages: Message[] }>("/messages", {
    channel: channel || "general",
    viewer_slug: "human",
    since_id: sinceId ?? null,
    limit,
  });
}

export function postMessage(
  content: string,
  channel: string,
  replyTo?: string,
  tagged?: string[],
) {
  return postMessageAs("you", content, channel, replyTo, tagged);
}

export function postMessageAs(
  from: string,
  content: string,
  channel: string,
  replyTo?: string,
  tagged?: string[],
) {
  const body: Record<string, string | string[]> = {
    from,
    channel: channel || "general",
    content,
  };
  if (replyTo) body.reply_to = replyTo;
  if (tagged && tagged.length > 0) body.tagged = tagged;
  return post<Message>("/messages", body);
}

export function getThreadMessages(channel: string, threadId: string) {
  return get<{ messages: Message[] }>("/messages", {
    channel: channel || "general",
    thread_id: threadId,
    viewer_slug: "human",
    limit: 50,
  });
}

export function toggleReaction(msgId: string, emoji: string, channel: string) {
  return post("/messages/react", {
    message_id: msgId,
    emoji,
    channel: channel || "general",
  });
}

// ── Slash-command registry ──

/**
 * One entry from GET /commands. Mirrors the broker's `commandDescriptor`
 * shape in internal/team/broker_commands.go. Sorted alphabetically by the
 * broker — callers do not need to re-sort.
 */
export interface SlashCommandDescriptor {
  name: string;
  description: string;
  /** True when the web composer has a real handler for this command. */
  webSupported: boolean;
}

/**
 * Fetch the canonical slash-command registry from the broker. The web
 * autocomplete filters to webSupported=true; other callers may want the
 * full set for discovery.
 */
export function fetchCommands() {
  return get<SlashCommandDescriptor[]>("/commands");
}

export interface RunSlashCommandResponse {
  output: string;
  message: Message;
}

export function runSlashCommand(input: string, channel: string) {
  return post<RunSlashCommandResponse>("/commands/run", { input, channel });
}

// ── Members ──

export interface ProviderBinding {
  kind?: string;
  model?: string;
}

export interface OfficeMember {
  slug: string;
  name: string;
  role: string;
  emoji?: string;
  status?: string;
  activity?: string;
  detail?: string;
  liveActivity?: string;
  lastTime?: string;
  task?: string;
  channel?: string;
  provider?: ProviderBinding | string;
  /** Broker-provided: serialized as `built_in`. Built-ins are the protected core team. */
  built_in?: boolean;
  /** Per-channel disabled state when the list is sourced from `/members?channel=…`. */
  disabled?: boolean;
}

export function getOfficeMembers() {
  return get<{ members: OfficeMember[] }>("/office-members");
}

export function createOfficeMember(body: {
  slug: string;
  name: string;
  role?: string;
  expertise?: string[];
  personality?: string;
  permission_mode?: string;
  created_by?: string;
  provider?: ProviderBinding;
}) {
  return post<{ member: OfficeMember }>("/office-members", {
    action: "create",
    created_by: "agent-maker",
    ...body,
  });
}

export interface HumanTeamMember {
  id: string;
  email: string;
  name: string;
  role?: string;
  channel?: string;
  status: string;
  invite_id?: string;
  invited_by?: string;
  joined_at?: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  name?: string;
  role?: string;
  channel?: string;
  token?: string;
  status: string;
  created_by?: string;
  created_at?: string;
  expires_at?: string;
  accepted_at?: string;
  accepted_by?: string;
  sent_at?: string;
  send_status?: string;
  send_error?: string;
  invite_url?: string;
  mailto_url?: string;
}

export function getInvites(inviteBaseURL?: string) {
  return get<{ invites: TeamInvite[]; human_members: HumanTeamMember[] }>(
    "/invites",
    { base_url: inviteBaseURL },
  );
}

export function createInvite(body: {
  email: string;
  name?: string;
  role?: string;
  channel?: string;
  created_by?: string;
  base_url?: string;
}) {
  return post<{
    invite: TeamInvite;
    invite_url: string;
    email_sent: boolean;
  }>("/invites", {
    created_by: "human",
    ...body,
  });
}

export function lookupInvite(inviteToken: string) {
  return get<{ invite: TeamInvite }>("/invites/lookup", { token: inviteToken });
}

export function acceptInvite(body: {
  token: string;
  name: string;
  email?: string;
}) {
  return post<{ member: HumanTeamMember; invite: TeamInvite }>(
    "/invites/accept",
    body,
  );
}

export interface GeneratedAgentTemplate {
  slug?: string;
  name?: string;
  role?: string;
  emoji?: string;
  expertise?: string[];
  personality?: string;
  provider?: string;
  model?: string;
}

export function generateAgent(prompt: string) {
  return post<GeneratedAgentTemplate>("/office-members/generate", { prompt });
}

export function getMembers(channel: string) {
  return get<{ members: OfficeMember[] }>("/members", {
    channel: channel || "general",
    viewer_slug: "human",
  });
}

// ── Channels ──

export interface Channel {
  slug: string;
  name: string;
  description?: string;
  type?: string;
  created_by?: string;
  members?: string[];
}

export interface DMChannelResponse extends Channel {
  id?: string;
  created?: boolean;
}

export function getChannels() {
  return get<{ channels: Channel[] }>("/channels");
}

export function createChannel(slug: string, name: string, description: string) {
  return post("/channels", {
    action: "create",
    slug,
    name: name || slug,
    description,
    created_by: "you",
  });
}

export function generateChannel(prompt: string) {
  return post<Channel>("/channels/generate", { prompt });
}

export function createDM(agentSlug: string) {
  return post<DMChannelResponse>("/channels/dm", {
    members: ["human", agentSlug],
    type: "direct",
  });
}

// ── Requests ──

export interface InterviewOption {
  id: string;
  label: string;
  description?: string;
  requires_text?: boolean;
  text_hint?: string;
}

export interface AgentRequest {
  id: string;
  from: string;
  question: string;
  /** Legacy field name; broker now returns `options`. Kept for compatibility. */
  choices?: InterviewOption[];
  options?: InterviewOption[];
  channel?: string;
  title?: string;
  context?: string;
  kind?: string;
  timestamp?: string;
  status?: string;
  blocking?: boolean;
  required?: boolean;
  recommended_id?: string;
  created_at?: string;
  updated_at?: string;
}

export function getRequests(channel: string) {
  return get<{ requests: AgentRequest[] }>("/requests", {
    channel: channel || "general",
    viewer_slug: "human",
  });
}

// Cross-channel view. The broker's blocking check is global, so the web UI's
// global overlay + inline interview bar need every blocking request the human
// can answer, not just the ones in the current channel.
export function getAllRequests() {
  return get<{ requests: AgentRequest[] }>("/requests", {
    scope: "all",
    viewer_slug: "human",
  });
}

export function answerRequest(
  id: string,
  choiceId: string,
  customText?: string,
) {
  const body: Record<string, string> = { id, choice_id: choiceId };
  if (customText) body.custom_text = customText;
  return post("/requests/answer", body);
}

// ── Health ──

export function getHealth() {
  return get<{
    status: string;
    provider?: string;
    provider_model?: string;
    agents?: Record<string, unknown>;
  }>("/health");
}

// ── Tasks ──

export interface Task {
  id: string;
  title: string;
  description?: string;
  details?: string;
  human_details?: string;
  status: string;
  owner?: string;
  created_by?: string;
  project_id?: string;
  channel?: string;
  thread_id?: string;
  task_type?: string;
  pipeline_id?: string;
  pipeline_stage?: string;
  execution_mode?: string;
  review_state?: string;
  source_signal_id?: string;
  source_decision_id?: string;
  worktree_path?: string;
  worktree_branch?: string;
  delivery_url?: string;
  delivery_summary?: string;
  delivery_status?: string;
  delivery_review_decision?: string;
  delivery_checks_status?: string;
  delivery_merge_state?: string;
  delivery_draft?: boolean;
  delivery_checked_at?: string;
  delivered_at?: string;
  depends_on?: string[];
  blocked?: boolean;
  acked_at?: string;
  due_at?: string;
  follow_up_at?: string;
  reminder_at?: string;
  recheck_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  additional_info?: string;
  channel?: string;
  lead_agent?: string;
  github_repo_url?: string;
  recipe_filename?: string;
  recipe_markdown?: string;
  recipe_updated_at?: string;
  status?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectRepoReadiness {
  project_id: string;
  repo_url?: string;
  status: string;
  message: string;
  can_create_coding_tasks: boolean;
  default_branch?: string;
  checked_at?: string;
}

export interface RunnerCapabilities {
  provider_runtimes?: string[];
  gh_available?: boolean;
  gh_authenticated?: boolean;
  git_available?: boolean;
  os?: string;
  arch?: string;
  hostname?: string;
  workspace_root?: string;
  execution_modes?: string[];
}

export interface HostedRunner {
  id: string;
  team_id: string;
  name?: string;
  runner_type?: "local" | "managed" | string;
  status: "connected" | "disconnected" | "stale" | "revoked" | string;
  capabilities?: RunnerCapabilities;
  last_seen_at?: string;
  revoked_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RunnerJob {
  id: string;
  team_id: string;
  project_id?: string;
  task_id?: string;
  runner_id?: string;
  agent_slug?: string;
  execution_mode?: string;
  status:
    | "queued"
    | "leased"
    | "running"
    | "succeeded"
    | "failed"
    | "canceled"
    | "expired"
    | string;
  agent_memory_packet?: unknown;
  repo_url?: string;
  wiki_path?: string;
  lease_expires_at?: string;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface RunnerStatusResponse {
  runners: HostedRunner[];
  jobs: RunnerJob[];
}

export interface TaskMutationResponse {
  task: Task;
  runner_job?: RunnerJob | null;
}

export function getProjects(opts?: { includeArchived?: boolean }) {
  const params: Record<string, string> = {
    viewer_slug: "human",
  };
  if (opts?.includeArchived) params.include_archived = "true";
  return get<{ projects: Project[] }>("/projects", params);
}

export function getProjectRepoReadiness(projectId: string) {
  return get<{ readiness: ProjectRepoReadiness }>("/projects/repo-readiness", {
    id: projectId,
    viewer_slug: "human",
  });
}

export function getRunnerStatus(opts?: {
  projectId?: string;
  taskId?: string;
}) {
  const params: Record<string, string> = {};
  if (opts?.projectId) params.project_id = opts.projectId;
  if (opts?.taskId) params.task_id = opts.taskId;
  return get<RunnerStatusResponse>("/runner/status", params);
}

export function createProject(body: {
  id?: string;
  name: string;
  description?: string;
  additional_info?: string;
  channel?: string;
  lead_agent?: string;
  github_repo_url?: string;
  recipe_filename?: string;
  recipe_markdown?: string;
  created_by?: string;
}) {
  return post<{ project: Project }>("/projects", {
    action: "create",
    created_by: "human",
    ...body,
  });
}

export function updateProject(body: {
  id: string;
  name?: string;
  description?: string;
  additional_info?: string;
  channel?: string;
  lead_agent?: string;
  github_repo_url?: string;
  recipe_filename?: string;
  recipe_markdown?: string;
  clear_recipe?: boolean;
  status?: string;
  created_by?: string;
}) {
  return post<{ project: Project }>("/projects", {
    action: "update",
    created_by: "human",
    ...body,
  });
}

export function createTask(body: {
  title: string;
  details?: string;
  human_details?: string;
  project_id?: string;
  channel?: string;
  owner?: string;
  task_type?: string;
  execution_mode?: string;
  created_by?: string;
}) {
  return post<TaskMutationResponse>("/tasks", {
    action: "create",
    created_by: "human",
    ...body,
  });
}

export function updateTask(body: {
  id: string;
  title?: string;
  details?: string;
  human_details?: string;
  clear_details?: boolean;
  project_id?: string;
  channel?: string;
  created_by?: string;
}) {
  return post<TaskMutationResponse>("/tasks", {
    action: "update",
    created_by: "human",
    ...body,
  });
}

export function reassignTask(
  taskId: string,
  newOwner: string,
  channel: string,
  actor = "human",
) {
  return post<TaskMutationResponse>("/tasks", {
    action: "reassign",
    id: taskId,
    owner: newOwner,
    channel: channel || "general",
    created_by: actor,
  });
}

export type TaskStatusAction =
  | "release"
  | "review"
  | "block"
  | "complete"
  | "cancel";

export function updateTaskStatus(
  taskId: string,
  action: TaskStatusAction,
  channel: string,
  actor = "human",
  delivery?: {
    delivery_url?: string;
    delivery_summary?: string;
  },
) {
  return post<TaskMutationResponse>("/tasks", {
    action,
    id: taskId,
    channel: channel || "general",
    created_by: actor,
    ...delivery,
  });
}

export function getTasks(
  channel: string,
  opts?: {
    includeDone?: boolean;
    status?: string;
    mySlug?: string;
    projectId?: string;
  },
) {
  const params: Record<string, string> = {
    viewer_slug: "human",
    channel: channel || "general",
  };
  if (opts?.includeDone) params.include_done = "true";
  if (opts?.status) params.status = opts.status;
  if (opts?.mySlug) params.my_slug = opts.mySlug;
  if (opts?.projectId) params.project_id = opts.projectId;
  return get<{ tasks: Task[] }>("/tasks", params);
}

export function getOfficeTasks(opts?: {
  includeDone?: boolean;
  status?: string;
  mySlug?: string;
  projectId?: string;
}) {
  const params: Record<string, string> = {
    viewer_slug: "human",
    all_channels: "true",
  };
  if (opts?.includeDone) params.include_done = "true";
  if (opts?.status) params.status = opts.status;
  if (opts?.mySlug) params.my_slug = opts.mySlug;
  if (opts?.projectId) params.project_id = opts.projectId;
  return get<{ tasks: Task[] }>("/tasks", params);
}

// ── Signals / Decisions / Watchdogs / Actions ──

export function getSignals() {
  return get("/signals");
}
export function getDecisions() {
  return get("/decisions");
}
export function getWatchdogs() {
  return get("/watchdogs");
}

export interface ActionRecord {
  id?: string;
  kind?: string;
  source?: string;
  channel?: string;
  actor?: string;
  summary?: string;
  related_id?: string;
  signal_ids?: string[];
  decision_id?: string;
  created_at?: string;
}

export function getActions() {
  return get<{ actions: ActionRecord[] }>("/actions");
}

// ── Scheduler ──

export interface SchedulerJob {
  id?: string;
  slug?: string;
  name?: string;
  label?: string;
  kind?: string;
  cron?: string;
  next_run?: string;
  last_run?: string;
  due_at?: string;
  status?: string;
}

export function getScheduler(opts?: { dueOnly?: boolean }) {
  const params: Record<string, string> = {};
  if (opts?.dueOnly) params.due_only = "true";
  return get<{ jobs: SchedulerJob[] }>("/scheduler", params);
}

// ── Skills ──

export interface Skill {
  name: string;
  description?: string;
  source?: string;
  parameters?: unknown;
}

export function getSkills() {
  return get<{ skills: Skill[] }>("/skills");
}

export function invokeSkill(name: string, params?: Record<string, unknown>) {
  return post(`/skills/${encodeURIComponent(name)}/invoke`, params ?? {});
}

// ── Usage ──

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface UsageData {
  total?: { cost_usd: number; total_tokens?: number };
  session?: { total_tokens: number };
  agents?: Record<string, AgentUsage>;
}

export function getUsage() {
  return get<UsageData>("/usage");
}

// ── Agent Logs ──

export interface AgentLog {
  id: string;
  agent: string;
  task?: string;
  action?: string;
  content?: string;
  timestamp?: string;
  usage?: TokenUsage;
}

export function getAgentLogs(opts?: { limit?: number; task?: string }) {
  if (opts?.task) {
    return get<{ logs: AgentLog[] }>("/agent-logs", { task: opts.task });
  }
  const params: Record<string, string> = {};
  if (opts?.limit) params.limit = String(opts.limit);
  return get<{ logs: AgentLog[] }>("/agent-logs", params);
}

// ── Memory ──

export function getMemory(channel: string) {
  return get("/memory", { channel: channel || "general" });
}

export function setMemory(namespace: string, key: string, value: string) {
  return post("/memory", { namespace, key, value });
}

// ── Config (Settings) ──

export type LLMProvider = "claude-code" | "codex" | "opencode";
export type MemoryBackend = "markdown";
export type ActionProvider = "auto" | "one" | "composio" | "";

export interface ConfigSnapshot {
  // Runtime
  llm_provider?: LLMProvider;
  memory_backend?: MemoryBackend;
  action_provider?: ActionProvider;
  team_lead_slug?: string;
  max_concurrent_agents?: number;
  default_format?: string;
  default_timeout?: number;
  blueprint?: string;
  // Workspace
  email?: string;
  workspace_id?: string;
  workspace_slug?: string;
  dev_url?: string;
  // Company
  company_name?: string;
  company_description?: string;
  company_goals?: string;
  company_size?: string;
  company_priority?: string;
  // Polling
  insights_poll_minutes?: number;
  task_follow_up_minutes?: number;
  task_reminder_minutes?: number;
  task_recheck_minutes?: number;
  // Secret flags
  api_key_set?: boolean;
  openai_key_set?: boolean;
  anthropic_key_set?: boolean;
  gemini_key_set?: boolean;
  minimax_key_set?: boolean;
  one_key_set?: boolean;
  composio_key_set?: boolean;
  telegram_token_set?: boolean;
  openclaw_token_set?: boolean;
  openclaw_gateway_url?: string;
  config_path?: string;
}

export type ConfigUpdate = Partial<{
  llm_provider: LLMProvider;
  memory_backend: MemoryBackend;
  action_provider: ActionProvider;
  team_lead_slug: string;
  max_concurrent_agents: number;
  default_format: string;
  default_timeout: number;
  blueprint: string;
  email: string;
  dev_url: string;
  company_name: string;
  company_description: string;
  company_goals: string;
  company_size: string;
  company_priority: string;
  insights_poll_minutes: number;
  task_follow_up_minutes: number;
  task_reminder_minutes: number;
  task_recheck_minutes: number;
  // Secret-write fields — sent as plaintext on write, never returned on read
  api_key: string;
  openai_api_key: string;
  anthropic_api_key: string;
  gemini_api_key: string;
  minimax_api_key: string;
  one_api_key: string;
  composio_api_key: string;
  telegram_bot_token: string;
  openclaw_token: string;
  openclaw_gateway_url: string;
}>;

export function getConfig() {
  return get<ConfigSnapshot>("/config");
}

export function updateConfig(patch: ConfigUpdate) {
  return post<{ status: string }>("/config", patch);
}

// ── Workspace wipes (Danger Zone) ──

// WorkspaceWipeResult shape mirrors internal/workspace.Result plus the flags
// the HTTP handler adds (restart_required, redirect). The UI just needs ok +
// a reason to reload, but we surface `removed` so users can see what went.
export interface WorkspaceWipeResult {
  ok: boolean;
  restart_required?: boolean;
  redirect?: string;
  removed?: string[];
  errors?: string[];
  error?: string;
}

// resetWorkspace is the narrow wipe: clears broker runtime state only.
// Team roster, company identity, tasks, and workflows all survive. Call
// window.location.reload() after success so the UI picks up the empty
// broker state.
export function resetWorkspace() {
  return postWithTimeout<WorkspaceWipeResult>("/workspace/reset", {}, 20_000);
}

// shredWorkspace is the full wipe: broker runtime + team + company + office,
// workflows, logs, sessions, provider state, and local markdown memory.
// The broker resets in place after success so onboarding can reopen immediately.
export function shredWorkspace() {
  return postWithTimeout<WorkspaceWipeResult>("/workspace/shred", {}, 20_000);
}
