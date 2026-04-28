import { useEffect, useMemo, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type ActionRecord,
  getActions,
  getOfficeMembers,
  type OfficeMember,
  reassignTask,
  type Task,
  type TaskStatusAction,
  updateTaskStatus,
} from "../../api/client";
import { formatRelativeTime } from "../../lib/format";
import { confirm } from "../ui/ConfirmDialog";

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const HUMAN_SLUG = "human";

interface StatusActionOptions {
  action: TaskStatusAction;
  task: Task;
  queryClient: QueryClient;
  onClose: () => void;
  setStatusBusy: (action: TaskStatusAction | null) => void;
  setErrorMsg: (message: string | null) => void;
}

async function runTaskStatusAction({
  action,
  task,
  queryClient,
  onClose,
  setStatusBusy,
  setErrorMsg,
}: StatusActionOptions) {
  setStatusBusy(action);
  setErrorMsg(null);
  try {
    await updateTaskStatus(
      task.id,
      action,
      task.channel || "general",
      HUMAN_SLUG,
    );
    await queryClient.invalidateQueries({ queryKey: ["office-tasks"] });
    if (action === "cancel" || action === "complete") {
      onClose();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : `${action} failed`;
    setErrorMsg(message);
  } finally {
    setStatusBusy(null);
  }
}

function confirmTaskStatusAction(
  action: TaskStatusAction,
  task: Task,
  runAction: () => void,
) {
  if (action !== "cancel") {
    runAction();
    return;
  }

  confirm({
    title: "Mark task as won't do?",
    message: `"${task.title || task.id}" will move to the Won't Do column. Owners are notified.`,
    confirmLabel: "Won't do",
    danger: true,
    onConfirm: runAction,
  });
}

interface ReassignOptions {
  selectedOwner: string;
  currentOwner: string;
  task: Task;
  queryClient: QueryClient;
  onClose: () => void;
  setSubmitting: (submitting: boolean) => void;
  setErrorMsg: (message: string | null) => void;
}

async function reassignSelectedOwner({
  selectedOwner,
  currentOwner,
  task,
  queryClient,
  onClose,
  setSubmitting,
  setErrorMsg,
}: ReassignOptions) {
  const next = selectedOwner.trim();
  if (!next || next === currentOwner) return;
  setSubmitting(true);
  setErrorMsg(null);
  try {
    await reassignTask(task.id, next, task.channel || "general", HUMAN_SLUG);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["office-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
    onClose();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reassign failed";
    setErrorMsg(message);
  } finally {
    setSubmitting(false);
  }
}

function buildTaskMetaRows(
  task: Task,
  status: string,
  reviewState: string,
): Array<[string, string | null | undefined]> {
  const rows: Array<[string, string | null | undefined]> = [
    ["Owner", ownerMeta(task.owner)],
    ["Project", optionalMeta(task.project_id)],
    ["Status", status || "—"],
    ["Review state", optionalMeta(reviewState)],
    ["Task type", optionalMeta(task.task_type)],
    ["Execution mode", optionalMeta(task.execution_mode)],
    ["Pipeline", optionalMeta(task.pipeline_id)],
    ["Pipeline stage", optionalMeta(task.pipeline_stage)],
    ["Worktree branch", optionalMeta(task.worktree_branch)],
    ["Worktree path", optionalMeta(task.worktree_path)],
    ["Source signal", optionalMeta(task.source_signal_id)],
    ["Source decision", optionalMeta(task.source_decision_id)],
    ["Thread", optionalMeta(task.thread_id)],
    ["Created by", prefixedMeta("@", task.created_by)],
    ["Created", relativeMeta(task.created_at)],
    ["Updated", relativeMeta(task.updated_at)],
    ["Due", relativeMeta(task.due_at)],
    ["Follow up", relativeMeta(task.follow_up_at)],
    ["Reminder", relativeMeta(task.reminder_at)],
    ["Recheck", relativeMeta(task.recheck_at)],
  ];
  if (!task.project_id) {
    rows.splice(2, 0, ["Channel", channelMeta(task.channel)]);
  }
  return rows;
}

function optionalMeta(value: string | null | undefined): string | null {
  return value || null;
}

function prefixedMeta(
  prefix: string,
  value: string | null | undefined,
): string | null {
  return value ? `${prefix}${value}` : null;
}

function ownerMeta(owner: string | null | undefined): string {
  return prefixedMeta("@", owner) ?? "(unassigned)";
}

function channelMeta(channel: string | null | undefined): string {
  return prefixedMeta("#", channel) ?? "—";
}

function relativeMeta(value: string | null | undefined): string | null {
  return value ? formatRelativeTime(value) : null;
}

function taskExecutionLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "Agent is working";
    case "review":
      return "Ready for review";
    case "done":
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
    case "canceled":
    case "cancelled":
      return "Canceled";
    default:
      return "Queued";
  }
}

function actionTimestamp(action: ActionRecord): number {
  const raw = action.created_at ?? "";
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function relatedTaskActions(actions: ActionRecord[], taskID: string) {
  return actions
    .filter((action) => action.related_id === taskID)
    .sort((a, b) => actionTimestamp(b) - actionTimestamp(a))
    .slice(0, 5);
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const queryClient = useQueryClient();
  const { data: memberData } = useQuery({
    queryKey: ["office-members"],
    queryFn: getOfficeMembers,
    staleTime: 30_000,
  });
  const { data: actionData, isLoading: isActionLoading } = useQuery({
    queryKey: ["task-actions", task.id],
    queryFn: getActions,
    refetchInterval: 5_000,
  });

  const currentOwner = (task.owner ?? "").trim();
  const currentStatus = (task.status ?? "").trim().toLowerCase();
  const [selectedOwner, setSelectedOwner] = useState<string>(currentOwner);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusy, setStatusBusy] = useState<TaskStatusAction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSelectedOwner((task.owner ?? "").trim());
    setErrorMsg(null);
  }, [task.owner]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const assignableMembers = useMemo<OfficeMember[]>(() => {
    const members = memberData?.members ?? [];
    return members.filter((m) => {
      const slug = m.slug?.trim().toLowerCase();
      return slug && slug !== "human" && slug !== "you";
    });
  }, [memberData]);

  function handleStatusAction(action: TaskStatusAction) {
    confirmTaskStatusAction(action, task, () => {
      void runTaskStatusAction({
        action,
        task,
        queryClient,
        onClose,
        setStatusBusy,
        setErrorMsg,
      });
    });
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const status = (task.status || "").replace(/_/g, " ");
  const reviewState = (task.review_state || "").replace(/_/g, " ");
  const description = task.description?.trim() || "";
  const details = task.details?.trim() || "";

  const metaRows = buildTaskMetaRows(task, status, reviewState);
  const dependsOn = task.depends_on ?? [];
  const taskActions = useMemo(
    () => relatedTaskActions(actionData?.actions ?? [], task.id),
    [actionData?.actions, task.id],
  );

  const ownerChanged =
    selectedOwner.trim() !== currentOwner && selectedOwner.trim() !== "";

  const handleReassign = () => {
    void reassignSelectedOwner({
      selectedOwner,
      currentOwner,
      task,
      queryClient,
      onClose,
      setSubmitting,
      setErrorMsg,
    });
  };

  return (
    <div
      className="task-detail-overlay"
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Task ${task.id}`}
      tabIndex={-1}
    >
      <div className="task-detail-modal card">
        <TaskDetailHeader task={task} onClose={onClose} />
        <TaskStatusSection
          currentStatus={currentStatus}
          statusBusy={statusBusy}
          onStatusAction={handleStatusAction}
        />
        <TaskExecutionSection
          actions={taskActions}
          isActionLoading={isActionLoading}
          status={currentStatus}
          task={task}
        />

        <TaskOwnershipSection
          task={task}
          assignableMembers={assignableMembers}
          selectedOwner={selectedOwner}
          setSelectedOwner={setSelectedOwner}
          submitting={submitting}
          ownerChanged={ownerChanged}
          errorMsg={errorMsg}
          onReassign={handleReassign}
        />

        <TaskNarrativeSection description={description} details={details} />
        <TaskDependenciesSection dependsOn={dependsOn} />
        <TaskMetadataSection metaRows={metaRows} />
      </div>
    </div>
  );
}

interface TaskExecutionSectionProps {
  actions: ActionRecord[];
  isActionLoading: boolean;
  status: string;
  task: Task;
}

function TaskExecutionSection({
  actions,
  isActionLoading,
  status,
  task,
}: TaskExecutionSectionProps) {
  const facts = [
    ["Owner", ownerMeta(task.owner)],
    ["Mode", optionalMeta(task.execution_mode)],
    ["Branch", optionalMeta(task.worktree_branch)],
    ["Working directory", optionalMeta(task.worktree_path)],
  ].filter(([, value]) => value);

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">Execution</div>
      <div className="task-detail-execution">
        <div className="task-detail-execution-state">
          {taskExecutionLabel(status)}
        </div>
        {facts.length > 0 ? (
          <dl className="task-detail-execution-facts">
            {facts.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <TaskActionTimeline actions={actions} isLoading={isActionLoading} />
      </div>
    </section>
  );
}

interface TaskActionTimelineProps {
  actions: ActionRecord[];
  isLoading: boolean;
}

function TaskActionTimeline({ actions, isLoading }: TaskActionTimelineProps) {
  return (
    <section
      className="task-detail-timeline"
      aria-label="Task execution timeline"
    >
      {isLoading ? (
        <div className="task-detail-timeline-empty">Loading activity...</div>
      ) : null}
      {!isLoading && actions.length === 0 ? (
        <div className="task-detail-timeline-empty">No activity yet.</div>
      ) : null}
      {!isLoading && actions.length > 0
        ? actions.map((action) => (
            <article
              className="task-detail-timeline-item"
              key={action.id || `${action.kind}-${action.created_at}`}
            >
              <div className="task-detail-timeline-topline">
                <span className="task-detail-timeline-kind">
                  {action.kind || "action"}
                </span>
                {action.actor ? <span>@{action.actor}</span> : null}
                {action.created_at ? (
                  <span>{formatRelativeTime(action.created_at)}</span>
                ) : null}
              </div>
              {action.summary ? (
                <div className="task-detail-timeline-summary">
                  {action.summary}
                </div>
              ) : null}
            </article>
          ))
        : null}
    </section>
  );
}

interface TaskDetailHeaderProps {
  task: Task;
  onClose: () => void;
}

function TaskDetailHeader({ task, onClose }: TaskDetailHeaderProps) {
  return (
    <header className="task-detail-header">
      <div>
        <div className="task-detail-id">#{task.id}</div>
        <h2 className="task-detail-title">{task.title || "Untitled task"}</h2>
      </div>
      <button
        type="button"
        className="task-detail-close"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
    </header>
  );
}

interface TaskStatusSectionProps {
  currentStatus: string;
  statusBusy: TaskStatusAction | null;
  onStatusAction: (action: TaskStatusAction) => void;
}

function TaskStatusSection({
  currentStatus,
  statusBusy,
  onStatusAction,
}: TaskStatusSectionProps) {
  return (
    <section className="task-detail-section">
      <div className="task-detail-label">Status</div>
      <div className="task-detail-status">
        <span
          className={`task-detail-status-badge status-${currentStatus || "open"}`}
        >
          {currentStatus ? currentStatus.replace(/_/g, " ") : "open"}
        </span>
        <div className="task-detail-status-actions">
          <StatusButton
            action="release"
            label="Release"
            busy={statusBusy}
            disabledFor={["open"]}
            currentStatus={currentStatus}
            onClick={onStatusAction}
          />
          <StatusButton
            action="review"
            label="Mark review"
            busy={statusBusy}
            disabledFor={["review"]}
            currentStatus={currentStatus}
            onClick={onStatusAction}
          />
          <StatusButton
            action="block"
            label="Block"
            busy={statusBusy}
            disabledFor={["blocked"]}
            currentStatus={currentStatus}
            onClick={onStatusAction}
          />
          <StatusButton
            action="complete"
            label="Mark done"
            busy={statusBusy}
            disabledFor={["done"]}
            currentStatus={currentStatus}
            onClick={onStatusAction}
          />
          <StatusButton
            action="cancel"
            label="Won't do"
            busy={statusBusy}
            disabledFor={["canceled", "cancelled"]}
            currentStatus={currentStatus}
            onClick={onStatusAction}
            danger={true}
          />
        </div>
      </div>
    </section>
  );
}

interface TaskOwnershipSectionProps {
  task: Task;
  assignableMembers: OfficeMember[];
  selectedOwner: string;
  setSelectedOwner: (owner: string) => void;
  submitting: boolean;
  ownerChanged: boolean;
  errorMsg: string | null;
  onReassign: () => void;
}

function TaskOwnershipSection({
  task,
  assignableMembers,
  selectedOwner,
  setSelectedOwner,
  submitting,
  ownerChanged,
  errorMsg,
  onReassign,
}: TaskOwnershipSectionProps) {
  return (
    <section className="task-detail-section">
      <div className="task-detail-label">Ownership</div>
      <div className="task-detail-ownership">
        <div className="task-detail-owner-current">
          <span className="task-detail-owner-badge">
            {task.owner ? `@${task.owner}` : "(unassigned)"}
          </span>
          <span className="task-detail-hint">
            {task.project_id
              ? "Reassigning updates the project task owner. CEO is cc'd."
              : `Reassigning posts to #${task.channel || "general"} and DMs both owners. CEO is cc'd.`}
          </span>
        </div>
        <div className="task-detail-owner-controls">
          <select
            className="task-detail-select"
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            disabled={submitting}
          >
            <option value="">(pick an owner)</option>
            {assignableMembers.map((member) => (
              <option key={member.slug} value={member.slug}>
                {member.name
                  ? `${member.name} — @${member.slug}`
                  : `@${member.slug}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onReassign}
            disabled={!ownerChanged || submitting}
          >
            {submitting ? "Reassigning..." : "Reassign"}
          </button>
        </div>
        {errorMsg ? <div className="task-detail-error">{errorMsg}</div> : null}
      </div>
    </section>
  );
}

interface TaskNarrativeSectionProps {
  description: string;
  details: string;
}

function TaskNarrativeSection({
  description,
  details,
}: TaskNarrativeSectionProps) {
  if (!(description || details)) return null;

  return (
    <section className="task-detail-section">
      {description ? (
        <>
          <div className="task-detail-label">Description</div>
          <div className="task-detail-body">{description}</div>
        </>
      ) : null}
      {details ? (
        <>
          <div
            className="task-detail-label"
            style={{ marginTop: description ? 12 : 0 }}
          >
            Details
          </div>
          <div className="task-detail-body">{details}</div>
        </>
      ) : null}
    </section>
  );
}

interface TaskDependenciesSectionProps {
  dependsOn: string[];
}

function TaskDependenciesSection({ dependsOn }: TaskDependenciesSectionProps) {
  if (dependsOn.length === 0) return null;

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">Depends on</div>
      <ul className="task-detail-deps">
        {dependsOn.map((dep) => (
          <li key={dep}>#{dep}</li>
        ))}
      </ul>
    </section>
  );
}

interface TaskMetadataSectionProps {
  metaRows: Array<[string, string | null | undefined]>;
}

function TaskMetadataSection({ metaRows }: TaskMetadataSectionProps) {
  return (
    <section className="task-detail-section">
      <div className="task-detail-label">Metadata</div>
      <dl className="task-detail-meta">
        {metaRows
          .filter(([, value]) => value !== null && value !== "")
          .map(([key, value]) => (
            <div key={key} className="task-detail-meta-row">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

interface StatusButtonProps {
  action: TaskStatusAction;
  label: string;
  busy: TaskStatusAction | null;
  disabledFor: string[];
  currentStatus: string;
  onClick: (action: TaskStatusAction) => void;
  danger?: boolean;
}

function StatusButton({
  action,
  label,
  busy,
  disabledFor,
  currentStatus,
  onClick,
  danger,
}: StatusButtonProps) {
  const isCurrent = disabledFor.includes(currentStatus);
  const isBusy = busy === action;
  const anyBusy = busy !== null;
  const className =
    "btn btn-sm " +
    (danger ? "btn-ghost task-detail-status-btn-danger" : "btn-ghost");
  return (
    <button
      type="button"
      className={className}
      onClick={() => onClick(action)}
      disabled={isCurrent || anyBusy}
      title={isCurrent ? "Task is already in this state" : undefined}
    >
      {isBusy ? "..." : <span>{label}</span>}
    </button>
  );
}
