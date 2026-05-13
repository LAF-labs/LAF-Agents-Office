import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flash } from "iconoir-react";

import {
  getSkills,
  getUsage,
  invokeSkill,
  type Skill,
  type UsageData,
  updateSkill,
} from "../../api/client";
import {
  fetchCatalog as fetchNotebookCatalog,
  fetchReviews,
  type NotebookCatalogSummary,
  type ReviewItem,
} from "../../api/notebook";
import {
  fetchPlaybooks,
  fetchSynthesisStatus,
  type PlaybookSummary,
  type PlaybookSynthesisStatus,
} from "../../api/playbook";
import { fetchCatalog as fetchWikiCatalog } from "../../api/wiki";
import { formatTokens, formatUSD } from "../../lib/format";
import { type SkillsSection, useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";

const SYNTHESIS_STATUS_LIMIT = 20;
const PENDING_REVIEW_STATES = new Set([
  "pending",
  "in-review",
  "changes-requested",
]);

type GrowthInboxItem = {
  id: string;
  label: string;
  detail: string;
  tone?: "warning" | "neutral";
};

type GrowthModel = {
  metrics: Array<{ label: string; value: string; detail?: string }>;
  inbox: GrowthInboxItem[];
  playbooks: PlaybookMaturityRow[];
};

type PlaybookMaturityRow = {
  playbook: PlaybookSummary;
  status: PlaybookSynthesisStatus | null;
};

export function SkillsApp() {
  const section = useAppStore((s) => s.skillsSection);
  const setSection = useAppStore((s) => s.setSkillsSection);

  return (
    <section className="skills-growth" aria-label="Skills Growth Center">
      <SkillsHeader section={section} onSectionChange={setSection} />
      {section === "list" ? <SkillList /> : <SkillsDashboard />}
    </section>
  );
}

function SkillsHeader({
  section,
  onSectionChange,
}: {
  section: SkillsSection;
  onSectionChange: (section: SkillsSection) => void;
}) {
  return (
    <div className="skills-hero">
      <div>
        <p className="skills-kicker">Local-first agent learning</p>
        <h2>Growth Center</h2>
        <p>
          Notebook drafts become reviewed wiki memory, playbooks compile into
          skills, and execution logs feed the next version of the workspace.
        </p>
      </div>
      <div className="skills-tabs" role="tablist" aria-label="Skills sections">
        <button
          type="button"
          role="tab"
          aria-selected={section === "dashboard"}
          className={section === "dashboard" ? "is-active" : ""}
          onClick={() => onSectionChange("dashboard")}
        >
          스킬 대시보드
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "list"}
          className={section === "list" ? "is-active" : ""}
          onClick={() => onSectionChange("list")}
        >
          Skill list
        </button>
      </div>
    </div>
  );
}

function SkillsDashboard() {
  const skillsQuery = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });
  const playbooksQuery = useQuery({
    queryKey: ["playbooks"],
    queryFn: fetchPlaybooks,
    refetchInterval: 30_000,
  });
  const wikiQuery = useQuery({
    queryKey: ["wiki-catalog"],
    queryFn: fetchWikiCatalog,
    refetchInterval: 60_000,
  });
  const notebookQuery = useQuery({
    queryKey: ["notebook-catalog"],
    queryFn: fetchNotebookCatalog,
    refetchInterval: 60_000,
  });
  const reviewsQuery = useQuery({
    queryKey: ["reviews-growth-center"],
    queryFn: fetchReviews,
    refetchInterval: 30_000,
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
    refetchInterval: 15_000,
  });

  const skills = skillsQuery.data?.skills ?? [];
  const playbooks = playbooksQuery.data ?? [];
  const statusTargets = useMemo(
    () =>
      sortPlaybooksForStatusFetch(playbooks).slice(0, SYNTHESIS_STATUS_LIMIT),
    [playbooks],
  );
  const statusQueries = useQueries({
    queries: statusTargets.map((playbook) => ({
      queryKey: ["playbook-synthesis-status", playbook.slug],
      queryFn: () => fetchSynthesisStatus(playbook.slug),
      staleTime: 30_000,
    })),
  });

  const synthesisStatuses = useMemo(() => {
    const map = new Map<string, PlaybookSynthesisStatus | null>();
    statusTargets.forEach((playbook, index) => {
      map.set(playbook.slug, statusQueries[index]?.data ?? null);
    });
    return map;
  }, [statusTargets, statusQueries]);

  const model = buildGrowthModel({
    skills,
    playbooks,
    statuses: synthesisStatuses,
    wikiArticleCount: wikiQuery.data?.length ?? 0,
    notebook: notebookQuery.data,
    reviews: reviewsQuery.data ?? [],
  });

  return (
    <>
      <GrowthLoop />
      <MetricStrip metrics={model.metrics} />
      <div className="skills-dashboard-grid">
        <GrowthInbox items={model.inbox} />
        <TokenBudgetPanel usage={usageQuery.data} />
      </div>
      <PlaybookMaturity rows={model.playbooks} />
      {skillsQuery.error ? (
        <InlineError message="Could not load shared skills for dashboard counts." />
      ) : null}
      {notebookQuery.error ? (
        <InlineError message="Could not load notebook growth signals." />
      ) : null}
      {usageQuery.error ? (
        <InlineError message="Could not load token and context budget diagnostics." />
      ) : null}
    </>
  );
}

function GrowthLoop() {
  const steps = [
    "Notebook drafts",
    "Review queue",
    "Wiki playbooks",
    "Compiled skills",
    "Invocations",
    "Learned updates",
  ];
  return (
    <div className="skills-loop" role="list" aria-label="Workspace growth loop">
      {steps.map((step, index) => (
        <div className="skills-loop-step" key={step} role="listitem">
          <span className="skills-loop-index">{index + 1}</span>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string; detail?: string }>;
}) {
  return (
    <div className="skills-metric-strip">
      {metrics.map((metric) => (
        <div className="skills-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

function GrowthInbox({ items }: { items: GrowthInboxItem[] }) {
  return (
    <section className="skills-panel">
      <div className="skills-section-head">
        <h3>Growth inbox</h3>
        <p>Signals that need curation before the workspace can compound.</p>
      </div>
      {items.length === 0 ? (
        <div className="skills-empty-inline">No growth actions waiting.</div>
      ) : (
        <div className="skills-inbox-list">
          {items.map((item) => (
            <div
              className={`skills-inbox-item${
                item.tone === "warning" ? " is-warning" : ""
              }`}
              key={item.id}
            >
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TokenBudgetPanel({ usage }: { usage?: UsageData }) {
  const opt = usage?.optimization;
  const promptAvg =
    opt?.prompt_builds && opt.prompt_builds > 0 && opt.prompt_chars
      ? Math.round(opt.prompt_chars / opt.prompt_builds)
      : 0;
  const packetAvg =
    opt?.packet_builds && opt.packet_builds > 0 && opt.packet_chars
      ? Math.round(opt.packet_chars / opt.packet_builds)
      : 0;
  const promptSections = (opt?.last_prompt_sections ?? [])
    .slice()
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 4);
  const packetSections = (opt?.last_packet_sections ?? [])
    .slice()
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 4);

  return (
    <section className="skills-panel">
      <div className="skills-section-head">
        <h3>Token/context budget</h3>
        <p>Actual usage plus char-based diagnostics from the broker.</p>
      </div>
      <div className="skills-budget-grid">
        <BudgetDatum
          label="Session tokens"
          value={formatTokens(usage?.session?.total_tokens ?? 0)}
        />
        <BudgetDatum
          label="Total cost"
          value={formatUSD(usage?.total?.cost_usd ?? 0)}
        />
        <BudgetDatum label="Avg prompt chars" value={formatCount(promptAvg)} />
        <BudgetDatum
          label="Max prompt chars"
          value={formatCount(opt?.max_prompt_chars)}
        />
        <BudgetDatum label="Avg packet chars" value={formatCount(packetAvg)} />
        <BudgetDatum
          label="Max packet chars"
          value={formatCount(opt?.max_packet_chars)}
        />
        <BudgetDatum
          label="Memory in/out"
          value={`${formatCount(opt?.memory_items_included)} / ${formatCount(
            opt?.memory_items_omitted,
          )}`}
        />
        <BudgetDatum
          label="Broad reads"
          value={`${formatCount(opt?.broad_poll_reads)} poll / ${formatCount(
            opt?.broad_task_reads,
          )} task`}
        />
      </div>
      <ContextSections
        title="Largest prompt sections"
        sections={promptSections}
      />
      <ContextSections
        title="Largest packet sections"
        sections={packetSections}
      />
    </section>
  );
}

function BudgetDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="skills-budget-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ContextSections({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ id: string; chars: number; required?: boolean }>;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="skills-context-sections">
      <h4>{title}</h4>
      {sections.map((section) => (
        <div className="skills-context-section" key={section.id}>
          <span>
            {section.id}
            {section.required ? " *" : ""}
          </span>
          <strong>{formatCount(section.chars)}</strong>
        </div>
      ))}
    </div>
  );
}

function PlaybookMaturity({ rows }: { rows: PlaybookMaturityRow[] }) {
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const openWiki = useCallback(
    (path: string) => {
      setWikiPath(path);
      setCurrentApp("wiki");
    },
    [setCurrentApp, setWikiPath],
  );

  return (
    <section className="skills-panel is-wide">
      <div className="skills-section-head">
        <h3>Playbook maturity</h3>
        <p>
          Source playbooks, compiled skill status, executions, and synthesis
          lag.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="skills-empty-inline">
          No playbooks yet. Promote a reusable workflow into the wiki to start
          the loop.
        </div>
      ) : (
        <div className="skills-table-wrap">
          <table className="skills-table">
            <thead>
              <tr>
                <th>Playbook</th>
                <th>Compiled</th>
                <th>Executions</th>
                <th>Last synthesis</th>
                <th>Pending</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ playbook, status }) => (
                <tr key={playbook.slug}>
                  <td>
                    <strong>{playbook.title || playbook.slug}</strong>
                    <span>{playbook.slug}</span>
                  </td>
                  <td>
                    <StatusPill active={playbook.skill_exists}>
                      {playbook.skill_exists ? "compiled" : "pending"}
                    </StatusPill>
                  </td>
                  <td>{formatCount(playbook.execution_count)}</td>
                  <td>{formatDateTime(status?.last_synthesized_ts)}</td>
                  <td>
                    {status?.executions_since_last_synthesis
                      ? `${status.executions_since_last_synthesis} execution${
                          status.executions_since_last_synthesis === 1
                            ? ""
                            : "s"
                        }`
                      : "-"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="skills-link-button"
                      onClick={() => openWiki(playbook.source_path)}
                    >
                      Open wiki
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkillList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });
  const skills = useMemo(
    () => sortSkillsByUpdated(data?.skills ?? []),
    [data?.skills],
  );

  if (isLoading) {
    return <div className="app-loading-state">Loading skills...</div>;
  }

  if (error) {
    return <div className="app-empty-state">Could not load skills.</div>;
  }

  return (
    <section className="skills-panel is-wide">
      <div className="skills-section-head">
        <h3>Shared team skills</h3>
        <p>
          Broker skills available to agents in this workspace. Updated dates
          come from durable skill state.
        </p>
      </div>
      {skills.length === 0 ? (
        <div className="skills-empty-inline">No skills registered yet.</div>
      ) : (
        <div className="skills-table-wrap">
          <table className="skills-table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Description</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Usage</th>
                <th>Last run</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <SkillRow key={skill.id || skill.name} skill={skill} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const source = skill.source || skill.channel || skill.created_by || "-";
  const isProposed = (skill.status || "active") === "proposed";
  return (
    <tr>
      <td>
        <strong>{skill.title || skill.name || "Untitled"}</strong>
        {skill.name ? <span>{skill.name}</span> : null}
        {skill.tags && skill.tags.length > 0 ? (
          <div className="skills-tag-row">
            {skill.tags.slice(0, 3).map((tag) => (
              <span className="skills-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </td>
      <td>{skill.description || skill.trigger || "-"}</td>
      <td>
        <StatusPill active={(skill.status || "active") === "active"}>
          {skill.status || "active"}
        </StatusPill>
      </td>
      <td>{formatDateTime(skill.updated_at || skill.created_at)}</td>
      <td>{formatCount(skill.usage_count)}</td>
      <td>
        {formatDateTime(skill.last_execution_at)}
        {skill.last_execution_status ? (
          <span className="skills-run-status">
            {skill.last_execution_status}
          </span>
        ) : null}
      </td>
      <td>{source}</td>
      <td>
        {isProposed ? (
          <SkillApprovalActions skill={skill} />
        ) : (
          <InvokeSkillButton skill={skill} />
        )}
      </td>
    </tr>
  );
}

function SkillApprovalActions({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "approving" | "rejecting">(
    "idle",
  );

  const updateStatus = useCallback(
    (status: "active" | "rejected") => {
      if (!skill.name) return;
      setState(status === "active" ? "approving" : "rejecting");
      updateSkill({ name: skill.name, status })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["skills"] });
          showNotice(
            status === "active" ? "Skill approved." : "Skill rejected.",
            "success",
          );
        })
        .catch((e: Error) => {
          showNotice(`Skill update failed: ${e.message}`, "error");
        })
        .finally(() => setState("idle"));
    },
    [queryClient, skill.name],
  );

  return (
    <div className="skills-action-row">
      <button
        type="button"
        className="skills-invoke"
        disabled={state !== "idle" || !skill.name}
        onClick={() => updateStatus("active")}
      >
        Approve
      </button>
      <button
        type="button"
        className="skills-invoke is-danger"
        disabled={state !== "idle" || !skill.name}
        onClick={() => updateStatus("rejected")}
      >
        Reject
      </button>
    </div>
  );
}

function InvokeSkillButton({ skill }: { skill: Skill }) {
  const [invokeState, setInvokeState] = useState<"idle" | "invoking" | "done">(
    "idle",
  );

  const handleInvoke = useCallback(() => {
    if (!skill.name) return;
    setInvokeState("invoking");
    invokeSkill(skill.name, {})
      .then(() => {
        setInvokeState("done");
        setTimeout(() => setInvokeState("idle"), 1500);
      })
      .catch((e: Error) => {
        setInvokeState("idle");
        showNotice(`Invoke failed: ${e.message}`, "error");
      });
  }, [skill.name]);

  const buttonLabel =
    invokeState === "invoking"
      ? "Invoking..."
      : invokeState === "done"
        ? "Invoked"
        : "Invoke";

  return (
    <button
      type="button"
      className="skills-invoke"
      disabled={invokeState !== "idle" || !skill.name}
      onClick={handleInvoke}
    >
      <Flash aria-hidden={true} height={13} width={13} />
      {buttonLabel}
    </button>
  );
}

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: string;
}) {
  return (
    <span className={`skills-status${active ? " is-active" : ""}`}>
      {children}
    </span>
  );
}

function InlineError({ message }: { message: string }) {
  return <div className="skills-inline-error">{message}</div>;
}

function buildGrowthModel({
  skills,
  playbooks,
  statuses,
  wikiArticleCount,
  notebook,
  reviews,
}: {
  skills: Skill[];
  playbooks: PlaybookSummary[];
  statuses: Map<string, PlaybookSynthesisStatus | null>;
  wikiArticleCount: number;
  notebook?: NotebookCatalogSummary;
  reviews: ReviewItem[];
}): GrowthModel {
  const proposedSkills = skills.filter((skill) => skill.status === "proposed");
  const activeSkills = skills.filter(
    (skill) => !skill.status || skill.status === "active",
  );
  const compiledPlaybooks = playbooks.filter(
    (playbook) => playbook.skill_exists,
  );
  const pendingReviews = reviews.filter((review) =>
    PENDING_REVIEW_STATES.has(review.state),
  );
  const synthesisPending = playbooks.filter((playbook) => {
    const status = statuses.get(playbook.slug);
    return (status?.executions_since_last_synthesis ?? 0) > 0;
  });
  const learnedUpdates = Array.from(statuses.values()).filter(
    (status) => !!status?.last_synthesized_ts,
  ).length;
  const totalExecutions = playbooks.reduce(
    (sum, playbook) => sum + (playbook.execution_count || 0),
    0,
  );
  const inbox: GrowthInboxItem[] = [
    ...proposedSkills.slice(0, 4).map((skill) => ({
      id: `skill-${skill.id || skill.name}`,
      label: `Proposed skill: ${skill.title || skill.name}`,
      detail: skill.description || skill.trigger || "Needs activation review.",
      tone: "neutral" as const,
    })),
    ...pendingReviews.slice(0, 4).map((review) => ({
      id: `review-${review.id}`,
      label: `Review: ${review.entry_title || review.entry_slug}`,
      detail: review.proposed_wiki_path || "Notebook promotion needs review.",
      tone: "neutral" as const,
    })),
    ...playbooks
      .filter((playbook) => !playbook.skill_exists)
      .slice(0, 4)
      .map((playbook) => ({
        id: `uncompiled-${playbook.slug}`,
        label: `Compile pending: ${playbook.title || playbook.slug}`,
        detail: playbook.source_path,
        tone: "warning" as const,
      })),
    ...synthesisPending.slice(0, 4).map((playbook) => {
      const status = statuses.get(playbook.slug);
      const pending = status?.executions_since_last_synthesis ?? 0;
      return {
        id: `synthesis-${playbook.slug}`,
        label: `Learning pending: ${playbook.title || playbook.slug}`,
        detail: `${pending} execution${pending === 1 ? "" : "s"} since last synthesis.`,
        tone: "warning" as const,
      };
    }),
  ].slice(0, 8);

  return {
    metrics: [
      {
        label: "Shared skills",
        value: formatCount(skills.length),
        detail: `${formatCount(activeSkills.length)} active`,
      },
      {
        label: "Proposed skills",
        value: formatCount(proposedSkills.length),
        detail: "awaiting activation",
      },
      {
        label: "Playbooks",
        value: formatCount(playbooks.length),
        detail: `${formatCount(compiledPlaybooks.length)} compiled`,
      },
      {
        label: "Execution logs",
        value: formatCount(totalExecutions),
        detail: "recorded outcomes",
      },
      {
        label: "Pending promotion",
        value: formatCount(
          notebook?.pending_promotion ?? pendingReviews.length,
        ),
        detail: `${formatCount(notebook?.total_entries)} notebook entries`,
      },
      {
        label: "Learned updates",
        value: formatCount(learnedUpdates),
        detail: `${formatCount(wikiArticleCount)} wiki articles`,
      },
    ],
    inbox,
    playbooks: sortPlaybookMaturityRows(
      playbooks.map((playbook) => ({
        playbook,
        status: statuses.get(playbook.slug) ?? null,
      })),
    ),
  };
}

function sortPlaybooksForStatusFetch(
  playbooks: PlaybookSummary[],
): PlaybookSummary[] {
  return [...playbooks].sort((a, b) => {
    if (a.skill_exists !== b.skill_exists) return a.skill_exists ? 1 : -1;
    if (b.execution_count !== a.execution_count) {
      return b.execution_count - a.execution_count;
    }
    return (a.title || a.slug).localeCompare(b.title || b.slug);
  });
}

function sortPlaybookMaturityRows(
  rows: PlaybookMaturityRow[],
): PlaybookMaturityRow[] {
  return [...rows].sort((a, b) => {
    return (
      comparePlaybookSkillState(a.playbook, b.playbook) ||
      comparePendingExecutions(a, b) ||
      comparePlaybookExecutionCount(a.playbook, b.playbook) ||
      comparePlaybookTitle(a.playbook, b.playbook)
    );
  });
}

function comparePlaybookSkillState(
  a: PlaybookSummary,
  b: PlaybookSummary,
): number {
  if (a.skill_exists === b.skill_exists) return 0;
  return a.skill_exists ? 1 : -1;
}

function comparePendingExecutions(
  a: PlaybookMaturityRow,
  b: PlaybookMaturityRow,
): number {
  const aPending = a.status?.executions_since_last_synthesis ?? 0;
  const bPending = b.status?.executions_since_last_synthesis ?? 0;
  if (aPending > 0 !== bPending > 0) return aPending > 0 ? -1 : 1;
  return bPending - aPending;
}

function comparePlaybookExecutionCount(
  a: PlaybookSummary,
  b: PlaybookSummary,
): number {
  return b.execution_count - a.execution_count;
}

function comparePlaybookTitle(a: PlaybookSummary, b: PlaybookSummary): number {
  return (a.title || a.slug).localeCompare(b.title || b.slug);
}

function sortSkillsByUpdated(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const aTime = skillUpdatedTime(a);
    const bTime = skillUpdatedTime(b);
    if (aTime !== bTime) return bTime - aTime;
    return (a.title || a.name || "").localeCompare(b.title || b.name || "");
  });
}

function skillUpdatedTime(skill: Skill): number {
  const parsed = Date.parse(
    skill.updated_at || skill.created_at || skill.last_execution_at || "",
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function formatCount(value?: number): string {
  if (!value) return "0";
  return value.toLocaleString();
}

export const __test__ = {
  buildGrowthModel,
  sortPlaybookMaturityRows,
  sortSkillsByUpdated,
  formatDateTime,
};
