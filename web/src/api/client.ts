/**
 * Typed hosted LAF Office API client.
 */

import type {
  WorkspacePermission,
  WorkspaceRole,
} from "./workspacePermissions";
export type {
  WorkspacePermission,
  WorkspaceRole,
} from "./workspacePermissions";

export function normalizeHostedAPIBase(value = ""): string {
  const raw = String(value || "").trim();
  if (!raw) return "/api";
  if (/^https?:\/\//i.test(raw)) {
    return normalizeAbsoluteHostedAPIBase(raw);
  }
  if (looksLikeBareAPIHost(raw)) {
    return normalizeAbsoluteHostedAPIBase(`https://${raw}`);
  }
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/api";
}

function normalizeAbsoluteHostedAPIBase(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname && pathname !== "/" ? pathname : "/api";
  return url.toString().replace(/\/+$/, "");
}

function looksLikeBareAPIHost(value: string): boolean {
  const [hostPart = ""] = String(value || "").split(/[/?#]/);
  return (
    hostPart.includes(".") || hostPart.includes(":") || hostPart.startsWith("[")
  );
}

export function hostedAPIBaseURL(): string {
  return normalizeHostedAPIBase(import.meta.env.VITE_LAF_API_BASE_URL);
}

export function hostedAPIURLFromBrowser(): string {
  const base = hostedAPIBaseURL();
  if (/^https?:\/\//i.test(base)) return base;
  const origin = globalThis.location?.origin || "";
  if (!origin) return base;
  return new URL(base, origin).toString().replace(/\/+$/, "");
}

// ── Init ──

export function supportsBrokerEvents(): boolean {
  return false;
}

export async function initApi(): Promise<void> {
  return Promise.resolve();
}

// ── Internal helpers ──

function baseURL(): string {
  return hostedAPIBaseURL();
}

function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function buildURL(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  let url = baseURL() + path;
  if (!params) return url;

  const qs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
  if (qs) url += `?${qs}`;
  return url;
}

function responseErrorMessage(
  text: string,
  status: number,
  statusText: string,
): string {
  const trimmed = text.trim();
  if (!trimmed) return `${status} ${statusText}`;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown;
      error_description?: unknown;
      message?: unknown;
      msg?: unknown;
    };
    for (const value of [
      parsed.error,
      parsed.message,
      parsed.msg,
      parsed.error_description,
    ]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // Plain text errors are already display-ready.
  }
  return trimmed;
}

async function assertOK(r: Response): Promise<void> {
  if (r.ok) return;
  const text = (await r.text().catch(() => "")).trim();
  throw new Error(responseErrorMessage(text, r.status, r.statusText));
}

export async function get<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const url = buildURL(path, params);
  const r = await fetch(url, {
    credentials: "include",
    headers: authHeaders(),
  });
  await assertOK(r);
  return r.json();
}

export async function getText(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<string> {
  const url = buildURL(path, params);
  const r = await fetch(url, {
    credentials: "include",
    headers: authHeaders(),
  });
  await assertOK(r);
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
  await assertOK(r);
  return r.json();
}

export async function put<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(baseURL() + path, {
    method: "PUT",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await assertOK(r);
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
    await assertOK(r);
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
  await assertOK(r);
  return r.json();
}

// ── SSE ──

export function sseURL(path: string): string {
  return baseURL() + path;
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

export interface PermissionOverride {
  allow?: WorkspacePermission[];
  deny?: WorkspacePermission[];
}

export interface PermissionMember {
  user_id: string;
  email: string;
  name: string;
  role: WorkspaceRole | string;
  status?: string;
  overrides: PermissionOverride;
  effective_permissions: WorkspacePermission[];
}

export interface PermissionsResponse {
  roles: WorkspaceRole[];
  permissions: WorkspacePermission[];
  members: PermissionMember[];
}

export type ModelMode = "laf_model" | "record_only";

export function normalizeModelMode(value: unknown): ModelMode {
  if (value === "laf_model" || value === "record_only") {
    return value;
  }
  return "record_only";
}

export interface ModelAvailability {
  default_mode: ModelMode;
  allowed_modes: ModelMode[];
  laf_model: { available: boolean; reason?: string };
  record_only: { available: boolean; reason?: string };
  reason?: string;
}

export interface OrchestrationIntent {
  id: string;
  type: string;
  risk: "low" | "medium" | "high" | string;
  summary: string;
  proposed_actions: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
  }>;
  required_permissions: WorkspacePermission[];
  status: string;
  requires_confirmation?: boolean;
  created_at?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_id?: string;
  team_id: string;
  role: WorkspaceRole | string;
  status: string;
  permissions?: PermissionOverride;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUser;
  team?: WorkspaceTeam;
}

export interface AuthSignupResponse {
  authenticated?: boolean;
  email_confirmation_required?: boolean;
  user: AuthUser;
  team: WorkspaceTeam;
}

export function getAuthSession() {
  return get<AuthSessionResponse>("/auth/session");
}

export function getAuthUsers() {
  return get<{ users: AuthUser[] }>("/auth/users");
}

export function getPermissions() {
  return get<PermissionsResponse>("/permissions");
}

export function updatePermissions(body: {
  user_id: string;
  role?: WorkspaceRole;
  permissions?: PermissionOverride;
}) {
  return patchJSON<{ member: PermissionMember }>("/permissions", body);
}

export function getModelAvailability() {
  return get<ModelAvailability>("/model/availability");
}

export function routeOrchestrationIntent(body: {
  message: string;
  model_mode?: ModelMode;
}) {
  return post<{ intent: OrchestrationIntent }>("/orchestration/intent", body);
}

export function confirmOrchestrationIntent(intent: OrchestrationIntent) {
  return post<{
    confirmation_id: string;
    intent_id: string;
    status: string;
    applied: unknown[];
  }>("/orchestration/confirm", { intent_id: intent.id });
}

export function signup(body: {
  email: string;
  name: string;
  password: string;
  team_action: "create" | "join";
  team_name?: string;
  invite_token?: string;
}) {
  return post<AuthSignupResponse>("/auth/signup", body);
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
  await assertOK(r);
  return r.json();
}

export function updateAuthUserRole(body: {
  user_id: string;
  role: WorkspaceRole;
}) {
  return patchJSON<{ user: AuthUser; users: AuthUser[] }>("/auth/users", body);
}

export function updateOwnProfile(body: { name: string; avatar_id: string }) {
  return patchJSON<{ user: AuthUser }>("/auth/me", body);
}

export function changeOwnPassword(body: {
  current_password: string;
  new_password: string;
}) {
  return patchJSON<{ status: string }>("/auth/me/password", body);
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
  kind?: string;
  content: string;
  timestamp: string;
  reply_to?: string;
  public_reply_to?: string;
  home_session_thread_id?: string;
  thread_id?: string;
  thread_count?: number;
  reactions?: Record<string, string[]>;
  tagged?: string[];
  scope?: string;
  visibility?: string;
  run_id?: string;
  audience?: string[];
  model_mode?: ModelMode;
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

export interface HomeChatSession {
  id: string;
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
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
  metadata?: Record<string, string>,
) {
  return postMessageAs("you", content, channel, replyTo, tagged, metadata);
}

export function postMessageAs(
  from: string,
  content: string,
  channel: string,
  replyTo?: string,
  tagged?: string[],
  metadata?: Record<string, string>,
) {
  const body: Record<string, string | string[]> = {
    from,
    channel: channel || "general",
    content,
  };
  if (replyTo) body.reply_to = replyTo;
  if (tagged && tagged.length > 0) body.tagged = tagged;
  if (metadata) Object.assign(body, metadata);
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

export function getHomeSessions(baseThreadId: string) {
  return get<{ sessions: HomeChatSession[] }>("/home-sessions", {
    base_thread_id: baseThreadId,
  });
}

export function deleteHomeSession(threadId: string) {
  return del<{ ok: boolean; deleted: boolean }>("/home-sessions", {
    thread_id: threadId,
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

export interface AgentModelDefaults {
  claude?: string;
  codex?: string;
  laf?: string;
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
  model_defaults?: AgentModelDefaults;
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
  model_defaults?: AgentModelDefaults;
}) {
  return post<{ member: OfficeMember }>("/office-members", {
    action: "create",
    created_by: "agent-maker",
    ...body,
  });
}

export function updateOfficeMember(body: {
  slug: string;
  name?: string;
  role?: string;
  expertise?: string[];
  personality?: string;
  permission_mode?: string;
  provider?: ProviderBinding;
  model_defaults?: AgentModelDefaults;
}) {
  return post<{ member: OfficeMember }>("/office-members", {
    action: "update",
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
  source_conversation_deleted_at?: string;
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
  id?: string;
  name: string;
  title?: string;
  description?: string;
  content?: string;
  source?: string;
  created_by?: string;
  channel?: string;
  tags?: string[];
  trigger?: string;
  workflow_provider?: string;
  workflow_key?: string;
  workflow_definition?: string;
  workflow_schedule?: string;
  required_permissions?: string[];
  relay_id?: string;
  relay_platform?: string;
  relay_event_types?: string[];
  last_execution_at?: string;
  last_execution_status?: string;
  usage_count?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
  parameters?: unknown;
  version?: number;
  risk?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
}

export function getSkills() {
  return get<{ skills: Skill[] }>("/skills");
}

export function invokeSkill(name: string, params?: Record<string, unknown>) {
  return post(`/skills/${encodeURIComponent(name)}/invoke`, params ?? {});
}

export function createSkill(
  body: Partial<Skill> & {
    name: string;
    content: string;
    created_by: string;
    action?: "create" | "propose";
  },
) {
  return post<{ skill: Skill }>("/skills", body);
}

export function updateSkill(body: Partial<Skill> & { name: string }) {
  return put<{ skill: Skill }>("/skills", body);
}

export function deleteSkill(name: string) {
  return del<{ ok: boolean }>("/skills", { name });
}

// ── Usage ──

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface ContextBudgetSectionUsage {
  id: string;
  chars: number;
  required?: boolean;
}

export interface UsageOptimizationStats {
  prompt_builds?: number;
  prompt_chars?: number;
  max_prompt_chars?: number;
  packet_builds?: number;
  packet_chars?: number;
  max_packet_chars?: number;
  memory_items_included?: number;
  memory_items_omitted?: number;
  broad_poll_reads?: number;
  broad_task_reads?: number;
  wake_decisions?: number;
  wake_targets?: number;
  wake_reasons?: Record<string, number>;
  wake_suppressions?: Record<string, number>;
  tool_calls?: number;
  last_prompt_sections?: ContextBudgetSectionUsage[];
  last_packet_sections?: ContextBudgetSectionUsage[];
}

export interface UsageData {
  total?: { cost_usd: number; tool_calls?: number; total_tokens?: number };
  session?: { total_tokens: number };
  personal_cli?: { total_tokens?: number };
  laf_ai?: { limit_percent?: number; percent?: number };
  startup_office?: {
    billing_state?: string;
    cost_usd?: number;
    model_spend_cents?: number;
    monthly_model_spend_cents?: number;
    monthly_run_limit?: number;
    pending_invites?: number;
    plan?: string;
    run_percent?: number;
    runs?: number;
    seat_limit?: number;
    seat_percent?: number;
    seats?: number;
    storage_mb?: number;
    storage_mb_limit?: number;
    storage_percent?: number;
    tool_calls?: number;
    total_tokens?: number;
  };
  agents?: Record<string, AgentUsage>;
  optimization?: UsageOptimizationStats;
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

export type LLMProvider = "claude-code" | "codex";
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

// resetWorkspace is the narrow wipe: clears transient workspace state only.
// Team roster, company identity, and Startup Office workflows all survive. Call
// window.location.reload() after success so the UI picks up the clean state.
export function resetWorkspace(confirmPhrase: string) {
  return postWithTimeout<WorkspaceWipeResult>(
    "/workspace/reset",
    { confirm: confirmPhrase },
    20_000,
  );
}

// shredWorkspace is the full wipe: team + company + office workflows, logs,
// sessions, provider state, and workspace wiki memory.
// The hosted API resets in place after success so onboarding can reopen.
export function shredWorkspace(confirmPhrase: string) {
  return postWithTimeout<WorkspaceWipeResult>(
    "/workspace/shred",
    { confirm: confirmPhrase },
    20_000,
  );
}
