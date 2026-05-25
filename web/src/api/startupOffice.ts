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
  id: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  name: string;
  run_id?: string | null;
  status?: string;
  updated_at?: string | null;
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
  billing: {
    billing_state: string;
    monthly_model_spend_cents: number;
    monthly_run_limit: number;
    plan: string;
  };
  limits: {
    monthly_model_spend_cents: number;
    monthly_run_limit: number;
    storage_mb_limit: number;
  };
  usage: {
    model_spend_cents: number;
    model_spend_percent: number;
    run_percent: number;
    runs: number;
    total_tokens: number;
  };
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

export interface StartupOfficeReceiptsResponse {
  receipts: StartupOfficeReceipt[];
}

export function getStartupOfficeGrowthSummary() {
  return get<StartupOfficeGrowthSummary>("/startup-office/growth-summary");
}

export function getStartupOfficeReceipts(opts?: { limit?: number }) {
  return get<StartupOfficeReceiptsResponse>("/startup-office/receipts", {
    limit: opts?.limit,
  });
}

export function runStartupOfficeLoop(
  loopID: string,
  body?: { defer?: boolean; objective?: string; inputs?: Record<string, unknown> },
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

export function retryStartupOfficeRun(runID: string, body?: { objective?: string }) {
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

export function retryStartupOfficeWorkerJob(jobID: string, body?: { note?: string }) {
  return post<StartupOfficeWorkerJobActionResponse>(
    `/startup-office/admin/worker-jobs/${encodeURIComponent(jobID)}/retry`,
    body ?? {},
  );
}

export function cancelStartupOfficeWorkerJob(jobID: string, body?: { note?: string }) {
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

export function updateStartupOfficeApprovalPolicy(
  policy: Partial<StartupOfficeApprovalPolicy>,
) {
  return patchJSON<StartupOfficePolicyResponse>(
    "/startup-office/policy",
    { policy },
  );
}

export function updateStartupOfficeCompanyProfile(
  profile: StartupOfficeCompanyProfileUpdate,
) {
  return patchJSON<StartupOfficeCompanyProfileResponse>(
    "/company/profile",
    {
      company_name: profile.name,
      company_profile: {
        icp: profile.icp,
        offer: profile.offer,
        positioning: profile.positioning,
        stage: profile.stage,
      },
      priority: profile.priority,
    },
  );
}
