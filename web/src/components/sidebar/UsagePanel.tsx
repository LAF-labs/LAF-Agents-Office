import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getModelAvailability, getUsage } from "../../api/client";
import { formatTokens } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

export function UsagePanel() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const { data: availability } = useQuery({
    queryKey: ["model-availability"],
    queryFn: () => getModelAvailability(),
    enabled: open,
    staleTime: 30_000,
  });

  const cliTokens =
    usage?.personal_cli?.total_tokens ?? usage?.session?.total_tokens ?? 0;
  const lafLocked = availability?.laf_model?.available === false;
  const lafPercent =
    usage?.laf_ai?.limit_percent ?? usage?.laf_ai?.percent ?? null;
  const lafLabel = !availability
    ? "-"
    : lafLocked
      ? t("sidebar.usageLocked")
      : typeof lafPercent === "number"
        ? `${Math.max(0, Math.min(100, lafPercent)).toFixed(0)}%`
        : t("sidebar.usageAvailable");
  const cliLabel =
    cliTokens > 0 ? `${formatTokens(cliTokens)} tokens` : "0 tokens";

  return (
    <div className="sidebar-usage-block">
      <button
        type="button"
        className={`sidebar-usage-button${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="sidebar-usage-icon"
          aria-hidden="true"
          focusable="false"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {t("sidebar.usage")}
      </button>
      {open ? (
        <div className="usage-panel open">
          <UsageLine label={t("sidebar.usagePersonalCli")} value={cliLabel} />
          <UsageLine label={t("sidebar.usageLafAi")} value={lafLabel} />
        </div>
      ) : null}
    </div>
  );
}

function UsageLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="usage-compact-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
