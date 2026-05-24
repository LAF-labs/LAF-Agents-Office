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

export interface StartupOfficeGrowthSummary {
  company_profile: StartupOfficeCompanyProfile;
  loops: StartupOfficeLoop[];
  memory_pages?: StartupOfficeMemoryPage[];
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

export interface StartupOfficeCompanyProfileUpdate {
  icp?: string;
  name?: string;
  offer?: string;
  positioning?: string;
  priority?: string;
  stage?: string;
}

export function getStartupOfficeGrowthSummary() {
  return get<StartupOfficeGrowthSummary>("/startup-office/growth-summary");
}

export function runStartupOfficeLoop(
  loopID: string,
  body?: { defer?: boolean; objective?: string; inputs?: Record<string, unknown> },
) {
  return post<{
    approval?: StartupOfficeApproval | null;
    artifact?: StartupOfficeArtifact | null;
    error?: string;
    receipt?: StartupOfficeReceipt | null;
    run?: StartupOfficeRun | null;
    status?: string;
    worker_job?: Record<string, unknown> | null;
  }>(`/startup-office/loops/${encodeURIComponent(loopID)}/run`, body ?? {});
}

export function getStartupOfficeRun(runID: string) {
  return get<{
    approvals: StartupOfficeApproval[];
    artifacts: StartupOfficeArtifact[];
    receipts: StartupOfficeReceipt[];
    run: StartupOfficeRun;
  }>(`/startup-office/runs/${encodeURIComponent(runID)}`);
}

export function retryStartupOfficeRun(runID: string, body?: { objective?: string }) {
  return post<{
    approval?: StartupOfficeApproval | null;
    artifact?: StartupOfficeArtifact | null;
    error?: string;
    receipt?: StartupOfficeReceipt | null;
    run?: StartupOfficeRun | null;
    status?: string;
  }>(`/startup-office/runs/${encodeURIComponent(runID)}/retry`, body ?? {});
}

export function cancelStartupOfficeRun(runID: string) {
  return post<{
    receipt?: StartupOfficeReceipt | null;
    run?: StartupOfficeRun | null;
    status?: string;
  }>(`/startup-office/runs/${encodeURIComponent(runID)}/cancel`, {});
}

export function approveStartupOfficeApproval(
  approvalID: string,
  body?: { note?: string },
) {
  return post<{
    approval?: StartupOfficeApproval | null;
    memory_diff?: Record<string, unknown> | null;
    memory_pages?: StartupOfficeMemoryPage[];
    receipt?: StartupOfficeReceipt | null;
    run?: StartupOfficeRun | null;
    status?: string;
  }>(
    `/startup-office/approvals/${encodeURIComponent(approvalID)}/approve`,
    body ?? {},
  );
}

export function rejectStartupOfficeApproval(
  approvalID: string,
  body?: { reason?: string },
) {
  return post<{
    approval?: StartupOfficeApproval | null;
    receipt?: StartupOfficeReceipt | null;
    run?: StartupOfficeRun | null;
    status?: string;
  }>(
    `/startup-office/approvals/${encodeURIComponent(approvalID)}/reject`,
    body ?? {},
  );
}

export function updateStartupOfficeCompanyProfile(
  profile: StartupOfficeCompanyProfileUpdate,
) {
  return patchJSON<{ profile: StartupOfficeCompanyProfile }>(
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
