import { type FormEvent, useCallback, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flash } from "iconoir-react";

import {
  createSkill,
  deleteSkill,
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
import { useAppStore } from "../../stores/app";
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

type SkillPublishMode = "propose" | "create";

type SkillFormState = {
  name: string;
  title: string;
  description: string;
  content: string;
  trigger: string;
  tags: string;
  requiredPermissions: string;
  action: SkillPublishMode;
};

const EMPTY_SKILL_FORM: SkillFormState = {
  name: "",
  title: "",
  description: "",
  content: "",
  trigger: "",
  tags: "",
  requiredPermissions: "",
  action: "propose",
};

export function GrowthCenterApp() {
  return (
    <section className="skills-growth" aria-label="Growth Center">
      <GrowthCenterHeader />
      <SkillsDashboard />
    </section>
  );
}

export function SkillsApp() {
  return (
    <section className="skills-growth" aria-label="Skills">
      <SkillManager />
    </section>
  );
}

function GrowthCenterHeader() {
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

function SkillManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SkillFormState>(EMPTY_SKILL_FORM);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "saving">("idle");
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });
  const skills = useMemo(
    () => sortSkillsByUpdated(data?.skills ?? []),
    [data?.skills],
  );

  const updateForm = useCallback(
    (field: keyof SkillFormState, value: string) => {
      setForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const resetForm = useCallback(() => {
    setForm(EMPTY_SKILL_FORM);
    setEditingName(null);
  }, []);

  const startEdit = useCallback((skill: Skill) => {
    if (!skill.name) return;
    setEditingName(skill.name);
    setForm(skillToForm(skill));
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const validation = validateSkillForm(form);
      if (validation) {
        showNotice(validation, "error");
        return;
      }
      setSubmitState("saving");
      const payload = skillPayloadFromForm(form);
      const request = editingName
        ? updateSkill({
            ...payload,
            name: editingName,
            status: form.action === "propose" ? "proposed" : "active",
          })
        : createSkill({
            ...payload,
            action: form.action,
            created_by: "human",
          });

      request
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["skills"] });
          resetForm();
          showNotice(
            editingName
              ? "Skill updated."
              : form.action === "propose"
                ? "Skill submitted for approval."
                : "Skill registered.",
            "success",
          );
        })
        .catch((e: Error) => {
          showNotice(`Skill save failed: ${e.message}`, "error");
        })
        .finally(() => setSubmitState("idle"));
    },
    [editingName, form, queryClient, resetForm],
  );

  return (
    <>
      <SkillsManagementHeader />
      <SkillEditor
        form={form}
        isEditing={!!editingName}
        isSaving={submitState !== "idle"}
        onCancel={resetForm}
        onChange={updateForm}
        onSubmit={handleSubmit}
      />
      {isLoading ? (
        <div className="app-loading-state">Loading skills...</div>
      ) : error ? (
        <div className="app-empty-state">Could not load skills.</div>
      ) : (
        <SkillTable skills={skills} onEdit={startEdit} />
      )}
    </>
  );
}

function SkillsManagementHeader() {
  return (
    <div className="skills-hero">
      <div>
        <p className="skills-kicker">Team skill registry</p>
        <h2>Skills</h2>
        <p>
          Register reusable instructions, approve agent proposals, and keep
          the team skill list up to date without leaving this screen.
        </p>
      </div>
    </div>
  );
}

function SkillEditor({
  form,
  isEditing,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: SkillFormState;
  isEditing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (field: keyof SkillFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const primaryLabel = isEditing
    ? "Update skill"
    : form.action === "propose"
      ? "Submit for approval"
      : "Register skill";

  return (
    <section className="skills-panel is-wide skills-editor-panel">
      <div className="skills-section-head">
        <h3>{isEditing ? "Edit skill" : "Register a skill manually"}</h3>
        <p>
          A skill is a reusable instruction the team can call with / in chat.
          Keep the name short and write the steps clearly.
        </p>
      </div>
      <form className="skills-editor-form" onSubmit={onSubmit}>
        <div className="skills-editor-grid">
          <label className="skills-field">
            <span>Skill name</span>
            <input
              value={form.name}
              disabled={isEditing}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="daily-standup"
            />
          </label>
          <label className="skills-field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder="Daily standup"
            />
          </label>
          <label className="skills-field">
            <span>Short summary</span>
            <input
              value={form.description}
              onChange={(event) =>
                onChange("description", event.target.value)
              }
              placeholder="Collect blockers and next actions from the team"
            />
          </label>
          <label className="skills-field">
            <span>Trigger hint</span>
            <input
              value={form.trigger}
              onChange={(event) => onChange("trigger", event.target.value)}
              placeholder="/daily-standup"
            />
          </label>
          <label className="skills-field">
            <span>Tags</span>
            <input
              value={form.tags}
              onChange={(event) => onChange("tags", event.target.value)}
              placeholder="ops, review"
            />
          </label>
          <label className="skills-field">
            <span>Permissions</span>
            <input
              value={form.requiredPermissions}
              onChange={(event) =>
                onChange("requiredPermissions", event.target.value)
              }
              placeholder="optional, comma separated"
            />
          </label>
          <label className="skills-field">
            <span>Registration mode</span>
            <select
              value={form.action}
              onChange={(event) =>
                onChange("action", event.target.value as SkillPublishMode)
              }
            >
              <option value="propose">Needs approval</option>
              <option value="create">Use immediately</option>
            </select>
          </label>
        </div>
        <label className="skills-field skills-field-full">
          <span>Instructions</span>
          <textarea
            value={form.content}
            onChange={(event) => onChange("content", event.target.value)}
            placeholder="Write the steps the agent should follow when this skill is used."
            rows={8}
          />
        </label>
        <div className="skills-editor-actions">
          <button type="submit" className="skills-invoke" disabled={isSaving}>
            {isSaving ? "Saving..." : primaryLabel}
          </button>
          {isEditing ? (
            <button
              type="button"
              className="skills-link-button"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function SkillTable({
  skills,
  onEdit,
}: {
  skills: Skill[];
  onEdit: (skill: Skill) => void;
}) {
  return (
    <section className="skills-panel is-wide">
      <div className="skills-section-head">
        <h3>Shared team skills</h3>
        <p>
          Skills that agents can use in this workspace. Proposed skills stay
          inactive until someone approves them.
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <SkillRow
                  key={skill.id || skill.name}
                  skill={skill}
                  onEdit={onEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkillRow({
  skill,
  onEdit,
}: {
  skill: Skill;
  onEdit: (skill: Skill) => void;
}) {
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
        <div className="skills-action-stack">
          {isProposed ? (
            <SkillApprovalActions skill={skill} />
          ) : (
            <InvokeSkillButton skill={skill} />
          )}
          <div className="skills-action-row">
            <button
              type="button"
              className="skills-link-button"
              disabled={!skill.name}
              onClick={() => onEdit(skill)}
            >
              Edit
            </button>
            <SkillDeleteButton skill={skill} />
          </div>
        </div>
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

function SkillDeleteButton({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "deleting">("idle");

  const handleDelete = useCallback(() => {
    if (!skill.name) return;
    const confirmed = window.confirm(
      `Archive skill "${skill.title || skill.name}"? Agents will no longer see it in the skill list.`,
    );
    if (!confirmed) return;
    setState("deleting");
    deleteSkill(skill.name)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["skills"] });
        showNotice("Skill archived.", "success");
      })
      .catch((e: Error) => {
        showNotice(`Skill archive failed: ${e.message}`, "error");
      })
      .finally(() => setState("idle"));
  }, [queryClient, skill.name, skill.title]);

  return (
    <button
      type="button"
      className="skills-link-button is-danger"
      disabled={state !== "idle" || !skill.name}
      onClick={handleDelete}
    >
      {state === "deleting" ? "Deleting..." : "Delete"}
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

function skillToForm(skill: Skill): SkillFormState {
  return {
    name: skill.name || "",
    title: skill.title || "",
    description: skill.description || "",
    content: skill.content || "",
    trigger: skill.trigger || "",
    tags: (skill.tags ?? []).join(", "),
    requiredPermissions: (skill.required_permissions ?? []).join(", "),
    action: skill.status === "proposed" ? "propose" : "create",
  };
}

function skillPayloadFromForm(form: SkillFormState) {
  const name = form.name.trim();
  const title = form.title.trim() || name;
  return {
    name,
    title,
    description: form.description.trim(),
    content: form.content.trim(),
    trigger: form.trigger.trim(),
    tags: splitCommaList(form.tags),
    required_permissions: splitCommaList(form.requiredPermissions),
    channel: "general",
  };
}

function validateSkillForm(form: SkillFormState): string | null {
  if (!form.name.trim()) return "Skill name is required.";
  if (!form.content.trim()) return "Instructions are required.";
  return null;
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  skillPayloadFromForm,
  skillToForm,
  splitCommaList,
  sortPlaybookMaturityRows,
  sortSkillsByUpdated,
  formatDateTime,
};
