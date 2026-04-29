import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { type AgentLog, getAgentLogs } from "../../api/client";
import { formatRelativeTime, formatTokens, formatUSD } from "../../lib/format";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-logs"],
    queryFn: () => getAgentLogs({ limit: 100 }),
    refetchInterval: 10_000,
  });

  return (
    <>
      <div className="app-section-heading">
        <h3>Receipts</h3>
        <p>
          What each agent actually did, tool by tool. No claims {"\u2014"} just
          the log.
        </p>
      </div>

      {isLoading ? <div className="app-loading-state">Loading...</div> : null}

      {error ? (
        <div className="app-empty-state">Could not load receipts.</div>
      ) : null}

      {!(isLoading || error) ? (
        <LogTable logs={data?.logs ?? []} onSelectTask={onSelectTask} />
      ) : null}
    </>
  );
}

function LogTable({
  logs,
  onSelectTask,
}: {
  logs: AgentLog[];
  onSelectTask: (taskId: string) => void;
}) {
  if (logs.length === 0) {
    return (
      <div className="app-empty-state">
        No receipts yet. Agents write one when they use a tool.
      </div>
    );
  }

  return (
    <div className="app-table-shell">
      <table className="app-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Action</th>
            <th>Time</th>
            <th style={{ textAlign: "right" }}>Tokens</th>
            <th style={{ textAlign: "right" }}>Cost</th>
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
                <td style={{ fontWeight: 600 }}>{log.agent || "\u2014"}</td>
                <td
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {log.action || log.content?.slice(0, 60) || "\u2014"}
                </td>
                <td
                  style={{
                    color: "var(--text-secondary)",
                  }}
                >
                  {log.timestamp ? formatRelativeTime(log.timestamp) : "\u2014"}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {totalTokens > 0 ? formatTokens(totalTokens) : "\u2014"}
                </td>
                <td
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
        {"\u2190"} Back to receipts
      </button>

      <div className="app-section-heading">
        <h3 style={{ fontFamily: "var(--font-mono)" }}>{taskId}</h3>
        <p>Tool-by-tool trace of this task.</p>
      </div>

      {isLoading ? <div className="app-loading-state">Loading...</div> : null}

      {error ? (
        <div className="app-empty-state">Could not load task trace.</div>
      ) : null}

      {!(isLoading || error) && logs.length === 0 ? (
        <div className="app-empty-state">No tool calls in this task yet.</div>
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
                  {entry.action || "(unknown)"}
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
