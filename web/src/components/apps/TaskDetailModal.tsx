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
import { useI18n } from "../../lib/i18n";
import { confirm } from "../ui/ConfirmDialog";

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const HUMAN_SLUG = "human";
const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const TASK_DETAIL_ACTION_REFETCH_MS = liveEventsSupported ? 20_000 : 5_000;
type TaskTranslator = ReturnType<typeof useI18n>["t"];

interface StatusActionOptions {
  action: TaskStatusAction;
  task: Task;
  queryClient: QueryClient;
  onClose: () => void;
  setStatusBusy: (action: TaskStatusAction | null) => void;
  setErrorMsg: (message: string | null) => void;
  delivery?: TaskDeliveryPayload;
}

async function runTaskStatusAction({
  action,
  task,
  queryClient,
  onClose,
  setStatusBusy,
  setErrorMsg,
  delivery,
}: StatusActionOptions) {
  setStatusBusy(action);
  setErrorMsg(null);
  try {
    await updateTaskStatus(
      task.id,
      action,
      task.channel || "general",
      HUMAN_SLUG,
      delivery,
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

interface TaskDeliveryPayload {
  delivery_url?: string;
  delivery_summary?: string;
}

function confirmTaskStatusAction(
  action: TaskStatusAction,
  task: Task,
  t: TaskTranslator,
  runAction: () => void,
) {
  if (action !== "cancel") {
    runAction();
    return;
  }

  confirm({
    title: t("tasks.statusAction.cancelConfirmTitle"),
    message: `${task.title || task.id} ${t("tasks.statusAction.cancelConfirmMessage")}`,
    confirmLabel: t("tasks.statusAction.cancel"),
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
  t: TaskTranslator,
): Array<[string, string | null | undefined]> {
  const rows: Array<[string, string | null | undefined]> = [
    [t("tasks.detail.createdBy"), prefixedMeta("@", task.created_by)],
    [t("tasks.detail.created"), relativeMeta(task.created_at)],
    [t("tasks.detail.updated"), relativeMeta(task.updated_at)],
    [t("tasks.detail.due"), relativeMeta(task.due_at)],
  ];
  if (!task.project_id) {
    rows.splice(2, 0, [t("tasks.detail.channel"), channelMeta(task.channel)]);
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

function taskRequiresDeliveryReceipt(task: Task): boolean {
  return Boolean(
    task.project_id?.trim() &&
      task.execution_mode?.trim() === "local_worktree" &&
      task.worktree_branch?.trim(),
  );
}

function terminalTaskStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return (
    s === "done" || s === "completed" || s === "canceled" || s === "cancelled"
  );
}

function deliveryPayloadFromDraft(
  deliveryURL: string,
  deliverySummary: string,
): TaskDeliveryPayload | undefined {
  const payload: TaskDeliveryPayload = {};
  const url = deliveryURL.trim();
  const summary = deliverySummary.trim();
  if (url) payload.delivery_url = url;
  if (summary) payload.delivery_summary = summary;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function pullRequestNumber(deliveryURL: string): string | null {
  const match = deliveryURL.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  return match?.[1] ?? null;
}

function deliveryStatusLabel(
  status: string | null | undefined,
  t: TaskTranslator,
): string | null {
  switch ((status ?? "").trim().toLowerCase()) {
    case "open":
      return t("tasks.deliveryOpen");
    case "merged":
      return t("tasks.deliveryMerged");
    case "closed":
      return t("tasks.deliveryClosed");
    case "verified":
      return t("tasks.deliveryVerified");
    default:
      return null;
  }
}

function deliveryReference(task: Task, t: TaskTranslator): string | null {
  const deliveryURL = task.delivery_url?.trim();
  if (!deliveryURL) return null;
  const prNumber = pullRequestNumber(deliveryURL);
  const reference = prNumber ? `PR #${prNumber}` : deliveryURL;
  const status = deliveryStatusLabel(task.delivery_status, t);
  return status ? `${reference} · ${status}` : reference;
}

function taskExecutionLabel(status: string, t: TaskTranslator): string {
  switch (status) {
    case "in_progress":
      return t("tasks.execution.working");
    case "review":
      return t("tasks.execution.review");
    case "done":
    case "completed":
      return t("tasks.execution.done");
    case "blocked":
      return t("tasks.execution.blocked");
    case "canceled":
    case "cancelled":
      return t("tasks.execution.canceled");
    default:
      return t("tasks.execution.queued");
  }
}

function taskStatusDisplay(status: string, t: TaskTranslator): string {
  switch (status) {
    case "in_progress":
      return t("tasks.status.inProgress");
    case "review":
      return t("tasks.status.review");
    case "pending":
      return t("tasks.status.pending");
    case "blocked":
      return t("tasks.status.blocked");
    case "done":
    case "completed":
      return t("tasks.status.done");
    case "canceled":
    case "cancelled":
      return t("tasks.status.canceled");
    default:
      return t("tasks.status.open");
  }
}

type ExecutionStepState = "done" | "current" | "pending" | "blocked";

interface TaskExecutionStep {
  id: string;
  label: string;
  detail?: string | null;
  state: ExecutionStepState;
}

function taskStatusHasStarted(status: string): boolean {
  return ["in_progress", "review", "blocked", "done", "completed"].includes(
    status,
  );
}

function taskStatusIsDone(status: string): boolean {
  return status === "done" || status === "completed";
}

function taskStatusIsReview(status: string): boolean {
  return status === "review";
}

function baseTaskExecutionSteps(
  task: Task,
  t: TaskTranslator,
): TaskExecutionStep[] {
  const hasOwner = Boolean(task.owner?.trim());
  return [
    {
      id: "created",
      label: t("tasks.detail.step.created"),
      detail: relativeMeta(task.created_at),
      state: "done",
    },
    {
      id: "owner",
      label: hasOwner
        ? t("tasks.detail.step.ownerReady")
        : t("tasks.detail.step.ownerNeeded"),
      detail: ownerMeta(task.owner),
      state: hasOwner ? "done" : "current",
    },
  ];
}

function branchExecutionStep(
  task: Task,
  hasStarted: boolean,
  t: TaskTranslator,
): TaskExecutionStep {
  const branch = task.worktree_branch?.trim();
  return {
    id: "branch",
    label: branch
      ? t("tasks.detail.step.branchReady")
      : t("tasks.detail.step.branchNeeded"),
    detail: optionalMeta(branch),
    state: branch ? "done" : hasStarted ? "current" : "pending",
  };
}

function deliveryExecutionStep(
  task: Task,
  hasStarted: boolean,
  isReview: boolean,
  t: TaskTranslator,
): TaskExecutionStep {
  const deliveryURL = task.delivery_url?.trim();
  return {
    id: "delivery",
    label: deliveryURL
      ? t("tasks.detail.step.deliveryReady")
      : t("tasks.detail.step.deliveryNeeded"),
    detail: deliveryURL ? deliveryReference(task, t) : null,
    state: deliveryURL
      ? "done"
      : isReview || hasStarted
        ? "current"
        : "pending",
  };
}

function projectMemoryExecutionStep(
  isDone: boolean,
  hasStarted: boolean,
  t: TaskTranslator,
): TaskExecutionStep {
  return {
    id: "memory",
    label: t("tasks.detail.step.projectMemory"),
    detail: t("tasks.detail.step.projectMemoryDetail"),
    state: isDone ? "done" : hasStarted ? "current" : "pending",
  };
}

function reviewExecutionStep(
  isDone: boolean,
  isReview: boolean,
  t: TaskTranslator,
): TaskExecutionStep {
  return {
    id: "review",
    label: isDone ? t("tasks.detail.step.done") : t("tasks.detail.step.review"),
    detail: isReview
      ? t("tasks.detail.step.reviewCurrent")
      : isDone
        ? t("tasks.detail.step.doneDetail")
        : null,
    state: isDone ? "done" : isReview ? "current" : "pending",
  };
}

function taskExecutionSteps(
  task: Task,
  status: string,
  t: TaskTranslator,
): TaskExecutionStep[] {
  const isCodingTask = task.execution_mode?.trim() === "local_worktree";
  const requiresReceipt = taskRequiresDeliveryReceipt(task);
  const hasStarted = taskStatusHasStarted(status);
  const isDone = taskStatusIsDone(status);
  const isReview = taskStatusIsReview(status);
  const steps = baseTaskExecutionSteps(task, t);

  if (isCodingTask) {
    steps.push(branchExecutionStep(task, hasStarted, t));
    if (requiresReceipt) {
      steps.push(deliveryExecutionStep(task, hasStarted, isReview, t));
    }
  } else if (task.project_id?.trim()) {
    steps.push(projectMemoryExecutionStep(isDone, hasStarted, t));
  }

  if (status === "blocked") {
    steps.push({
      id: "blocked",
      label: t("tasks.detail.step.blocked"),
      state: "blocked",
    });
  }

  steps.push(reviewExecutionStep(isDone, isReview, t));

  return steps;
}

function taskTypeLabel(task: Task, t: TaskTranslator): string | null {
  if (task.execution_mode?.trim() === "local_worktree") {
    return t("tasks.detail.codingTask");
  }
  if (task.project_id?.trim()) {
    return t("tasks.detail.planningTask");
  }
  return optionalMeta(task.task_type);
}

function taskActionKindLabel(
  kind: string | null | undefined,
  t: TaskTranslator,
): string {
  switch ((kind ?? "").trim()) {
    case "project_created":
      return t("tasks.detail.action.projectCreated");
    case "project_updated":
      return t("tasks.detail.action.projectUpdated");
    case "task_created":
      return t("tasks.detail.action.taskCreated");
    case "task_updated":
      return t("tasks.detail.action.taskUpdated");
    case "task_unblocked":
      return t("tasks.detail.action.taskUnblocked");
    case "task_reassigned":
      return t("tasks.detail.action.taskReassigned");
    case "task_canceled":
      return t("tasks.detail.action.taskCanceled");
    default:
      return t("tasks.detail.action.generic");
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
  const { t } = useI18n();
  const { data: memberData } = useQuery({
    queryKey: ["office-members"],
    queryFn: getOfficeMembers,
    staleTime: 30_000,
  });
  const { data: actionData, isLoading: isActionLoading } = useQuery({
    queryKey: ["task-actions", task.id],
    queryFn: getActions,
    refetchInterval: TASK_DETAIL_ACTION_REFETCH_MS,
  });

  const currentOwner = (task.owner ?? "").trim();
  const currentStatus = (task.status ?? "").trim().toLowerCase();
  const [selectedOwner, setSelectedOwner] = useState<string>(currentOwner);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusy, setStatusBusy] = useState<TaskStatusAction | null>(null);
  const [statusErrorMsg, setStatusErrorMsg] = useState<string | null>(null);
  const [ownerErrorMsg, setOwnerErrorMsg] = useState<string | null>(null);
  const [deliveryURL, setDeliveryURL] = useState(
    task.delivery_url?.trim() ?? "",
  );
  const [deliverySummary, setDeliverySummary] = useState(
    task.delivery_summary?.trim() ?? "",
  );

  useEffect(() => {
    setSelectedOwner((task.owner ?? "").trim());
    setStatusErrorMsg(null);
    setOwnerErrorMsg(null);
  }, [task.owner]);

  useEffect(() => {
    setDeliveryURL(task.delivery_url?.trim() ?? "");
    setDeliverySummary(task.delivery_summary?.trim() ?? "");
  }, [task.delivery_url, task.delivery_summary]);

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
    const delivery = deliveryPayloadFromDraft(deliveryURL, deliverySummary);
    const shouldSendDelivery = action === "complete" || action === "review";
    confirmTaskStatusAction(action, task, t, () => {
      void runTaskStatusAction({
        action,
        task,
        queryClient,
        onClose,
        setStatusBusy,
        setErrorMsg: setStatusErrorMsg,
        delivery: shouldSendDelivery ? delivery : undefined,
      });
    });
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const description = task.description?.trim() || "";
  const details = task.details?.trim() || "";

  const metaRows = buildTaskMetaRows(task, t);
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
      setErrorMsg: setOwnerErrorMsg,
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
        <TaskDetailHeader task={task} onClose={onClose} t={t} />
        <TaskStatusSection
          currentStatus={currentStatus}
          errorMsg={statusErrorMsg}
          statusBusy={statusBusy}
          t={t}
          onStatusAction={handleStatusAction}
        />
        <TaskExecutionSection
          actions={taskActions}
          isActionLoading={isActionLoading}
          status={currentStatus}
          task={task}
          t={t}
        />
        <TaskDeliverySection
          deliverySummary={deliverySummary}
          deliveryURL={deliveryURL}
          setDeliverySummary={setDeliverySummary}
          setDeliveryURL={setDeliveryURL}
          task={task}
          t={t}
        />

        <TaskOwnershipSection
          task={task}
          assignableMembers={assignableMembers}
          selectedOwner={selectedOwner}
          setSelectedOwner={setSelectedOwner}
          submitting={submitting}
          ownerChanged={ownerChanged}
          errorMsg={ownerErrorMsg}
          onReassign={handleReassign}
          t={t}
        />

        <TaskNarrativeSection
          description={description}
          details={details}
          t={t}
        />
        <TaskDependenciesSection dependsOn={dependsOn} t={t} />
        <TaskMetadataSection metaRows={metaRows} t={t} />
      </div>
    </div>
  );
}

interface TaskDeliverySectionProps {
  deliverySummary: string;
  deliveryURL: string;
  setDeliverySummary: (value: string) => void;
  setDeliveryURL: (value: string) => void;
  task: Task;
  t: ReturnType<typeof useI18n>["t"];
}

function TaskDeliverySection({
  deliverySummary,
  deliveryURL,
  setDeliverySummary,
  setDeliveryURL,
  task,
  t,
}: TaskDeliverySectionProps) {
  const savedDeliveryURL = task.delivery_url?.trim();
  const savedDeliverySummary = task.delivery_summary?.trim();
  const deliveredAt = relativeMeta(task.delivered_at);
  const deliveryCheckedAt = relativeMeta(task.delivery_checked_at);
  const deliveryStatus = deliveryStatusLabel(task.delivery_status, t);
  const requiresReceipt = taskRequiresDeliveryReceipt(task);
  const canEditReceipt = requiresReceipt && !terminalTaskStatus(task.status);
  const hasSavedDelivery = Boolean(
    savedDeliveryURL ||
      savedDeliverySummary ||
      deliveredAt ||
      deliveryStatus ||
      deliveryCheckedAt,
  );
  const prNumber = savedDeliveryURL
    ? pullRequestNumber(savedDeliveryURL)
    : null;
  const deliveryFacts: Array<[string, string | null]> = [
    [t("tasks.deliveryStatus"), deliveryStatus],
    [t("tasks.deliveryCheckedAt"), deliveryCheckedAt],
    [t("tasks.deliveredAt"), deliveredAt],
  ];
  const visibleDeliveryFacts = deliveryFacts.filter(
    (row): row is [string, string] => Boolean(row[1]),
  );
  if (!(hasSavedDelivery || canEditReceipt)) {
    return null;
  }

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">{t("tasks.delivery")}</div>
      <section
        className="task-detail-delivery"
        aria-label={t("tasks.deliveryReceipt")}
      >
        {savedDeliveryURL ? (
          <a
            className="task-detail-delivery-link"
            href={savedDeliveryURL}
            target="_blank"
            rel="noreferrer"
          >
            {prNumber
              ? `${t("tasks.openPullRequestPrefix")}${prNumber}${t("tasks.openPullRequestSuffix")}`
              : t("tasks.openDelivery")}
          </a>
        ) : null}
        {savedDeliverySummary ? (
          <p className="task-detail-delivery-summary">{savedDeliverySummary}</p>
        ) : null}
        {visibleDeliveryFacts.length > 0 ? (
          <dl className="task-detail-execution-facts">
            {visibleDeliveryFacts.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {canEditReceipt ? (
          <div className="task-detail-delivery-form">
            <label className="sr-only" htmlFor={`delivery-url-${task.id}`}>
              {t("tasks.deliveryURL")}
            </label>
            <input
              id={`delivery-url-${task.id}`}
              className="input task-detail-delivery-input"
              value={deliveryURL}
              onChange={(event) => setDeliveryURL(event.currentTarget.value)}
              placeholder={t("tasks.deliveryURLPlaceholder")}
            />
            <label className="sr-only" htmlFor={`delivery-summary-${task.id}`}>
              {t("tasks.deliverySummary")}
            </label>
            <input
              id={`delivery-summary-${task.id}`}
              className="input task-detail-delivery-input"
              value={deliverySummary}
              onChange={(event) =>
                setDeliverySummary(event.currentTarget.value)
              }
              placeholder={t("tasks.deliverySummaryPlaceholder")}
            />
            {!savedDeliveryURL ? (
              <span className="task-detail-delivery-hint">
                {t("tasks.deliveryRequiredHint")}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

interface TaskExecutionSectionProps {
  actions: ActionRecord[];
  isActionLoading: boolean;
  status: string;
  task: Task;
  t: TaskTranslator;
}

function TaskExecutionSection({
  actions,
  isActionLoading,
  status,
  task,
  t,
}: TaskExecutionSectionProps) {
  const facts = [
    [t("tasks.detail.assignedTo"), ownerMeta(task.owner)],
    [t("tasks.detail.taskType"), taskTypeLabel(task, t)],
    [t("tasks.detail.branch"), optionalMeta(task.worktree_branch)],
  ].filter(([, value]) => value);
  const steps = taskExecutionSteps(task, status, t);

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">{t("tasks.detail.workState")}</div>
      <div className="task-detail-execution">
        <div className="task-detail-execution-state">
          {taskExecutionLabel(status, t)}
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
        <TaskExecutionProgress steps={steps} />
        <TaskActionTimeline
          actions={actions}
          isLoading={isActionLoading}
          t={t}
        />
      </div>
    </section>
  );
}

function TaskExecutionProgress({ steps }: { steps: TaskExecutionStep[] }) {
  return (
    <ol className="task-detail-progress">
      {steps.map((step) => (
        <li
          className={`task-detail-progress-step task-detail-progress-step-${step.state}`}
          key={step.id}
        >
          <span className="task-detail-progress-dot" aria-hidden="true" />
          <span className="task-detail-progress-copy">
            <span className="task-detail-progress-label">{step.label}</span>
            {step.detail ? (
              <span className="task-detail-progress-detail">{step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

interface TaskActionTimelineProps {
  actions: ActionRecord[];
  isLoading: boolean;
  t: TaskTranslator;
}

function TaskActionTimeline({
  actions,
  isLoading,
  t,
}: TaskActionTimelineProps) {
  return (
    <section
      className="task-detail-timeline"
      aria-label={t("tasks.detail.timeline")}
    >
      {isLoading ? (
        <div className="task-detail-timeline-empty">
          {t("tasks.detail.timelineLoading")}
        </div>
      ) : null}
      {!isLoading && actions.length === 0 ? (
        <div className="task-detail-timeline-empty">
          {t("tasks.detail.timelineEmpty")}
        </div>
      ) : null}
      {!isLoading && actions.length > 0
        ? actions.map((action) => (
            <article
              className="task-detail-timeline-item"
              key={action.id || `${action.kind}-${action.created_at}`}
            >
              <div className="task-detail-timeline-topline">
                <span className="task-detail-timeline-kind">
                  {taskActionKindLabel(action.kind, t)}
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
  t: TaskTranslator;
}

function TaskDetailHeader({ task, onClose, t }: TaskDetailHeaderProps) {
  return (
    <header className="task-detail-header">
      <div>
        <div className="task-detail-id">#{task.id}</div>
        <h2 className="task-detail-title">
          {task.title || t("tasks.detail.untitled")}
        </h2>
      </div>
      <button
        type="button"
        className="task-detail-close"
        onClick={onClose}
        aria-label={t("tasks.detail.close")}
      >
        ×
      </button>
    </header>
  );
}

interface TaskStatusSectionProps {
  currentStatus: string;
  errorMsg: string | null;
  statusBusy: TaskStatusAction | null;
  t: ReturnType<typeof useI18n>["t"];
  onStatusAction: (action: TaskStatusAction) => void;
}

function TaskStatusSection({
  currentStatus,
  errorMsg,
  statusBusy,
  t,
  onStatusAction,
}: TaskStatusSectionProps) {
  return (
    <section className="task-detail-section" aria-label={t("tasks.status")}>
      <div className="task-detail-label">{t("tasks.status")}</div>
      <div className="task-detail-status">
        <span
          className={`task-detail-status-badge status-${currentStatus || "open"}`}
        >
          {taskStatusDisplay(currentStatus || "open", t)}
        </span>
        <div className="task-detail-status-actions">
          <StatusButton
            action="release"
            label={t("tasks.statusAction.release")}
            busy={statusBusy}
            disabledFor={["open"]}
            currentStatus={currentStatus}
            disabledTitle={t("tasks.statusAction.already")}
            onClick={onStatusAction}
          />
          <StatusButton
            action="review"
            label={t("tasks.statusAction.review")}
            busy={statusBusy}
            disabledFor={["review"]}
            currentStatus={currentStatus}
            disabledTitle={t("tasks.statusAction.already")}
            onClick={onStatusAction}
          />
          <StatusButton
            action="block"
            label={t("tasks.statusAction.block")}
            busy={statusBusy}
            disabledFor={["blocked"]}
            currentStatus={currentStatus}
            disabledTitle={t("tasks.statusAction.already")}
            onClick={onStatusAction}
          />
          <StatusButton
            action="complete"
            label={t("tasks.statusAction.complete")}
            busy={statusBusy}
            disabledFor={["done", "completed"]}
            currentStatus={currentStatus}
            disabledTitle={t("tasks.statusAction.already")}
            onClick={onStatusAction}
          />
          <StatusButton
            action="cancel"
            label={t("tasks.statusAction.cancel")}
            busy={statusBusy}
            disabledFor={["canceled", "cancelled"]}
            currentStatus={currentStatus}
            disabledTitle={t("tasks.statusAction.already")}
            onClick={onStatusAction}
            danger={true}
          />
        </div>
      </div>
      {errorMsg ? <div className="task-detail-error">{errorMsg}</div> : null}
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
  t: TaskTranslator;
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
  t,
}: TaskOwnershipSectionProps) {
  return (
    <section className="task-detail-section">
      <div className="task-detail-label">{t("tasks.detail.owner")}</div>
      <div className="task-detail-ownership">
        <div className="task-detail-owner-current">
          <span className="task-detail-owner-badge">
            {task.owner ? `@${task.owner}` : t("common.notSet")}
          </span>
          <span className="task-detail-hint">
            {task.project_id
              ? t("tasks.detail.ownerHintProject")
              : t("tasks.detail.ownerHintGeneral")}
          </span>
        </div>
        <div className="task-detail-owner-controls">
          <select
            className="task-detail-select"
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            disabled={submitting}
          >
            <option value="">{t("tasks.detail.pickOwner")}</option>
            {assignableMembers.map((member) => (
              <option key={member.slug} value={member.slug}>
                {member.name
                  ? `${member.name} / @${member.slug}`
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
            {submitting
              ? t("tasks.detail.reassigning")
              : t("tasks.detail.reassign")}
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
  t: TaskTranslator;
}

function TaskNarrativeSection({
  description,
  details,
  t,
}: TaskNarrativeSectionProps) {
  if (!(description || details)) return null;

  return (
    <section className="task-detail-section">
      {description ? (
        <>
          <div className="task-detail-label">
            {t("tasks.detail.description")}
          </div>
          <div className="task-detail-body">{description}</div>
        </>
      ) : null}
      {details ? (
        <>
          <div
            className="task-detail-label"
            style={{ marginTop: description ? 12 : 0 }}
          >
            {t("tasks.detail.details")}
          </div>
          <div className="task-detail-body">{details}</div>
        </>
      ) : null}
    </section>
  );
}

interface TaskDependenciesSectionProps {
  dependsOn: string[];
  t: TaskTranslator;
}

function TaskDependenciesSection({
  dependsOn,
  t,
}: TaskDependenciesSectionProps) {
  if (dependsOn.length === 0) return null;

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">{t("tasks.detail.dependsOn")}</div>
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
  t: TaskTranslator;
}

function TaskMetadataSection({ metaRows, t }: TaskMetadataSectionProps) {
  const visibleRows = metaRows.filter(
    ([, value]) => value !== null && value !== "",
  );
  if (visibleRows.length === 0) return null;

  return (
    <section className="task-detail-section">
      <div className="task-detail-label">{t("tasks.detail.metadata")}</div>
      <dl className="task-detail-meta">
        {visibleRows.map(([key, value]) => (
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
  disabledTitle: string;
  onClick: (action: TaskStatusAction) => void;
  danger?: boolean;
}

function StatusButton({
  action,
  label,
  busy,
  disabledFor,
  currentStatus,
  disabledTitle,
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
      title={isCurrent ? disabledTitle : undefined}
    >
      {isBusy ? "..." : <span>{label}</span>}
    </button>
  );
}
