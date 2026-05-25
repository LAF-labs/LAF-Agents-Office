import { get, patchJSON, post } from "./client";

export interface StartupOfficeCompanyProfile {
  description?: string;
  email?: string;
  goals?: string;
  icp?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  offer?: string;
  positioning?: string;
  priority?: string;
  size?: string;
  stage?: string;
  team_id?: string;
  updated_at?: string | null;
  workspace_slug?: string;
}

export interface StartupOfficeLoop {
  cadence: string;
  department: string;
  id: string;
  name: string;
  objective: string;
  policy?: Record<string, unknown>;
  slug: string;
  status: string;
}

export interface StartupOfficeRun {
  completed_at?: string | null;
  created_at?: string | null;
  id: string;
  inputs?: Record<string, unknown>;
  loop_id?: string | null;
  metadata?: Record<string, unknown>;
  objective?: string;
  started_at?: string | null;
  status: string;
  summary?: string;
  title: string;
  updated_at?: string | null;
}

export interface StartupOfficeApproval {
  action: string;
  artifact_id?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  decision_note?: string;
  details?: string;
  id: string;
  metadata?: Record<string, unknown>;
  requested_at?: string | null;
  requested_by?: string | null;
  risk_level: string;
  run_id?: string | null;
  status: string;
  title: string;
}

export interface StartupOfficeReceipt {
  actor_slug?: string;
  approval_id?: string | null;
  created_at?: string | null;
  event_type: string;
  id: string;
  integrity?: {
    algorithm: "sha256";
    canonical_fields: string[];
    digest: string;
    digest_input_version: string;
    signed: boolean;
    signed_note: string;
    version: string;
  };
  run_id?: string | null;
  summary: string;
  trace?: Record<string, unknown>;
}

export interface StartupOfficeArtifact {
  content: string;
  created_at?: string | null;
  id: string;
  kind: string;
  metadata?: Record<string, unknown>;
  run_id?: string | null;
  title: string;
}

export interface StartupOfficeMemoryPage {
  assumptions?: unknown[];
  body?: string;
  freshness?: {
    days_since_verification: number | null;
    reason: string;
    review_due_at: string | null;
    review_interval_days: number;
    risk_level: "low" | "medium" | "high";
    status: "fresh" | "review_soon" | "stale" | "needs_review";
  };
  id: string;
  last_verified_at?: string | null;
  provenance?: Record<string, unknown>;
  slug: string;
  sources?: unknown[];
  status: string;
  summary?: string;
  title: string;
  updated_at?: string | null;
}

export interface StartupOfficeOperatingObjects {
  assets?: StartupOfficeArtifactObject[];
  counts?: {
    assets?: number;
    customers?: number;
    metrics?: number;
    signals?: number;
  };
  customers?: StartupOfficeCustomer[];
  metrics?: StartupOfficeMetric[];
  metrics_summary?: StartupOfficeMetricSummary[];
  signals?: StartupOfficeSignal[];
}

export interface StartupOfficeArtifactObject {
  body?: string;
  checksum_sha256?: string;
  content_type?: string;
  id: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  name: string;
  run_id?: string | null;
  size_bytes?: number;
  status?: string;
  storage_path?: string;
  updated_at?: string | null;
  upload_status?: string;
}

export interface StartupOfficeCustomer {
  id: string;
  loop_id?: string | null;
  name: string;
  notes?: string;
  profile?: Record<string, unknown>;
  status: string;
  updated_at?: string | null;
}

export interface StartupOfficeMetric {
  created_at?: string | null;
  id: string;
  metric_key: string;
  metric_value?: number | null;
  period_end?: string | null;
  period_start?: string | null;
  unit?: string;
  updated_at?: string | null;
}

export interface StartupOfficeMetricSummary {
  change?: number | null;
  latest_value?: number | null;
  metric_key: string;
  previous_value?: number | null;
  unit?: string;
  updated_at?: string | null;
}

export interface StartupOfficeSignal {
  body?: string;
  id: string;
  source?: string;
  status: string;
  title: string;
}

export interface StartupOfficeGrowthSummary {
  activity_notifications?: StartupOfficeNotification[];
  beta_ops?: StartupOfficeBetaOps;
  company_profile: StartupOfficeCompanyProfile;
  loops: StartupOfficeLoop[];
  memory_pages?: StartupOfficeMemoryPage[];
  operating_objects?: StartupOfficeOperatingObjects;
  pending_approvals: StartupOfficeApproval[];
  pulse: {
    active_loops: number;
    pending_approvals: number;
    recent_receipts: number;
    recent_runs: number;
  };
  recent_artifacts?: StartupOfficeArtifact[];
  recent_receipts: StartupOfficeReceipt[];
  recent_runs: StartupOfficeRun[];
}

export interface StartupOfficeBetaOps {
  activation?: StartupOfficeActivationSnapshot;
  activation_events?: StartupOfficeActivationEvent[];
  billing: {
    beta_agreement_url?: string;
    billing_provider: string;
    billing_state: string;
    blocked_reason?: string;
    last_paid_at?: string | null;
    monthly_model_spend_cents: number;
    monthly_run_limit: number;
    payment_status: string;
    plan: string;
    seat_limit: number;
    storage_mb_limit: number;
  };
  billing_documents?: StartupOfficeBillingDocument[];
  commercial?: {
    agreement_status: string;
    can_start_paid_beta: boolean;
    next_step: string;
    paid_evidence_status: string;
    status: string;
    terms_status?: string;
  };
  entitlements?: {
    ai_runs: boolean;
    asset_uploads: boolean;
    blocks: Array<{ code?: string; message: string; scope: string }>;
    commercial_status: string;
    managed_model: boolean;
    seats_available: boolean;
    support_timeline: boolean;
  };
  limits: {
    monthly_model_spend_cents: number;
    monthly_run_limit: number;
    seat_limit: number;
    storage_mb_limit: number;
  };
  terms?: StartupOfficeTermsSnapshot;
  usage: {
    model_spend_cents: number;
    model_spend_percent: number;
    pending_invites: number;
    run_percent: number;
    runs: number;
    seat_percent: number;
    seats: number;
    storage_mb: number;
    storage_percent: number;
    tool_calls: number;
    total_tokens: number;
  };
}

export interface StartupOfficeTermsPackage {
  ai_use_version: string;
  deletion_version: string;
  docs_path: string;
  dpa_version: string;
  privacy_version: string;
  retention_version: string;
  terms_version: string;
  version_keys?: string[];
}

export interface StartupOfficeTermsAcceptance {
  acceptance_note?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  ai_use_version: string;
  deletion_version: string;
  dpa_version: string;
  id: string;
  metadata?: Record<string, unknown>;
  privacy_version: string;
  retention_version: string;
  terms_version: string;
  updated_at?: string | null;
}

export interface StartupOfficeTermsSnapshot {
  accepted: boolean;
  current: StartupOfficeTermsPackage;
  latest_acceptance?: StartupOfficeTermsAcceptance | null;
  missing_versions: string[];
}

export interface StartupOfficeActivationEvent {
  created_by?: string | null;
  first_seen_at?: string | null;
  id: string;
  metadata?: Record<string, unknown>;
  milestone: string;
  source_id?: string;
  source_table?: string;
  updated_at?: string | null;
}

export interface StartupOfficeActivationSnapshot {
  activated: boolean;
  completed_count: number;
  milestones: Array<{
    completed: boolean;
    event?: StartupOfficeActivationEvent | null;
    label: string;
    milestone: string;
  }>;
  next_milestone: string;
  required_count: number;
}

export interface StartupOfficeBillingDocument {
  amount_cents: number;
  created_at?: string | null;
  currency: string;
  document_type: string;
  external_reference?: string;
  id: string;
  notes?: string;
  period_end?: string | null;
  period_start?: string | null;
  plan?: string;
  provider: string;
  reference_url?: string;
  status: string;
  updated_at?: string | null;
}

export interface StartupOfficeNotification {
  created_at?: string | null;
  event_type: string;
  id: string;
  payload?: Record<string, unknown>;
  status: string;
}

export interface StartupOfficeWorkerJob {
  attempts?: number;
  available_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  id: string;
  last_error?: string;
  locked_at?: string | null;
  loop_slug?: string;
  max_attempts?: number;
  metadata?: Record<string, unknown>;
  run_id?: string | null;
  status: string;
  updated_at?: string | null;
}

export interface StartupOfficeApprovalPolicy {
  action_modes: Record<string, "approval_required" | "draft_only" | string>;
  actions?: Array<{
    label: string;
    mode: "approval_required" | "draft_only" | string;
    type: string;
  }>;
  auto_draft_only: Record<string, boolean>;
  founder_approval_required: Record<string, boolean>;
  require_citations_for_public_claims: boolean;
  revision_enabled: boolean;
  support_access: {
    logged: boolean;
    time_bound_hours: number;
    visible_to_owner: boolean;
  };
}

export interface StartupOfficeCompanyProfileUpdate {
  icp?: string;
  name?: string;
  offer?: string;
  positioning?: string;
  priority?: string;
  stage?: string;
}

export interface StartupOfficeLoopRunResponse {
  approval?: StartupOfficeApproval | null;
  artifact?: StartupOfficeArtifact | null;
  error?: string;
  receipt?: StartupOfficeReceipt | null;
  run?: StartupOfficeRun | null;
  status?: string;
  worker_job?: Record<string, unknown> | null;
}

export interface StartupOfficeRunDetailResponse {
  approvals: StartupOfficeApproval[];
  artifacts: StartupOfficeArtifact[];
  receipts: StartupOfficeReceipt[];
  run: StartupOfficeRun;
}

export interface StartupOfficeRunMutationResponse {
  approval?: StartupOfficeApproval | null;
  artifact?: StartupOfficeArtifact | null;
  error?: string;
  receipt?: StartupOfficeReceipt | null;
  run?: StartupOfficeRun | null;
  status?: string;
  worker_job?: Record<string, unknown> | null;
}

export interface StartupOfficeRunCancelResponse {
  receipt?: StartupOfficeReceipt | null;
  run?: StartupOfficeRun | null;
  status?: string;
  worker_job?: StartupOfficeWorkerJob | null;
}

export interface StartupOfficeWorkerJobActionResponse {
  status: string;
  worker_job: StartupOfficeWorkerJob;
}

export interface StartupOfficeApprovalActionResponse {
  approval?: StartupOfficeApproval | null;
  memory_diff?: Record<string, unknown> | null;
  memory_pages?: StartupOfficeMemoryPage[];
  receipt?: StartupOfficeReceipt | null;
  run?: StartupOfficeRun | null;
  status?: string;
}

export interface StartupOfficePolicyResponse {
  policy: StartupOfficeApprovalPolicy;
}

export interface StartupOfficeCompanyProfileResponse {
  profile: StartupOfficeCompanyProfile;
}

export interface StartupOfficeTermsResponse {
  beta_ops: StartupOfficeBetaOps;
  terms: StartupOfficeTermsPackage;
}

export interface StartupOfficeTermsAcceptResponse {
  acceptance: StartupOfficeTermsAcceptance;
  beta_ops: StartupOfficeBetaOps;
  status: string;
}

export interface StartupOfficePagination {
  cursor?: string | null;
  has_more: boolean;
  limit: number;
  next_cursor?: string | null;
}

export interface StartupOfficeReceiptsResponse {
  pagination?: StartupOfficePagination;
  receipts: StartupOfficeReceipt[];
}

export interface StartupOfficeMemoryImportResponse {
  imported_count: number;
  memory_pages: StartupOfficeMemoryPage[];
  status: string;
}

export interface StartupOfficeCustomerCsvResponse {
  content_type: "text/csv";
  count: number;
  csv: string;
  filename: string;
}

export interface StartupOfficeCustomerCsvImportResponse {
  customers: StartupOfficeCustomer[];
  imported_count: number;
  status: string;
}

export function getStartupOfficeGrowthSummary() {
  return get<StartupOfficeGrowthSummary>("/startup-office/growth-summary");
}

export function getStartupOfficeReceipts(opts?: { cursor?: string; limit?: number }) {
  return get<StartupOfficeReceiptsResponse>("/startup-office/receipts", {
    cursor: opts?.cursor,
    limit: opts?.limit,
  });
}

export function importStartupOfficeMemory(body: {
  export?: Record<string, unknown>;
  memory_pages?: StartupOfficeMemoryPage[];
  schema_version?: string;
}) {
  return post<StartupOfficeMemoryImportResponse>(
    "/startup-office/memory/import",
    body,
  );
}

export function getStartupOfficeCustomerCsv() {
  return get<StartupOfficeCustomerCsvResponse>("/startup-office/customers/csv");
}

export function importStartupOfficeCustomerCsv(body: {
  csv?: string;
  customers?: StartupOfficeCustomer[];
}) {
  return post<StartupOfficeCustomerCsvImportResponse>(
    "/startup-office/customers/csv",
    body,
  );
}

export function runStartupOfficeLoop(
  loopID: string,
  body?: {
    defer?: boolean;
    objective?: string;
    inputs?: Record<string, unknown>;
  },
) {
  return post<StartupOfficeLoopRunResponse>(
    `/startup-office/loops/${encodeURIComponent(loopID)}/run`,
    body ?? {},
  );
}

export function getStartupOfficeRun(runID: string) {
  return get<StartupOfficeRunDetailResponse>(
    `/startup-office/runs/${encodeURIComponent(runID)}`,
  );
}

export function retryStartupOfficeRun(
  runID: string,
  body?: { objective?: string },
) {
  return post<StartupOfficeRunMutationResponse>(
    `/startup-office/runs/${encodeURIComponent(runID)}/retry`,
    body ?? {},
  );
}

export function cancelStartupOfficeRun(runID: string) {
  return post<StartupOfficeRunCancelResponse>(
    `/startup-office/runs/${encodeURIComponent(runID)}/cancel`,
    {},
  );
}

export function retryStartupOfficeWorkerJob(
  jobID: string,
  body?: { note?: string },
) {
  return post<StartupOfficeWorkerJobActionResponse>(
    `/startup-office/admin/worker-jobs/${encodeURIComponent(jobID)}/retry`,
    body ?? {},
  );
}

export function cancelStartupOfficeWorkerJob(
  jobID: string,
  body?: { note?: string },
) {
  return post<StartupOfficeWorkerJobActionResponse>(
    `/startup-office/admin/worker-jobs/${encodeURIComponent(jobID)}/cancel`,
    body ?? {},
  );
}

export function approveStartupOfficeApproval(
  approvalID: string,
  body?: { note?: string },
) {
  return post<StartupOfficeApprovalActionResponse>(
    `/startup-office/approvals/${encodeURIComponent(approvalID)}/approve`,
    body ?? {},
  );
}

export function rejectStartupOfficeApproval(
  approvalID: string,
  body?: { reason?: string },
) {
  return post<StartupOfficeApprovalActionResponse>(
    `/startup-office/approvals/${encodeURIComponent(approvalID)}/reject`,
    body ?? {},
  );
}

export function reviseStartupOfficeApproval(
  approvalID: string,
  body?: { revision_note?: string },
) {
  return post<StartupOfficeApprovalActionResponse>(
    `/startup-office/approvals/${encodeURIComponent(approvalID)}/revise`,
    body ?? {},
  );
}

export function getStartupOfficeApprovalPolicy() {
  return get<StartupOfficePolicyResponse>("/startup-office/policy");
}

export function getStartupOfficeTerms() {
  return get<StartupOfficeTermsResponse>("/startup-office/terms");
}

export function acceptStartupOfficeTerms(body?: { acceptance_note?: string }) {
  return post<StartupOfficeTermsAcceptResponse>(
    "/startup-office/terms",
    body ?? {},
  );
}

export function updateStartupOfficeApprovalPolicy(
  policy: Partial<StartupOfficeApprovalPolicy>,
) {
  return patchJSON<StartupOfficePolicyResponse>("/startup-office/policy", {
    policy,
  });
}

export function updateStartupOfficeCompanyProfile(
  profile: StartupOfficeCompanyProfileUpdate,
) {
  return patchJSON<StartupOfficeCompanyProfileResponse>("/company/profile", {
    company_name: profile.name,
    company_profile: {
      icp: profile.icp,
      offer: profile.offer,
      positioning: profile.positioning,
      stage: profile.stage,
    },
    priority: profile.priority,
  });
}
