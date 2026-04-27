import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "../../api/client";
import { TaskDetailModal } from "./TaskDetailModal";

const apiMocks = vi.hoisted(() => ({
  getActions: vi.fn(),
  getOfficeMembers: vi.fn(),
  reassignTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    getActions: apiMocks.getActions,
    getOfficeMembers: apiMocks.getOfficeMembers,
    reassignTask: apiMocks.reassignTask,
    updateTaskStatus: apiMocks.updateTaskStatus,
  };
});

function renderTaskDetail(task: Task) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskDetailModal task={task} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("TaskDetailModal execution view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
  });

  it("shows the task execution state and related action timeline", async () => {
    apiMocks.getActions.mockResolvedValue({
      actions: [
        {
          id: "action-1",
          kind: "task_created",
          actor: "human",
          summary: "Implement project invite flow",
          related_id: "task-request",
          created_at: "2026-04-28T00:00:00Z",
        },
        {
          id: "action-2",
          kind: "task_updated",
          actor: "eng",
          summary: "Implement project invite flow [review]",
          related_id: "task-request",
          created_at: "2026-04-28T00:05:00Z",
        },
        {
          id: "action-3",
          kind: "task_updated",
          actor: "ceo",
          summary: "Unrelated [done]",
          related_id: "other-task",
          created_at: "2026-04-28T00:06:00Z",
        },
      ],
    });

    renderTaskDetail({
      id: "task-request",
      title: "Implement project invite flow",
      status: "review",
      owner: "eng",
      project_id: "customer-portal",
      channel: "general",
      execution_mode: "local_worktree",
      worktree_branch: "laf-office-task-task-request",
      worktree_path: "/tmp/customer-portal-task-request",
    });

    expect(screen.getByText("Ready for review")).toBeInTheDocument();
    expect(
      screen.getAllByText("laf-office-task-task-request").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("/tmp/customer-portal-task-request").length,
    ).toBeGreaterThan(0);

    const timeline = await screen.findByRole("region", {
      name: "Task execution timeline",
    });
    expect(
      await within(timeline).findByText("task_created"),
    ).toBeInTheDocument();
    expect(within(timeline).getByText("task_updated")).toBeInTheDocument();
    expect(within(timeline).getByText("@eng")).toBeInTheDocument();
    expect(within(timeline).queryByText("Unrelated [done]")).toBeNull();
  });
});
