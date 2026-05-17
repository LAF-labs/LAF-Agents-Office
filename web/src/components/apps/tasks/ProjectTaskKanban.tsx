import { Plus } from "iconoir-react";

import type { Task } from "../../../api/client";
import type { OfficeMember } from "../../../hooks/useMembers";
import type { I18nKey } from "../../../lib/i18n";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  normalizeStatus,
  STATUS_LABEL_KEYS,
  type StatusGroup,
  taskCreatorLabel,
  taskOwnerLabel,
  userEnteredTaskDetails,
} from "./taskDisplay";

type TranslationFn = (key: I18nKey) => string;
type ProjectKanbanColumnID =
  | "todo"
  | "in_progress"
  | "review"
  | "blocked"
  | "done";

const PROJECT_KANBAN_COLUMNS: Array<{
  id: ProjectKanbanColumnID;
  labelKey: I18nKey;
  statuses: StatusGroup[];
}> = [
  { id: "todo", labelKey: "tasks.kanban.todo", statuses: ["open", "pending"] },
  {
    id: "in_progress",
    labelKey: "tasks.kanban.inProgress",
    statuses: ["in_progress"],
  },
  { id: "review", labelKey: "tasks.kanban.review", statuses: ["review"] },
  { id: "blocked", labelKey: "tasks.kanban.blocked", statuses: ["blocked"] },
  { id: "done", labelKey: "tasks.kanban.done", statuses: ["done", "canceled"] },
];

function projectKanbanColumnID(task: Task): ProjectKanbanColumnID {
  const status = normalizeStatus(task.status);
  return (
    PROJECT_KANBAN_COLUMNS.find((column) => column.statuses.includes(status))
      ?.id ?? "todo"
  );
}

export function ProjectTaskKanban({
  members,
  selectedTaskId,
  tasks,
  t,
  onCreateTask,
  onSelectTask,
}: {
  members: OfficeMember[];
  selectedTaskId: string | null;
  tasks: Task[];
  t: TranslationFn;
  onCreateTask: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <section
        className="project-kanban-section project-kanban-empty-board"
        aria-label={t("tasks.tasks")}
      >
        <div className="project-empty-icon" aria-hidden="true">
          <Plus width={18} height={18} />
        </div>
        <p className="text-sm font-medium text-foreground">
          {t("tasks.noTasks")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("tasks.noTasksDesc")}
        </p>
        <Button
          className="project-empty-action"
          type="button"
          variant="outline"
          onClick={onCreateTask}
        >
          <Plus width={16} height={16} />
          {t("tasks.newTask")}
        </Button>
      </section>
    );
  }

  const tasksByColumn = PROJECT_KANBAN_COLUMNS.map((column) => ({
    ...column,
    tasks: tasks.filter((task) => projectKanbanColumnID(task) === column.id),
  }));

  return (
    <section className="project-kanban-section" aria-label={t("tasks.tasks")}>
      <div className="project-kanban-board">
        {tasksByColumn.map((column) => (
          <section
            className={cn("project-kanban-column", `is-${column.id}`)}
            key={column.id}
            aria-label={t(column.labelKey)}
          >
            <header className="project-kanban-column-header">
              <h4>{t(column.labelKey)}</h4>
              <span className="project-kanban-count">
                {column.tasks.length}
              </span>
            </header>
            <div className="project-kanban-stack">
              {column.tasks.length > 0 ? (
                column.tasks.map((task) => (
                  <TaskKanbanCard
                    isSelected={selectedTaskId === task.id}
                    key={task.id}
                    members={members}
                    task={task}
                    t={t}
                    onSelect={() => onSelectTask(task.id)}
                  />
                ))
              ) : (
                <p className="project-kanban-empty">
                  {t("tasks.kanban.empty")}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function TaskKanbanCard({
  isSelected,
  members,
  task,
  t,
  onSelect,
}: {
  isSelected: boolean;
  members: OfficeMember[];
  task: Task;
  t: TranslationFn;
  onSelect: () => void;
}) {
  const status = normalizeStatus(task.status);
  const detail = userEnteredTaskDetails(task);
  return (
    <button
      type="button"
      className={cn("project-kanban-task", isSelected && "is-selected")}
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
    >
      <span className="project-kanban-task-topline">
        <span className="project-kanban-task-id">{task.id}</span>
        <span className={cn("task-inline-status", `is-${status}`)}>
          {t(STATUS_LABEL_KEYS[status])}
        </span>
      </span>
      <strong className="project-kanban-task-title">
        {task.title || t("tasks.untitled")}
      </strong>
      {detail ? (
        <span className="project-kanban-task-detail">{detail}</span>
      ) : null}
      <span className="project-kanban-task-meta">
        <span>
          <small>{t("tasks.detail.assignedTo")}</small>
          <strong>{taskOwnerLabel(task, members, t)}</strong>
        </span>
        <span>
          <small>{t("tasks.detail.createdBy")}</small>
          <strong>{taskCreatorLabel(task, members, t)}</strong>
        </span>
      </span>
    </button>
  );
}
