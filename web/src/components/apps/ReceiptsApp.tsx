import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getStartupOfficeReceipts,
  getStartupOfficeRun,
  type StartupOfficeReceipt,
} from "../../api/startupOffice";
import { formatRelativeTime, formatTokens, formatUSD } from "../../lib/format";
import { useUiText } from "../../lib/uiText";

export function ReceiptsApp() {
  const [selectedRunID, setSelectedRunID] = useState<string | null>(null);

  if (selectedRunID) {
    return (
      <ReceiptDetail
        runID={selectedRunID}
        onBack={() => setSelectedRunID(null)}
      />
    );
  }

  return <ReceiptList onSelectRun={setSelectedRunID} />;
}

function ReceiptList({
  onSelectRun,
}: {
  onSelectRun: (runID: string) => void;
}) {
  const { receipts: copy } = useUiText();
  const { data, isLoading, error } = useQuery({
    queryKey: ["startup-office-receipts"],
    queryFn: () => getStartupOfficeReceipts({ limit: 100 }),
    refetchInterval: 10_000,
  });

  return (
    <>
      <div className="app-section-heading">
        <h3>{copy.title}</h3>
        <p>{copy.desc}</p>
      </div>

      {isLoading ? (
        <div className="app-loading-state">{copy.loading}</div>
      ) : null}

      {error ? <div className="app-empty-state">{copy.loadError}</div> : null}

      {!(isLoading || error) ? (
        <LogTable
          copy={copy}
          onSelectRun={onSelectRun}
          receipts={data?.receipts ?? []}
        />
      ) : null}
    </>
  );
}

function LogTable({
  copy,
  onSelectRun,
  receipts,
}: {
  copy: ReturnType<typeof useUiText>["receipts"];
  onSelectRun: (runID: string) => void;
  receipts: StartupOfficeReceipt[];
}) {
  if (receipts.length === 0) {
    return <div className="app-empty-state">{copy.empty}</div>;
  }

  return (
    <div className="app-table-shell">
      <table className="app-table">
        <thead>
          <tr>
            <th>{copy.agent}</th>
            <th>{copy.action}</th>
            <th>{copy.time}</th>
            <th style={{ textAlign: "right" }}>{copy.tokens}</th>
            <th style={{ textAlign: "right" }}>{copy.cost}</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((receipt) => {
            const cost = receiptCost(receipt);
            const { totalTokens } = cost;
            return (
              <tr
                key={receipt.id}
                data-clickable={receipt.run_id ? "true" : undefined}
                onClick={() => receipt.run_id && onSelectRun(receipt.run_id)}
              >
                <td data-label={copy.agent} style={{ fontWeight: 600 }}>
                  {receipt.actor_slug || "\u2014"}
                </td>
                <td
                  data-label={copy.action}
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {receipt.event_type ||
                    receipt.summary?.slice(0, 60) ||
                    "\u2014"}
                </td>
                <td
                  data-label={copy.time}
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {receipt.created_at
                    ? formatRelativeTime(receipt.created_at)
                    : "\u2014"}
                </td>
                <td
                  data-label={copy.tokens}
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {totalTokens > 0 ? formatTokens(totalTokens) : "\u2014"}
                </td>
                <td
                  data-label={copy.cost}
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {cost.usd > 0 ? formatUSD(cost.usd) : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptDetail({
  runID,
  onBack,
}: {
  runID: string;
  onBack: () => void;
}) {
  const { receipts: copy } = useUiText();
  const { data, isLoading, error } = useQuery({
    queryKey: ["startup-office-run", runID],
    queryFn: () => getStartupOfficeRun(runID),
  });

  const receipts = data?.receipts ?? [];

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm app-back-button"
        onClick={onBack}
      >
        {"\u2190"} {copy.back}
      </button>

      <div className="app-section-heading">
        <h3 style={{ fontFamily: "var(--font-mono)" }}>{runID}</h3>
        <p>{copy.traceDesc}</p>
      </div>

      {isLoading ? (
        <div className="app-loading-state">{copy.loading}</div>
      ) : null}

      {error ? <div className="app-empty-state">{copy.traceError}</div> : null}

      {!(isLoading || error) && receipts.length === 0 ? (
        <div className="app-empty-state">{copy.traceEmpty}</div>
      ) : null}

      {!(isLoading || error) && receipts.length > 0 ? (
        <div className="app-table-shell app-trace-list">
          {receipts.map((entry, i) => (
            <div key={entry.id} className="app-trace-entry">
              <div className="app-trace-entry-head">
                <span className="app-trace-index">
                  #{i + 1}{" "}
                  {entry.created_at
                    ? new Date(entry.created_at).toLocaleTimeString()
                    : "\u2014"}
                </span>
                <span className="app-trace-action">
                  {entry.event_type || copy.unknown}
                </span>
                {entry.actor_slug ? (
                  <span className="app-trace-agent">@{entry.actor_slug}</span>
                ) : null}
              </div>
              {entry.summary ? (
                <div className="app-trace-content">
                  {entry.summary.slice(0, 200)}
                </div>
              ) : null}
              {entry.integrity?.digest ? (
                <div className="app-trace-integrity">
                  <span>{copy.digest}</span>
                  <code title={entry.integrity.digest}>
                    {shortDigest(entry.integrity.digest)}
                  </code>
                  {entry.integrity.signed ? null : (
                    <span className="app-trace-integrity-badge">
                      {copy.unsigned}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function receiptCost(receipt: StartupOfficeReceipt): {
  totalTokens: number;
  usd: number;
} {
  const trace = objectValue(receipt.trace);
  const cost = objectValue(trace.cost);
  return {
    totalTokens: numberValue(cost.total_tokens),
    usd: numberValue(cost.estimated_usd),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function shortDigest(digest: string): string {
  return digest.length > 20
    ? `${digest.slice(0, 12)}...${digest.slice(-8)}`
    : digest;
}
