import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { type AgentLog, getAgentLogs } from "../../api/client";
import { formatRelativeTime, formatTokens, formatUSD } from "../../lib/format";
import { useUiText } from "../../lib/uiText";

export function ReceiptsApp() {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  if (selectedTask) {
    return (
      <ReceiptDetail
        taskId={selectedTask}
        onBack={() => setSelectedTask(null)}
      />
    );
  }

  return <ReceiptList onSelectTask={setSelectedTask} />;
}

function ReceiptList({
  onSelectTask,
}: {
  onSelectTask: (taskId: string) => void;
}) {
  const { receipts: copy } = useUiText();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-logs"],
    queryFn: () => getAgentLogs({ limit: 100 }),
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
          logs={data?.logs ?? []}
          onSelectTask={onSelectTask}
        />
      ) : null}
    </>
  );
}

function LogTable({
  copy,
  logs,
  onSelectTask,
}: {
  copy: ReturnType<typeof useUiText>["receipts"];
  logs: AgentLog[];
  onSelectTask: (taskId: string) => void;
}) {
  if (logs.length === 0) {
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
          {logs.map((log) => {
            const totalTokens = log.usage?.total_tokens ?? 0;
            const cost = log.usage?.cost_usd ?? 0;
            return (
              <tr
                key={log.id}
                data-clickable={log.task ? "true" : undefined}
                onClick={() => log.task && onSelectTask(log.task)}
              >
                <td data-label={copy.agent} style={{ fontWeight: 600 }}>
                  {log.agent || "\u2014"}
                </td>
                <td
                  data-label={copy.action}
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {log.action || log.content?.slice(0, 60) || "\u2014"}
                </td>
                <td
                  data-label={copy.time}
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {log.timestamp ? formatRelativeTime(log.timestamp) : "\u2014"}
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
                  {cost > 0 ? formatUSD(cost) : "\u2014"}
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
  taskId,
  onBack,
}: {
  taskId: string;
  onBack: () => void;
}) {
  const { receipts: copy } = useUiText();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-logs", taskId],
    queryFn: () => getAgentLogs({ task: taskId }),
  });

  const logs = data?.logs ?? [];

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
        <h3 style={{ fontFamily: "var(--font-mono)" }}>{taskId}</h3>
        <p>{copy.traceDesc}</p>
      </div>

      {isLoading ? (
        <div className="app-loading-state">{copy.loading}</div>
      ) : null}

      {error ? <div className="app-empty-state">{copy.traceError}</div> : null}

      {!(isLoading || error) && logs.length === 0 ? (
        <div className="app-empty-state">{copy.traceEmpty}</div>
      ) : null}

      {!(isLoading || error) && logs.length > 0 ? (
        <div className="app-table-shell app-trace-list">
          {logs.map((entry, i) => (
            <div key={entry.id} className="app-trace-entry">
              <div className="app-trace-entry-head">
                <span className="app-trace-index">
                  #{i + 1}{" "}
                  {entry.timestamp
                    ? new Date(entry.timestamp).toLocaleTimeString()
                    : "\u2014"}
                </span>
                <span className="app-trace-action">
                  {entry.action || copy.unknown}
                </span>
                {entry.agent ? (
                  <span className="app-trace-agent">@{entry.agent}</span>
                ) : null}
              </div>
              {entry.content ? (
                <div className="app-trace-content">
                  {entry.content.slice(0, 200)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
