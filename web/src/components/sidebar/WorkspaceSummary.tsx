import { useQuery } from "@tanstack/react-query";

import { getUsage } from "../../api/client";
import { fetchReviews } from "../../api/notebook";
import { useOfficeMembers } from "../../hooks/useMembers";
import { useI18n } from "../../lib/i18n";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Small status line at the bottom of the sidebar. The primary product now
 * orients around cloud runs and approvals instead of project tasks.
 */
export function WorkspaceSummary() {
  const { data: members = [] } = useOfficeMembers();
  const { language, t: tr } = useI18n();
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews-sidebar-summary"],
    queryFn: fetchReviews,
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

  const pendingApprovals = reviews.filter((review) =>
    ["pending", "in-review", "changes-requested"].includes(review.state),
  ).length;

  const parts: string[] =
    language === "ko"
      ? [`활성 에이전트 ${activeAgents}명`, `승인 대기 ${pendingApprovals}개`]
      : [
          `${activeAgents} agent${activeAgents === 1 ? "" : "s"} ${tr("sidebar.active")}`,
          `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} ${tr("sidebar.open")}`,
        ];
  const total = usage?.total?.total_tokens ?? 0;
  if (total > 0) parts.push(`${formatTokens(total)} tokens`);

  const hint =
    pendingApprovals > 0
      ? language === "ko"
        ? `검토가 필요한 승인 ${pendingApprovals}개`
        : `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} ${tr("sidebar.inProgress")}`
      : tr("sidebar.commandsHint");

  return (
    <>
      <div className="sidebar-summary">{parts.join(", ")}</div>
      <div className="sidebar-hint">{hint}</div>
    </>
  );
}
