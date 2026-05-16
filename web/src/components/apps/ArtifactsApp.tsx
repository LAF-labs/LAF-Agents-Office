import { useQuery } from "@tanstack/react-query";

import {
  getActions,
  getDecisions,
  getOfficeMembers,
  getOfficeTasks,
  getScheduler,
  getUsage,
  getWatchdogs,
  type OfficeMember,
  type Task,
} from "../../api/client";
import { formatTokens } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { type Insight, InsightsList } from "../activity/InsightsList";
import { Timeline, type TimelineEvent } from "../activity/Timeline";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const ACTIVITY_LIVE_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

const ACTIVITY_COPY = {
  en: {
    loading: "Loading workspace activity...",
    title: "Office activity",
    desc: "Which lanes are moving, which agents are active, what decisions just got made, and where work is blocked.",
    blockedTask: "Blocked task",
    watchdogAlert: "Watchdog alert",
    decision: "Decision",
    action: "Action",
    activeLanes: "Active lanes",
    activeLanesCopy: "Live tasks currently moving.",
    blockedLanes: "Blocked lanes",
    blockedLanesCopy: "Tasks needing operator attention.",
    watchdogAlerts: "Watchdog alerts",
    watchdogAlertsCopy: "Watchdogs firing right now.",
    agentsInMotion: "Agents in motion",
    agentsInMotionCopy: "Specialists currently shipping or plotting.",
    recentActions: "Recent actions",
    recentActionsCopy: "Automation and system actions logged.",
    dueAutomations: "Due automations",
    dueAutomationsCopy: "Scheduled jobs that are due now.",
    sessionTokens: "Session tokens",
    sessionTokensCopy: "Live token burn this session.",
    needsAttention: "Needs attention",
    items: (count: number) => `${count} items`,
    noBlockers: "No active blockers or watchdog alerts.",
    recentActivity: "Recent activity",
    events: (count: number) => `${count} events`,
    noTimeline: "No decisions or actions logged yet.",
    openOrMoving: (count: number) => `${count} open or moving`,
    noActiveLanes: "No active lanes right now.",
    untitledTask: "Untitled task",
    agentPulse: "Agent pulse",
    activeNow: (count: number) => `${count} active right now`,
    noAgents: "No agents are visibly moving right now.",
    recorded: (count: number) => `${count} recorded`,
    noActions: "No actions recorded yet.",
    related: (id: string) => `Related: ${id}`,
    dueNow: (count: number) => `${count} due now`,
    noJobs: "No jobs are due right now.",
    scheduledJob: "Scheduled job",
    scrollToDetails: (kicker: string, value: string) =>
      `${kicker}: ${value}. Scroll to details.`,
    activityState: {
      shipping: "Shipping",
      plotting: "Plotting",
      lurking: "Idle",
    },
  },
  ko: {
    loading: "워크스페이스 활동을 불러오는 중...",
    title: "오피스 활동",
    desc: "어떤 작업이 움직이고 있는지, 어떤 에이전트가 활동 중인지, 방금 어떤 결정이 내려졌고 어디에서 막혔는지 보여줍니다.",
    blockedTask: "막힌 작업",
    watchdogAlert: "워치독 알림",
    decision: "결정",
    action: "작업",
    activeLanes: "활성 작업",
    activeLanesCopy: "현재 진행 중인 작업입니다.",
    blockedLanes: "막힌 작업",
    blockedLanesCopy: "운영자 확인이 필요한 작업입니다.",
    watchdogAlerts: "워치독 알림",
    watchdogAlertsCopy: "지금 감지된 워치독 알림입니다.",
    agentsInMotion: "활동 중인 에이전트",
    agentsInMotionCopy: "현재 실행하거나 준비 중인 담당자입니다.",
    recentActions: "최근 작업",
    recentActionsCopy: "자동화와 시스템 작업 기록입니다.",
    dueAutomations: "실행 예정 자동화",
    dueAutomationsCopy: "지금 실행 시점이 된 예약 작업입니다.",
    sessionTokens: "세션 토큰",
    sessionTokensCopy: "이 세션에서 사용한 토큰입니다.",
    needsAttention: "확인 필요",
    items: (count: number) => `${count}개 항목`,
    noBlockers: "현재 막힌 작업이나 워치독 알림이 없습니다.",
    recentActivity: "최근 활동",
    events: (count: number) => `이벤트 ${count}개`,
    noTimeline: "아직 결정이나 작업 기록이 없습니다.",
    openOrMoving: (count: number) => `열림 또는 진행 중 ${count}개`,
    noActiveLanes: "지금 진행 중인 작업이 없습니다.",
    untitledTask: "제목 없는 작업",
    agentPulse: "에이전트 활동",
    activeNow: (count: number) => `현재 활성 ${count}명`,
    noAgents: "현재 눈에 띄게 움직이는 에이전트가 없습니다.",
    recorded: (count: number) => `기록 ${count}개`,
    noActions: "아직 작업 기록이 없습니다.",
    related: (id: string) => `관련 항목: ${id}`,
    dueNow: (count: number) => `지금 실행 ${count}개`,
    noJobs: "지금 실행할 예약 작업이 없습니다.",
    scheduledJob: "예약 작업",
    scrollToDetails: (kicker: string, value: string) =>
      `${kicker}: ${value}. 자세한 내용으로 이동합니다.`,
    activityState: {
      shipping: "실행 중",
      plotting: "준비 중",
      lurking: "대기",
    },
  },
} as const;

function useActivityCopy() {
  const { language } = useI18n();
  return ACTIVITY_COPY[language] ?? ACTIVITY_COPY.en;
}

/** Minimal action/decision/watchdog shapes from the untyped endpoints. */
interface ActionRecord {
  id?: string;
  summary?: string;
  name?: string;
  title?: string;
  kind?: string;
  type?: string;
  channel?: string;
  actor?: string;
  source?: string;
  created_at?: string;
  related_id?: string;
}

interface DecisionRecord {
  summary?: string;
  kind?: string;
  reason?: string;
  channel?: string;
  owner?: string;
  created_at?: string;
  requires_human?: boolean;
  blocking?: boolean;
}

interface WatchdogRecord {
  summary?: string;
  kind?: string;
  channel?: string;
  owner?: string;
  target_type?: string;
  target_id?: string;
  updated_at?: string;
  created_at?: string;
}

interface SchedulerJobRaw {
  id?: string;
  label?: string;
  slug?: string;
  status?: string;
  channel?: string;
  provider?: string;
  workflow_key?: string;
  skill_name?: string;
  kind?: string;
  next_run?: string;
  due_at?: string;
}

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "completed") return "done";
  return s;
}

function classifyMemberActivity(member: OfficeMember): {
  state: string;
  label: string;
} {
  if (member.status === "shipping" || member.task)
    return { state: "shipping", label: "Shipping" };
  if (member.status === "plotting")
    return { state: "plotting", label: "Plotting" };
  return { state: "lurking", label: "Idle" };
}

export function ArtifactsApp() {
  const copy = useActivityCopy();
  const tasks = useQuery({
    queryKey: ["activity-tasks"],
    queryFn: () => getOfficeTasks({ includeDone: true }),
    refetchInterval: ACTIVITY_LIVE_REFETCH_MS,
  });

  const actions = useQuery({
    queryKey: ["activity-actions"],
    queryFn: () => getActions() as Promise<{ actions: ActionRecord[] }>,
    refetchInterval: ACTIVITY_LIVE_REFETCH_MS,
  });

  const decisions = useQuery({
    queryKey: ["activity-decisions"],
    queryFn: () => getDecisions() as Promise<{ decisions: DecisionRecord[] }>,
    refetchInterval: 15_000,
  });

  const watchdogs = useQuery({
    queryKey: ["activity-watchdogs"],
    queryFn: () => getWatchdogs() as Promise<{ watchdogs: WatchdogRecord[] }>,
    refetchInterval: 15_000,
  });

  const scheduler = useQuery({
    queryKey: ["activity-scheduler"],
    queryFn: () => getScheduler({ dueOnly: true }),
    refetchInterval: 15_000,
  });

  const usage = useQuery({
    queryKey: ["activity-usage"],
    queryFn: () => getUsage(),
    refetchInterval: 15_000,
  });

  const members = useQuery({
    queryKey: ["activity-members"],
    queryFn: () => getOfficeMembers(),
    refetchInterval: ACTIVITY_LIVE_REFETCH_MS,
  });

  const isLoading =
    tasks.isLoading ||
    actions.isLoading ||
    decisions.isLoading ||
    watchdogs.isLoading ||
    scheduler.isLoading ||
    usage.isLoading ||
    members.isLoading;

  if (isLoading) {
    return <div className="app-loading-state">{copy.loading}</div>;
  }

  const allTasks = tasks.data?.tasks ?? [];
  const allActions = (
    (actions.data as { actions?: ActionRecord[] })?.actions ?? []
  ).slice();
  const allDecisions = (
    (decisions.data as { decisions?: DecisionRecord[] })?.decisions ?? []
  ).slice();
  const allWatchdogs = (
    (watchdogs.data as { watchdogs?: WatchdogRecord[] })?.watchdogs ?? []
  ).slice();
  const allJobs = (scheduler.data?.jobs ?? []) as unknown as SchedulerJobRaw[];
  const usageData = usage.data;
  const allMembers = members.data?.members ?? [];

  const activeTasks = allTasks.filter((t) => {
    const s = normalizeStatus(t.status);
    return s === "in_progress" || s === "review" || s === "open";
  });
  const blockedTasks = allTasks.filter(
    (t) => normalizeStatus(t.status) === "blocked",
  );
  const liveAgents = allMembers.filter(
    (m) =>
      m.slug !== "human" &&
      m.slug !== "you" &&
      classifyMemberActivity(m).state !== "lurking",
  );

  allActions.sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
  allDecisions.sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  const insights: Insight[] = [
    ...blockedTasks.map<Insight>((t) => ({
      priority: "high",
      category: "task",
      title: t.title || t.id || copy.blockedTask,
      body: t.description,
      target:
        [t.channel ? `#${t.channel}` : "", t.owner ? `@${t.owner}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
      time: t.updated_at
        ? new Date(t.updated_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : undefined,
    })),
    ...allWatchdogs.map<Insight>((w) => ({
      priority: w.kind?.toLowerCase() === "critical" ? "critical" : "high",
      category: w.kind || "watchdog",
      title: w.summary || w.kind || copy.watchdogAlert,
      body: w.target_type
        ? `${w.target_type}${w.target_id ? ` · ${w.target_id}` : ""}`
        : undefined,
      target: w.channel ? `#${w.channel}` : undefined,
      time:
        w.updated_at || w.created_at
          ? new Date(w.updated_at || w.created_at || "").toLocaleTimeString(
              [],
              { hour: "numeric", minute: "2-digit" },
            )
          : undefined,
    })),
  ];

  const timelineEvents: TimelineEvent[] = [
    ...allDecisions
      .filter((d) => d.created_at)
      .map<TimelineEvent>((d) => ({
        type: d.blocking ? "watchdog" : "decision",
        timestamp: d.created_at || "",
        actor: d.owner,
        content: d.summary || d.reason || d.kind || copy.decision,
        meta:
          [d.channel ? `#${d.channel}` : "", d.kind || ""]
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
    ...allActions
      .filter((a) => a.created_at)
      .map<TimelineEvent>((a) => ({
        type: "action",
        timestamp: a.created_at || "",
        actor: a.actor,
        content: a.summary || a.name || a.title || copy.action,
        meta:
          [a.channel ? `#${a.channel}` : "", a.kind || a.type || ""]
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
  ];

  return (
    <div
      className="activity-dashboard"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <ActivityHero />
      <StatsGrid
        activeTasks={activeTasks.length}
        blockedTasks={blockedTasks.length}
        watchdogs={allWatchdogs.length}
        liveAgents={liveAgents.length}
        actions={allActions.length}
        jobs={allJobs.length}
        sessionTokens={formatTokens(usageData?.session?.total_tokens ?? 0)}
        copy={copy}
      />
      <div
        className="activity-columns"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <LeftActivityColumn
          activeTasks={activeTasks}
          liveAgents={liveAgents}
          actions={allActions}
          copy={copy}
        />
        <RightActivityColumn
          insights={insights}
          timelineEvents={timelineEvents}
          jobs={allJobs}
          copy={copy}
        />
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function ActivityHero() {
  const copy = useActivityCopy();
  return (
    <div
      className="activity-hero"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{copy.title}</h3>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 4,
          }}
        >
          {copy.desc}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          whiteSpace: "nowrap",
        }}
      >
        {new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

function StatsGrid({
  activeTasks,
  blockedTasks,
  watchdogs,
  liveAgents,
  actions,
  jobs,
  sessionTokens,
  copy,
}: {
  activeTasks: number;
  blockedTasks: number;
  watchdogs: number;
  liveAgents: number;
  actions: number;
  jobs: number;
  sessionTokens: string;
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <div
      className="activity-stats-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 10,
      }}
    >
      <StatCard
        kicker={copy.activeLanes}
        value={String(activeTasks)}
        copy={copy.activeLanesCopy}
      />
      <StatCard
        kicker={copy.blockedLanes}
        value={String(blockedTasks)}
        copy={copy.blockedLanesCopy}
        anchorId="needs-attention"
      />
      <StatCard
        kicker={copy.watchdogAlerts}
        value={String(watchdogs)}
        copy={copy.watchdogAlertsCopy}
        anchorId="needs-attention"
      />
      <StatCard
        kicker={copy.agentsInMotion}
        value={String(liveAgents)}
        copy={copy.agentsInMotionCopy}
      />
      <StatCard
        kicker={copy.recentActions}
        value={String(actions)}
        copy={copy.recentActionsCopy}
      />
      <StatCard
        kicker={copy.dueAutomations}
        value={String(jobs)}
        copy={copy.dueAutomationsCopy}
      />
      <StatCard
        kicker={copy.sessionTokens}
        value={sessionTokens}
        copy={copy.sessionTokensCopy}
      />
    </div>
  );
}

function LeftActivityColumn({
  activeTasks,
  liveAgents,
  actions,
  copy,
}: {
  activeTasks: Task[];
  liveAgents: OfficeMember[];
  actions: ActionRecord[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <div
      className="activity-column activity-column-left"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <ActiveLanesSection activeTasks={activeTasks} copy={copy} />
      <AgentPulseSection liveAgents={liveAgents} copy={copy} />
      <RecentActionsSection actions={actions} copy={copy} />
    </div>
  );
}

function RightActivityColumn({
  insights,
  timelineEvents,
  jobs,
  copy,
}: {
  insights: Insight[];
  timelineEvents: TimelineEvent[];
  jobs: SchedulerJobRaw[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <div
      className="activity-column activity-column-right"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <ActivitySection
        title={copy.needsAttention}
        meta={copy.items(insights.length)}
        anchorId="needs-attention"
      >
        <InsightsList
          insights={insights}
          emptyLabel={copy.noBlockers}
          limit={12}
        />
      </ActivitySection>
      <ActivitySection
        title={copy.recentActivity}
        meta={copy.events(timelineEvents.length)}
      >
        <Timeline
          events={timelineEvents}
          emptyLabel={copy.noTimeline}
          limit={14}
        />
      </ActivitySection>
      <DueAutomationsSection jobs={jobs} copy={copy} />
    </div>
  );
}

function ActiveLanesSection({
  activeTasks,
  copy,
}: {
  activeTasks: Task[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <ActivitySection
      title={copy.activeLanes}
      meta={copy.openOrMoving(activeTasks.length)}
    >
      {activeTasks.length === 0 ? (
        <EmptyState>{copy.noActiveLanes}</EmptyState>
      ) : (
        activeTasks
          .slice(0, 10)
          .map((task) => (
            <ActivityItem
              key={task.id}
              title={task.title || task.id || copy.untitledTask}
              body={task.description ?? ""}
              meta={[
                task.channel ? `#${task.channel}` : "",
                task.owner ? `@${task.owner}` : "",
              ].filter(Boolean)}
              kindLabel={normalizeStatus(task.status).replace(/_/g, " ")}
            />
          ))
      )}
    </ActivitySection>
  );
}

function AgentPulseSection({
  liveAgents,
  copy,
}: {
  liveAgents: OfficeMember[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <ActivitySection
      title={copy.agentPulse}
      meta={copy.activeNow(liveAgents.length)}
    >
      {liveAgents.length === 0 ? (
        <EmptyState>{copy.noAgents}</EmptyState>
      ) : (
        liveAgents.slice(0, 10).map((member) => {
          const activity = classifyMemberActivity(member);
          return (
            <div
              key={member.slug}
              className="app-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span className={`status-dot ${activity.state}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {member.name || member.slug}
                </div>
                <div className="app-card-meta">
                  {member.task ||
                    copy.activityState[
                      activity.state as keyof typeof copy.activityState
                    ] ||
                    activity.label}
                </div>
              </div>
            </div>
          );
        })
      )}
    </ActivitySection>
  );
}

function RecentActionsSection({
  actions,
  copy,
}: {
  actions: ActionRecord[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <ActivitySection
      title={copy.recentActions}
      meta={copy.recorded(actions.length)}
    >
      {actions.length === 0 ? (
        <EmptyState>{copy.noActions}</EmptyState>
      ) : (
        actions
          .slice(0, 12)
          .map((action) => (
            <ActivityItem
              key={actionKey(action)}
              title={
                action.summary || action.name || action.title || copy.action
              }
              body={action.related_id ? copy.related(action.related_id) : ""}
              meta={[
                action.channel ? `#${action.channel}` : "",
                action.actor ? `@${action.actor}` : "",
                action.created_at
                  ? new Date(action.created_at).toLocaleString()
                  : "",
              ].filter(Boolean)}
              kindLabel={action.kind || action.type || "action"}
            />
          ))
      )}
    </ActivitySection>
  );
}

function DueAutomationsSection({
  jobs,
  copy,
}: {
  jobs: SchedulerJobRaw[];
  copy: ReturnType<typeof useActivityCopy>;
}) {
  return (
    <ActivitySection
      title={copy.dueAutomations}
      meta={copy.dueNow(jobs.length)}
    >
      {jobs.length === 0 ? (
        <EmptyState>{copy.noJobs}</EmptyState>
      ) : (
        jobs
          .slice(0, 6)
          .map((job, idx) => (
            <ActivityItem
              key={job.slug ?? job.id ?? `due-${idx}`}
              title={job.label || job.slug || copy.scheduledJob}
              body={job.workflow_key || job.skill_name || job.kind || ""}
              meta={[
                job.channel ? `#${job.channel}` : "",
                job.provider ?? "",
                job.next_run || job.due_at
                  ? new Date(job.next_run || job.due_at || "").toLocaleString()
                  : "",
              ].filter(Boolean)}
              kindLabel={job.status || "scheduled"}
            />
          ))
      )}
    </ActivitySection>
  );
}

interface StatCardProps {
  kicker: string;
  value: string;
  copy: string;
  anchorId?: string;
}

function StatCard({ kicker, value, copy, anchorId }: StatCardProps) {
  const activityCopy = useActivityCopy();
  const activate = () => {
    if (!anchorId) return;
    const target = document.getElementById(anchorId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const content = (
    <>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0",
          color: "var(--text-tertiary)",
        }}
      >
        {kicker}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 2px" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{copy}</div>
    </>
  );

  if (!anchorId) {
    return (
      <div className="app-card" style={{ padding: "12px 14px" }}>
        {content}
      </div>
    );
  }

  return (
    <a
      className="app-card"
      href={`#${anchorId}`}
      style={{
        padding: "12px 14px",
        cursor: "pointer",
        display: "block",
        textDecoration: "none",
      }}
      onClick={(e) => {
        e.preventDefault();
        activate();
      }}
      aria-label={activityCopy.scrollToDetails(kicker, value)}
    >
      {content}
    </a>
  );
}

function ActivitySection({
  title,
  meta,
  children,
  anchorId,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  anchorId?: string;
}) {
  return (
    <section id={anchorId} style={{ scrollMarginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {meta ? <div className="app-card-meta">{meta}</div> : null}
      </div>
      <div className="app-section-stack">{children}</div>
    </section>
  );
}

function ActivityItem({
  title,
  body,
  meta,
  kindLabel,
}: {
  title: string;
  body: string;
  meta: string[];
  kindLabel: string;
}) {
  return (
    <div className="app-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span className="badge badge-accent">{kindLabel}</span>
        <span className="app-card-title" style={{ marginBottom: 0 }}>
          {title}
        </span>
      </div>
      {body ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 4,
          }}
        >
          {body}
        </div>
      ) : null}
      {meta.length > 0 ? (
        <div className="app-card-meta">{meta.join(" \u2022 ")}</div>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="app-empty-state">{children}</div>;
}

function actionKey(action: ActionRecord): string {
  return (
    action.id ||
    [
      action.created_at,
      action.actor,
      action.source,
      action.channel,
      action.kind ?? action.type,
      action.summary ?? action.name ?? action.title,
      action.related_id,
    ]
      .filter(Boolean)
      .join("|") ||
    "action"
  );
}
