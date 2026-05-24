import type {
  StartupOfficeCompanyProfile,
  StartupOfficeGrowthSummary,
  StartupOfficeLoop,
} from "../../api/startupOffice";
import type { StartupOfficeAppCopy } from "./startupOfficeCopy";

export const STARTUP_OFFICE_SUMMARY_QUERY_KEY = [
  "startup-office-growth-summary",
] as const;

export interface StartupOfficeProfileForm {
  icp: string;
  name: string;
  offer: string;
  positioning: string;
  priority: string;
  stage: string;
}

export function fallbackStartupOfficeSummary(
  copy: StartupOfficeAppCopy,
): StartupOfficeGrowthSummary {
  const loops = copy.defaultLoops.map((loop, index) => ({
    cadence: index === copy.defaultLoops.length - 1 ? "weekly" : "manual",
    department: "Startup Office",
    id: fallbackLoopSlug(loop.name, index),
    name: loop.name,
    objective: loop.detail,
    policy: { founder_approval_required: true },
    slug: fallbackLoopSlug(loop.name, index),
    status: "active",
  }));
  return {
    company_profile: {
      name: copy.companyFallback,
      priority: copy.goalFallback,
      stage: copy.stageFallback,
    },
    loops,
    pending_approvals: [],
    pulse: {
      active_loops: loops.length,
      pending_approvals: 0,
      recent_receipts: 0,
      recent_runs: 0,
    },
    recent_artifacts: [],
    recent_receipts: [],
    recent_runs: [],
  };
}

export function fallbackLoopSlug(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `loop-${index + 1}`;
}

export function visibleStartupOfficeLoops(
  summary: StartupOfficeGrowthSummary,
  copy: StartupOfficeAppCopy,
): StartupOfficeLoop[] {
  return summary.loops.length
    ? summary.loops
    : fallbackStartupOfficeSummary(copy).loops;
}

export function startupOfficeProfileForm(
  profile: StartupOfficeCompanyProfile,
  copy: StartupOfficeAppCopy,
): StartupOfficeProfileForm {
  return {
    icp: profile.icp || "",
    name: profile.name || copy.companyFallback,
    offer: profile.offer || "",
    positioning: profile.positioning || "",
    priority: profile.priority || profile.goals || copy.goalFallback,
    stage: profile.stage || copy.stageFallback,
  };
}

export function labelFromRecord(
  record: Record<string, string>,
  value?: string,
): string {
  const key = (value || "").trim();
  if (!key) return "-";
  return record[key] ?? key.replace(/_/g, " ");
}

export function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function approvalActionLabel(action: string, title: string): string {
  return `${action} ${title.replace(/^approve\s+/i, "")}`.trim();
}

export function dateLabel(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
