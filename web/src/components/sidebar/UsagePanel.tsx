import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUsage } from "../../api/client";
import { formatTokens, formatUSD } from "../../lib/format";
import { useI18n } from "../../lib/i18n";

export function UsagePanel() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage(),
    refetchInterval: open ? 5000 : false,
  });

  const totalCost = usage?.total?.cost_usd ?? 0;
  const agents = usage?.agents ?? {};
  const slugs = Object.keys(agents).sort();

  return (
    <>
      <button
        type="button"
        className={`usage-toggle${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="usage-toggle-icon"
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
        <span style={{ marginLeft: "auto", fontWeight: 400 }}>
          {formatUSD(totalCost)}
        </span>
      </button>
      {open ? (
        <div className="usage-panel open">
          {slugs.length === 0 && totalCost === 0 ? (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                padding: "4px 0",
              }}
            >
              {t("sidebar.noUsage")}
            </p>
          ) : (
            <>
              <table className="usage-table">
                <thead>
                  <tr>
                    {[
                      t("sidebar.usageAgent"),
                      t("sidebar.usageIn"),
                      t("sidebar.usageOut"),
                      t("sidebar.usageCache"),
                      t("sidebar.usageCost"),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slugs.map((slug) => {
                    const a = agents[slug];
                    return (
                      <tr key={slug}>
                        <td>{slug}</td>
                        <td>{formatTokens(a.input_tokens)}</td>
                        <td>{formatTokens(a.output_tokens)}</td>
                        <td>{formatTokens(a.cache_read_tokens)}</td>
                        <td>{formatUSD(a.cost_usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="usage-total">
                <span>
                  {t("sidebar.usageSession")}:{" "}
                  {formatTokens(usage?.session?.total_tokens ?? 0)} tokens
                </span>
                <span className="usage-total-cost">{formatUSD(totalCost)}</span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
