import { useQuery } from "@tanstack/react-query";

import { getOfficeTasks, getUsage } from "../../api/client";
import { useOfficeMembers } from "../../hooks/useMembers";
import { useI18n } from "../../lib/i18n";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Small status line at the bottom of the sidebar. Mirrors the legacy
 * `renderWorkspaceSummary` output: active agents, open tasks, total tokens.
 */
export function WorkspaceSummary() {
  const { data: members = [] } = useOfficeMembers();
  const { language, t: tr } = useI18n();
  const { data: tasksData } = useQuery({
    queryKey: ["office-tasks"],
    queryFn: () => getOfficeTasks({ includeDone: false }),
    refetchInterval: 30_000,
  });
  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage(),
    refetchInterval: 30_000,
  });

  const activeAgents = members.filter((m) => {
    if (!m.slug || m.slug === "human" || m.slug === "you") return false;
    return (m.status || "").toLowerCase() === "active";
  }).length;

  const openTasks = (tasksData?.tasks ?? []).filter((t) => {
    const s = (t.status || "").toLowerCase();
    return s && s !== "done" && s !== "completed";
  }).length;

  const parts: string[] =
    language === "ko"
      ? [`활성 에이전트 ${activeAgents}명`, `열린 작업 ${openTasks}개`]
      : [
          `${activeAgents} agent${activeAgents === 1 ? "" : "s"} ${tr("sidebar.active")}`,
          `${openTasks} task${openTasks === 1 ? "" : "s"} ${tr("sidebar.open")}`,
        ];
  const total = usage?.total?.total_tokens ?? 0;
  if (total > 0) parts.push(`${formatTokens(total)} tokens`);

  const hint =
    openTasks > 0
      ? language === "ko"
        ? `진행 중인 작업 ${openTasks}개`
        : `${openTasks} task${openTasks === 1 ? "" : "s"} ${tr("sidebar.inProgress")}`
      : tr("sidebar.commandsHint");

  return (
    <>
      <div className="sidebar-summary">{parts.join(", ")}</div>
      <div className="sidebar-hint">{hint}</div>
    </>
  );
}
