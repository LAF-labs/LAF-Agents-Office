import { useQuery } from "@tanstack/react-query";

import { fetchReviews } from "../../api/notebook";
import { useOfficeMembers } from "../../hooks/useMembers";
import { useI18n } from "../../lib/i18n";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const RUNTIME_APPROVAL_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

/**
 * Thin strip under the channel header with operational runtime pills.
 */
export function RuntimeStrip() {
  const { data: members = [] } = useOfficeMembers();
  const { t: tr } = useI18n();
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews-runtime-strip"],
    queryFn: fetchReviews,
    refetchInterval: RUNTIME_APPROVAL_REFETCH_MS,
  });
  const active = members.filter((m) => {
    if (!m.slug || m.slug === "human" || m.slug === "you") return false;
    return (m.status || "").toLowerCase() === "active";
  }).length;

  const approvals = reviews.filter((review) =>
    ["pending", "in-review", "changes-requested"].includes(review.state),
  ).length;

  if (active === 0 && approvals === 0) {
    return (
      <div className="runtime-strip">
        <span className="runtime-pill runtime-pill-idle">
          {tr("runtime.allQuiet")}
        </span>
      </div>
    );
  }

  return (
    <div className="runtime-strip">
      {active > 0 && (
        <span className="runtime-pill runtime-pill-active">
          {active} {tr("runtime.active")}
        </span>
      )}
      {approvals > 0 && (
        <span className="runtime-pill runtime-pill-blocked">
          {approvals} {tr("runtime.needYou")}
        </span>
      )}
    </div>
  );
}
