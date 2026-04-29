import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AgentRequest,
  answerRequest,
  getRequests,
} from "../../api/client";
import { REQUEST_REFETCH_MS } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/format";
import { useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";

export function RequestsApp() {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", currentChannel],
    queryFn: () => getRequests(currentChannel),
    refetchInterval: REQUEST_REFETCH_MS,
  });

  if (isLoading) {
    return <div className="app-loading-state">Loading requests...</div>;
  }

  if (error) {
    return <div className="app-empty-state">Failed to load requests.</div>;
  }

  const allRequests = dedupeRequests(data);
  const pending = allRequests.filter(
    (r) => !r.status || r.status === "open" || r.status === "pending",
  );
  const answered = allRequests.filter(
    (r) => r.status && r.status !== "open" && r.status !== "pending",
  );

  if (allRequests.length === 0) {
    return (
      <>
        <RequestsHeader />
        <div className="app-empty-state">
          No requests right now. Your agents are working independently.
        </div>
      </>
    );
  }

  return (
    <>
      <RequestsHeader />
      {pending.length > 0 ? (
        <>
          <div className="app-section-title">Pending ({pending.length})</div>
          {pending.map((req) => (
            <RequestItem
              key={req.id}
              request={req}
              isPending={true}
              onAnswer={(choiceId) => {
                answerRequest(req.id, choiceId)
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["requests"] });
                  })
                  .catch((e: Error) =>
                    showNotice(`Answer failed: ${e.message}`, "error"),
                  );
              }}
            />
          ))}
        </>
      ) : null}

      {answered.length > 0 ? (
        <>
          <div className="app-section-title">Answered ({answered.length})</div>
          {answered.map((req) => (
            <RequestItem key={req.id} request={req} isPending={false} />
          ))}
        </>
      ) : null}
    </>
  );
}

function RequestsHeader() {
  return (
    <div className="app-section-heading">
      <h3>Requests</h3>
      <p>Questions that need a human decision before agent work continues.</p>
    </div>
  );
}

function dedupeRequests(
  data: { requests: AgentRequest[] } | undefined,
): AgentRequest[] {
  const raw = data?.requests ?? [];
  const seen = new Set<string>();
  return raw.filter((r) => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

interface RequestItemProps {
  request: AgentRequest;
  isPending: boolean;
  onAnswer?: (choiceId: string) => void;
}

function RequestItem({ request, isPending, onAnswer }: RequestItemProps) {
  // Broker uses `options`; legacy used `choices`. Accept either.
  const options = request.options ?? request.choices ?? [];
  const ts = request.updated_at ?? request.created_at ?? request.timestamp;

  return (
    <div className="app-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {request.from || "Unknown"}
        </span>
        {request.status ? (
          <span className="badge badge-accent">
            {request.status.toUpperCase()}
          </span>
        ) : null}
        {request.blocking ? (
          <span className="badge badge-yellow">BLOCKING</span>
        ) : null}
      </div>

      {request.title && request.title !== "Request" ? (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          {request.title}
        </div>
      ) : null}

      <div style={{ fontSize: 14, marginBottom: 8 }}>
        {request.question || ""}
      </div>

      {request.context ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {request.context}
        </div>
      ) : null}

      {ts ? (
        <div className="app-card-meta" style={{ marginBottom: 6 }}>
          {formatRelativeTime(ts)}
        </div>
      ) : null}

      {isPending && options.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {options.map((opt) => (
            <button
              type="button"
              key={opt.id}
              className={`btn btn-sm ${opt.id === request.recommended_id ? "btn-primary" : "btn-ghost"}`}
              title={opt.description}
              onClick={() => onAnswer?.(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      {!isPending ? (
        <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 500 }}>
          Answered
        </div>
      ) : null}
    </div>
  );
}
