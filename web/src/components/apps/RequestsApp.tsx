import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AgentRequest,
  answerRequest,
  createDM,
  getAllRequests,
} from "../../api/client";
import { REQUEST_REFETCH_MS } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { directChannelSlug, useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";

type TranslationFn = (key: I18nKey) => string;

export function RequestsApp() {
  const enterDM = useAppStore((s) => s.enterDM);
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", "all"],
    queryFn: () => getAllRequests(),
    refetchInterval: REQUEST_REFETCH_MS,
  });

  if (isLoading) {
    return <div className="app-loading-state">{t("requests.loading")}</div>;
  }

  if (error) {
    return <div className="app-empty-state">{t("requests.failed")}</div>;
  }

  const allRequests = dedupeRequests(data);
  const pending = allRequests.filter(
    (r) => !r.status || r.status === "open" || r.status === "pending",
  );
  const answered = allRequests.filter(
    (r) => r.status && r.status !== "open" && r.status !== "pending",
  );
  const blocking = pending.filter((r) => r.blocking);

  const openAgentChat = (agentSlug: string) => {
    const slug = agentSlug.trim().toLowerCase();
    if (!isChatableAgent(slug)) return;
    createDM(slug)
      .then((dm) => {
        enterDM(slug, dm.slug || directChannelSlug(slug));
      })
      .catch((err: Error) => {
        showNotice(`Could not open @${slug}: ${err.message}`, "error");
      });
  };

  if (allRequests.length === 0) {
    return (
      <div className="requests-dashboard">
        <RequestsHeader t={t} />
        <div className="app-empty-state">{t("requests.empty")}</div>
      </div>
    );
  }

  return (
    <div className="requests-dashboard">
      <RequestsHeader t={t} />
      <section
        className="request-summary-strip"
        aria-label={t("requests.summary")}
      >
        <RequestSummaryItem
          label={t("requests.pending")}
          value={pending.length}
        />
        <RequestSummaryItem
          label={t("requests.blocking")}
          value={blocking.length}
        />
        <RequestSummaryItem
          label={t("requests.answered")}
          value={answered.length}
        />
      </section>

      {pending.length > 0 ? (
        <section className="request-list-section">
          <div className="app-section-title">
            {t("requests.pending")} ({pending.length})
          </div>
          <div className="request-list">
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
                onChatAgent={openAgentChat}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {answered.length > 0 ? (
        <section className="request-list-section">
          <div className="app-section-title">
            {t("requests.answered")} ({answered.length})
          </div>
          <div className="request-list">
            {answered.map((req) => (
              <RequestItem
                key={req.id}
                request={req}
                isPending={false}
                onChatAgent={openAgentChat}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RequestsHeader({ t }: { t: TranslationFn }) {
  return (
    <div className="app-section-heading">
      <h3>{t("requests.title")}</h3>
      <p>{t("requests.description")}</p>
    </div>
  );
}

function RequestSummaryItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="request-summary-item">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function isChatableAgent(slug: string | undefined): slug is string {
  const normalized = slug?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "human" && normalized !== "you");
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
  onChatAgent?: (agentSlug: string) => void;
  t: TranslationFn;
}

function RequestItem({
  request,
  isPending,
  onAnswer,
  onChatAgent,
  t,
}: RequestItemProps) {
  // Broker uses `options`; legacy used `choices`. Accept either.
  const options = request.options ?? request.choices ?? [];
  const ts = request.updated_at ?? request.created_at ?? request.timestamp;
  const from = request.from || "unknown";

  return (
    <article className="request-row">
      <div className="request-row-head">
        <div>
          <strong>@{from}</strong>
          {request.channel ? <span>#{request.channel}</span> : null}
        </div>
        {request.status ? (
          <span className="badge badge-accent">
            {request.status.toUpperCase()}
          </span>
        ) : null}
        {request.blocking ? (
          <span className="badge badge-yellow">{t("requests.blocking")}</span>
        ) : null}
      </div>

      {request.title && request.title !== "Request" ? (
        <div className="request-row-title">{request.title}</div>
      ) : null}

      <div className="request-row-question">{request.question || ""}</div>

      {request.context ? (
        <div className="request-row-context">{request.context}</div>
      ) : null}

      {ts ? (
        <div className="app-card-meta request-row-time">
          {formatRelativeTime(ts)}
        </div>
      ) : null}

      {isPending && options.length > 0 ? (
        <div className="request-row-actions">
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

      {isChatableAgent(from) ? (
        <div className="request-row-chat">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onChatAgent?.(from)}
          >
            {t("requests.chatWithAgent")} @{from}
          </button>
        </div>
      ) : null}

      {!isPending ? (
        <div className="request-row-answered">{t("requests.answered")}</div>
      ) : null}
    </article>
  );
}
