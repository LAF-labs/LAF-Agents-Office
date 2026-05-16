import type { Task } from "../../../api/client";
import type { OfficeMember } from "../../../hooks/useMembers";
import type { I18nKey } from "../../../lib/i18n";

type TranslationFn = (key: I18nKey) => string;

export const STATUS_ORDER = [
  "in_progress",
  "open",
  "review",
  "pending",
  "blocked",
  "done",
  "canceled",
] as const;

export type StatusGroup = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL_KEYS: Record<StatusGroup, I18nKey> = {
  in_progress: "tasks.status.inProgress",
  open: "tasks.status.open",
  review: "tasks.status.review",
  pending: "tasks.status.pending",
  blocked: "tasks.status.blocked",
  done: "tasks.status.done",
  canceled: "tasks.status.canceled",
};

export function normalizeStatus(raw: string): StatusGroup {
  const status = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "completed") return "done";
  if (status === "in_review") return "review";
  if (status === "cancelled") return "canceled";
  if ((STATUS_ORDER as readonly string[]).includes(status)) {
    return status as StatusGroup;
  }
  return "open";
}

export function isHumanSlug(slug: string): boolean {
  return slug === "human" || slug === "you";
}

export function agentLabel(slug: string, members: OfficeMember[]): string {
  const member = members.find((candidate) => candidate.slug === slug);
  if (!member?.name || member.name.toLowerCase() === slug) return `@${slug}`;
  return `${member.name} @${slug}`;
}

export function taskOwnerLabel(
  task: Task,
  members: OfficeMember[],
  t: TranslationFn,
): string {
  return task.owner ? agentLabel(task.owner, members) : t("tasks.unassigned");
}

export function taskCreatorLabel(
  task: Task,
  members: OfficeMember[],
  t: TranslationFn,
): string {
  const creator = task.created_by?.trim();
  if (!creator) return t("tasks.unassigned");
  if (isHumanSlug(creator)) return t("tasks.you");
  return agentLabel(creator, members);
}

function extractQuotedHumanDetail(raw: string): string {
  const reportedIssue = raw.match(/(?:reported .*? issue|issue):\s*`([^`]+)`/i);
  if (reportedIssue?.[1]) return reportedIssue[1].trim();

  const quoted = raw.match(
    /["'\u201c\u201d\u2018\u2019]([^"'\u201c\u201d\u2018\u2019]+)["'\u201c\u201d\u2018\u2019]/,
  );
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
      /(Task|Task) chat now routes/i.test(raw)) ||
    (/^No isolated .* worktree/i.test(raw) &&
      /The narrow repo fix/i.test(raw)) ||
    (/Inspect the .* flow/i.test(raw) &&
      /report the exact verification/i.test(raw))
  );
}

export function userEnteredTaskDetails(task: Task): string {
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
