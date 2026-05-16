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
    const contentType = r.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
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

export type WorkspaceRole = "owner" | "admin" | "manager" | "member" | "viewer";

export type WorkspacePermission =
  | "workspace:read"
  | "workspace:manage"
  | "member:invite"
  | "member:manage_roles"
  | "member:manage_permissions"
  | "project:create"
  | "project:update"
  | "project:archive"
  | "task:create"
  | "task:update"
  | "task:assign"
  | "task:change_status"
  | "task:execute_agent"
  | "agent:create"
  | "agent:update"
  | "agent:assign"
  | "skill:read"
  | "skill:propose"
  | "skill:create_active"
  | "skill:approve"
  | "skill:update"
  | "skill:archive"
  | "skill:invoke"
  | "memory:read"
  | "memory:write_draft"
  | "memory:promote"
  | "memory:write_canonical"
  | "wiki:read"
  | "runner:read"
  | "runner:manage"
  | "model:use_laf"
  | "model:use_local_cli"
  | "bridge:pair_own"
  | "bridge:read_own"
  | "bridge:execute_own"
  | "bridge:manage_own"
  | "bridge:read_team"
  | "bridge:execute_team"
  | "bridge:manage_team"
  | "execution:plan_create"
  | "execution:read"
  | "execution:cancel"
  | "execution:receipt_read"
  | "execution:receipt_write"
  | "mcp:use_task_context"
  | "mcp:use_workspace_context"
  | "audit:read";

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

export type ModelMode =
  | "laf_model"
  | "my_bridge"
  | "team_bridge"
  | "record_only";

export interface ModelAvailability {
  default_mode: ModelMode;
  allowed_modes: ModelMode[];
  laf_model: { available: boolean; reason?: string };
  my_bridge: { available: boolean; reason?: string };
  team_bridge: { available: boolean; reason?: string };
  local_cli?: { available: boolean; reason?: string; runtimes?: string[] };
  record_only: { available: boolean; reason?: string };
  reason?: string;
}

export interface BridgeDevice {
  id: string;
  team_id: string;
  user_id: string;
  device_label: string;
  device_kind: "desktop" | "team_bridge" | string;
  platform?: string;
  arch?: string;
  bridge_version?: string;
  public_key?: string;
  capabilities?: Record<string, unknown>;
  status: "online" | "offline" | "revoked" | string;
  paired_at?: string;
  last_seen_at?: string;
  revoked_at?: string;
  revoked_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BridgeAvailability {
  available: boolean;
  default_device_id?: string;
  device_count: number;
  online_device_count: number;
  reason?: string;
}

export interface BridgePairingStartResponse {
  api_url: string;
  pairing: { code: string; expires_at: string; team_id: string };
  commands: { pair: string };
}

export interface ProjectLocalBinding {
  id: string;
  team_id: string;
  project_id: string;
  user_id: string;
  device_id: string;
  display_name: string;
  local_path_hash: string;
  git_root_hash?: string | null;
  git_remote_hash?: string | null;
  trusted: boolean;
  trusted_at?: string | null;
  last_used_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectLocalBindingCommandSet {
  link?: string;
}

export interface ExecutionPlan {
  id: string;
  team_id: string;
  project_id?: string | null;
  task_id?: string | null;
  binding_id?: string | null;
  actor_user_id: string;
  executor_user_id?: string | null;
  device_id?: string | null;
  mode: ModelMode;
  provider: "codex" | "claude_code" | "laf_model" | string;
  status:
    | "pending"
    | "dispatched"
    | "acknowledged"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired"
    | string;
  prompt: string;
  required_permissions?: WorkspacePermission[];
  effective_permissions?: WorkspacePermission[];
  context_refs?: unknown[];
  policy?: Record<string, unknown>;
  signature_alg?: string;
  signature_key_id?: string;
  payload_hash?: string;
  signature?: string;
  nonce?: string;
  local_approval_status?: string;
  expires_at?: string;
  lease_until?: string | null;
  dispatched_at?: string | null;
  acknowledged_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancel_requested_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExecutionEvent {
  id: string;
  team_id: string;
  plan_id: string;
  task_id?: string | null;
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  redacted: boolean;
  created_at?: string;
}

export interface ExecutionReceipt {
  id: string;
  team_id: string;
  project_id?: string | null;
  task_id?: string | null;
  plan_id?: string | null;
  actor_user_id?: string | null;
  executor_user_id?: string | null;
  device_id?: string | null;
  mode: ModelMode;
  provider: string;
  provider_version?: string;
  status: "completed" | "failed" | "cancelled" | string;
  summary?: string;
  changed_files?: unknown[];
  test_results?: unknown[];
  artifacts?: unknown[];
  usage?: Record<string, unknown>;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
}

export interface ExecutionPlanRelayResult {
  published: boolean;
  error?: string;
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

export function getBridgeAvailability() {
  return get<{ my_bridge: BridgeAvailability; devices: BridgeDevice[] }>(
    "/bridge/availability",
  );
}

export function getBridgeDevices() {
  return get<{ devices: BridgeDevice[] }>("/bridge/devices");
}

export function startBridgePairing(body: { api_url?: string } = {}) {
  return post<BridgePairingStartResponse>("/bridge/pairing/start", body);
}

export function revokeBridgeDevice(deviceID: string) {
  return post<{ device: BridgeDevice }>(
    `/bridge/devices/${encodeURIComponent(deviceID)}/revoke`,
    {},
  );
}

export function getProjectLocalBindings(projectID: string) {
  return get<{ bindings: ProjectLocalBinding[] }>(
    `/projects/${encodeURIComponent(projectID)}/local-bindings`,
  );
}

export function createProjectLocalBinding(
  projectID: string,
  body: {
    device_id: string;
    local_path: string;
    display_name?: string;
    git_root?: string;
    git_remote_url?: string;
    trusted?: boolean;
  },
) {
  return post<{
    binding: ProjectLocalBinding;
    commands?: ProjectLocalBindingCommandSet;
  }>(`/projects/${encodeURIComponent(projectID)}/local-bindings`, body);
}

export function deleteProjectLocalBinding(
  projectID: string,
  bindingID: string,
) {
  return del<{ binding: ProjectLocalBinding; deleted: boolean }>(
    `/projects/${encodeURIComponent(projectID)}/local-bindings/${encodeURIComponent(bindingID)}`,
  );
}

export function createExecutionPlan(body: {
  task_id: string;
  message: string;
  mode: Exclude<ModelMode, "record_only">;
  provider?: "codex" | "claude_code" | "laf_model";
  binding_id?: string;
  device_id?: string;
  required_permissions?: WorkspacePermission[];
  expires_in_seconds?: number;
  policy?: Record<string, unknown>;
}) {
  return post<{ plan: ExecutionPlan; relay?: ExecutionPlanRelayResult }>(
    "/execution/plans",
    body,
  );
}

export function getExecutionPlan(planID: string) {
  return get<{ plan: ExecutionPlan; receipt?: ExecutionReceipt | null }>(
    `/execution/plans/${encodeURIComponent(planID)}`,
  );
}

export function cancelExecutionPlan(planID: string) {
  return post<{ plan: ExecutionPlan; cancelled: boolean }>(
    `/execution/plans/${encodeURIComponent(planID)}/cancel`,
    {},
  );
}

export function getExecutionPlanEvents(planID: string) {
  return get<{ events: ExecutionEvent[] }>(
    `/execution/plans/${encodeURIComponent(planID)}/events`,
  );
}

export function routeOrchestrationIntent(body: {
  message: string;
  project_id?: string;
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
  await assertOK(r);
  return r.json();
}

export function updateAuthUserRole(body: {
  user_id: string;
  role: WorkspaceRole;
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
  kind?: string;
  content: string;
  timestamp: string;
  reply_to?: string;
  thread_id?: string;
  thread_count?: number;
  reactions?: Record<string, string[]>;
  tagged?: string[];
  project_id?: string;
  task_id?: string;
  scope?: string;
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
  assignee_type?: "agent" | "human" | "none" | string;
  assignee_id?: string;
  human_owner_user_id?: string;
  model_mode?: ModelMode;
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
  cli_details?: Record<string, unknown>;
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
  requested_by?: string;
  effective_permissions?: WorkspacePermission[];
  model_mode?: ModelMode;
  intent_id?: string;
  confirmation_id?: string;
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

export interface RunnerPairingStartResponse {
  api_url: string;
  pairing: {
    code: string;
    team_id: string;
    expires_at: string;
  };
  commands: {
    install?: string;
    connect: string;
    setup?: string;
  };
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

export function createRunnerPairing(apiUrl?: string) {
  return post<RunnerPairingStartResponse>("/runner/pairing/start", {
    api_url: apiUrl,
  });
}

export function revokeRunner(runnerId: string) {
  return post<{ runner: HostedRunner }>("/runner/revoke", {
    runner_id: runnerId,
  });
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
  assignee_type?: "agent" | "human" | "none" | string;
  assignee_id?: string;
  human_owner_user_id?: string;
  model_mode?: ModelMode;
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
  assignee_type?: "agent" | "human" | "none" | string;
  assignee_id?: string;
  human_owner_user_id?: string;
  model_mode?: ModelMode;
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
  modelMode?: ModelMode,
) {
  return post<TaskMutationResponse>("/tasks", {
    action: "reassign",
    id: taskId,
    owner: newOwner,
    channel: channel || "general",
    created_by: actor,
    model_mode: modelMode,
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
  modelMode?: ModelMode,
) {
  return post<TaskMutationResponse>("/tasks", {
    action,
    id: taskId,
    channel: channel || "general",
    created_by: actor,
    model_mode: modelMode,
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
  total?: { cost_usd: number; total_tokens?: number };
  session?: { total_tokens: number };
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
export function resetWorkspace(confirmPhrase: string) {
  return postWithTimeout<WorkspaceWipeResult>(
    "/workspace/reset",
    { confirm: confirmPhrase },
    20_000,
  );
}

// shredWorkspace is the full wipe: broker runtime + team + company + office,
// workflows, logs, sessions, provider state, and local markdown memory.
// The broker resets in place after success so onboarding can reopen immediately.
export function shredWorkspace(confirmPhrase: string) {
  return postWithTimeout<WorkspaceWipeResult>(
    "/workspace/shred",
    { confirm: confirmPhrase },
    20_000,
  );
}
