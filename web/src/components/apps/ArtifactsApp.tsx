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
import { type Insight, InsightsList } from "../activity/InsightsList";
import { Timeline, type TimelineEvent } from "../activity/Timeline";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const ACTIVITY_LIVE_REFETCH_MS = liveEventsSupported ? 30_000 : 15_000;

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
    return (
      <div className="app-loading-state">Loading workspace activity...</div>
    );
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
      title: t.title || t.id || "Blocked task",
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
      title: w.summary || w.kind || "Watchdog alert",
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
        content: d.summary || d.reason || d.kind || "Decision",
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
        content: a.summary || a.name || a.title || "Action",
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
      />
      <div
        className="activity-columns"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <LeftActivityColumn
          activeTasks={activeTasks}
          liveAgents={liveAgents}
          actions={allActions}
        />
        <RightActivityColumn
          insights={insights}
          timelineEvents={timelineEvents}
          jobs={allJobs}
        />
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function ActivityHero() {
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
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>Office activity</h3>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 4,
          }}
        >
          Which lanes are moving, which agents are active, what decisions just
          got made, and where work is blocked.
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
}: {
  activeTasks: number;
  blockedTasks: number;
  watchdogs: number;
  liveAgents: number;
  actions: number;
  jobs: number;
  sessionTokens: string;
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
        kicker="Active lanes"
        value={String(activeTasks)}
        copy="Live tasks currently moving."
      />
      <StatCard
        kicker="Blocked lanes"
        value={String(blockedTasks)}
        copy="Tasks needing operator attention."
        anchorId="needs-attention"
      />
      <StatCard
        kicker="Watchdog alerts"
        value={String(watchdogs)}
        copy="Watchdogs firing right now."
        anchorId="needs-attention"
      />
      <StatCard
        kicker="Agents in motion"
        value={String(liveAgents)}
        copy="Specialists currently shipping or plotting."
      />
      <StatCard
        kicker="Recent actions"
        value={String(actions)}
        copy="Automation and system actions logged."
      />
      <StatCard
        kicker="Due automations"
        value={String(jobs)}
        copy="Scheduled jobs that are due now."
      />
      <StatCard
        kicker="Session tokens"
        value={sessionTokens}
        copy="Live token burn this session."
      />
    </div>
  );
}

function LeftActivityColumn({
  activeTasks,
  liveAgents,
  actions,
}: {
  activeTasks: Task[];
  liveAgents: OfficeMember[];
  actions: ActionRecord[];
}) {
  return (
    <div
      className="activity-column activity-column-left"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <ActiveLanesSection activeTasks={activeTasks} />
      <AgentPulseSection liveAgents={liveAgents} />
      <RecentActionsSection actions={actions} />
    </div>
  );
}

function RightActivityColumn({
  insights,
  timelineEvents,
  jobs,
}: {
  insights: Insight[];
  timelineEvents: TimelineEvent[];
  jobs: SchedulerJobRaw[];
}) {
  return (
    <div
      className="activity-column activity-column-right"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <ActivitySection
        title="Needs attention"
        meta={`${insights.length} items`}
        anchorId="needs-attention"
      >
        <InsightsList
          insights={insights}
          emptyLabel="No active blockers or watchdog alerts."
          limit={12}
        />
      </ActivitySection>
      <ActivitySection
        title="Recent activity"
        meta={`${timelineEvents.length} events`}
      >
        <Timeline
          events={timelineEvents}
          emptyLabel="No decisions or actions logged yet."
          limit={14}
        />
      </ActivitySection>
      <DueAutomationsSection jobs={jobs} />
    </div>
  );
}

function ActiveLanesSection({ activeTasks }: { activeTasks: Task[] }) {
  return (
    <ActivitySection
      title="Active lanes"
      meta={`${activeTasks.length} open or moving`}
    >
      {activeTasks.length === 0 ? (
        <EmptyState>No active lanes right now.</EmptyState>
      ) : (
        activeTasks
          .slice(0, 10)
          .map((task) => (
            <ActivityItem
              key={task.id}
              title={task.title || task.id || "Untitled task"}
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

function AgentPulseSection({ liveAgents }: { liveAgents: OfficeMember[] }) {
  return (
    <ActivitySection
      title="Agent pulse"
      meta={`${liveAgents.length} active right now`}
    >
      {liveAgents.length === 0 ? (
        <EmptyState>No agents are visibly moving right now.</EmptyState>
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
                  {member.task || activity.label}
                </div>
              </div>
            </div>
          );
        })
      )}
    </ActivitySection>
  );
}

function RecentActionsSection({ actions }: { actions: ActionRecord[] }) {
  return (
    <ActivitySection title="Recent actions" meta={`${actions.length} recorded`}>
      {actions.length === 0 ? (
        <EmptyState>No actions recorded yet.</EmptyState>
      ) : (
        actions
          .slice(0, 12)
          .map((action) => (
            <ActivityItem
              key={actionKey(action)}
              title={action.summary || action.name || action.title || "Action"}
              body={action.related_id ? `Related: ${action.related_id}` : ""}
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

function DueAutomationsSection({ jobs }: { jobs: SchedulerJobRaw[] }) {
  return (
    <ActivitySection title="Due automations" meta={`${jobs.length} due now`}>
      {jobs.length === 0 ? (
        <EmptyState>No jobs are due right now.</EmptyState>
      ) : (
        jobs
          .slice(0, 6)
          .map((job, idx) => (
            <ActivityItem
              key={job.slug ?? job.id ?? `due-${idx}`}
              title={job.label || job.slug || "Scheduled job"}
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
          letterSpacing: "0.06em",
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
      aria-label={`${kicker}: ${value}. Scroll to details.`}
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
