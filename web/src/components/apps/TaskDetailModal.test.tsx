import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "../../api/client";
import { useAppStore } from "../../stores/app";
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

function renderTaskDetail(task: Task, onClose = () => {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskDetailModal task={task} onClose={onClose} />
    </QueryClientProvider>,
  );
}

function resetTaskDetailModalTest() {
  vi.clearAllMocks();
  useAppStore.setState({ language: "en" });
  apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
}

describe("TaskDetailModal execution view", () => {
  beforeEach(resetTaskDetailModalTest);

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
      screen.queryByText("/tmp/customer-portal-task-request"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Owner assigned")).toBeInTheDocument();
    expect(screen.getByText("Branch ready")).toBeInTheDocument();
    expect(screen.getByText("Delivery receipt needed")).toBeInTheDocument();
    expect(screen.getByText("Waiting for human review.")).toBeInTheDocument();

    const timeline = await screen.findByRole("region", {
      name: "Task activity",
    });
    expect(
      await within(timeline).findByText("Task created"),
    ).toBeInTheDocument();
    expect(within(timeline).getByText("Task updated")).toBeInTheDocument();
    expect(within(timeline).getByText("@eng")).toBeInTheDocument();
    expect(within(timeline).queryByText("Unrelated [done]")).toBeNull();
    expect(within(timeline).queryByText("task_created")).toBeNull();
  });

  it("shows delivery receipt details when a task has a PR", async () => {
    apiMocks.getActions.mockResolvedValue({ actions: [] });

    renderTaskDetail({
      id: "task-request",
      title: "Implement project invite flow",
      status: "review",
      owner: "eng",
      project_id: "customer-portal",
      channel: "general",
      execution_mode: "local_worktree",
      worktree_branch: "laf-office-task-task-request",
      delivery_url: "https://github.com/LAF-labs/customer-portal/pull/42",
      delivery_summary: "Implemented invite form validation.",
      delivered_at: "2026-04-28T00:10:00Z",
    });

    const delivery = screen.getByRole("region", { name: "Delivery receipt" });
    expect(
      within(delivery).getByRole("link", { name: "Open PR #42" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/LAF-labs/customer-portal/pull/42",
    );
    expect(
      within(delivery).getByText("Implemented invite form validation."),
    ).toBeInTheDocument();
    expect(within(delivery).getByText("Delivered")).toBeInTheDocument();
  });

  it("lets the broker create the PR receipt when completing without a manual URL", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiMocks.getActions.mockResolvedValue({ actions: [] });
    apiMocks.updateTaskStatus.mockResolvedValue({
      task: { id: "task-request", status: "review" },
    });

    renderTaskDetail(
      {
        id: "task-request",
        title: "Implement project invite flow",
        status: "review",
        owner: "eng",
        project_id: "customer-portal",
        channel: "general",
        execution_mode: "local_worktree",
        worktree_branch: "laf-office-task-task-request",
      },
      onClose,
    );

    await user.click(screen.getByRole("button", { name: "Mark done" }));

    await waitFor(() => {
      expect(apiMocks.updateTaskStatus).toHaveBeenCalledWith(
        "task-request",
        "complete",
        "general",
        "human",
        undefined,
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the delivery receipt when marking a project coding task done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiMocks.getActions.mockResolvedValue({ actions: [] });
    apiMocks.updateTaskStatus.mockResolvedValue({
      task: { id: "task-request", status: "done" },
    });

    renderTaskDetail(
      {
        id: "task-request",
        title: "Implement project invite flow",
        status: "review",
        owner: "eng",
        project_id: "customer-portal",
        channel: "general",
        execution_mode: "local_worktree",
        worktree_branch: "laf-office-task-task-request",
      },
      onClose,
    );

    await user.type(
      screen.getByLabelText("Delivery URL"),
      "https://github.com/LAF-labs/customer-portal/pull/42",
    );
    await user.type(
      screen.getByLabelText("Delivery summary"),
      "Implemented invite form validation.",
    );
    await user.click(screen.getByRole("button", { name: "Mark done" }));

    await waitFor(() => {
      expect(apiMocks.updateTaskStatus).toHaveBeenCalledWith(
        "task-request",
        "complete",
        "general",
        "human",
        {
          delivery_url: "https://github.com/LAF-labs/customer-portal/pull/42",
          delivery_summary: "Implemented invite form validation.",
        },
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("localizes delivery receipt labels in Korean", () => {
    useAppStore.setState({ language: "ko" });
    apiMocks.getActions.mockResolvedValue({ actions: [] });

    renderTaskDetail({
      id: "task-request",
      title: "Implement project invite flow",
      status: "review",
      owner: "eng",
      project_id: "customer-portal",
      channel: "general",
      execution_mode: "local_worktree",
      worktree_branch: "laf-office-task-task-request",
      delivery_url: "https://github.com/LAF-labs/customer-portal/pull/42",
      delivery_summary: "초대 폼 검증을 구현했습니다.",
      delivered_at: "2026-04-28T00:10:00Z",
    });

    const delivery = screen.getByRole("region", { name: "전달 결과" });
    expect(
      within(delivery).getByRole("link", { name: "PR #42 열기" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/LAF-labs/customer-portal/pull/42",
    );
    expect(within(delivery).getByText("전달 시각")).toBeInTheDocument();
  });
});

describe("TaskDetailModal project copy", () => {
  beforeEach(resetTaskDetailModalTest);

  it("localizes workflow sections and removes office-internal guidance in Korean", () => {
    useAppStore.setState({ language: "ko" });
    apiMocks.getActions.mockResolvedValue({ actions: [] });

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

    expect(screen.getByText("작업 상태")).toBeInTheDocument();
    expect(screen.getByText("리뷰 준비됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "리뷰로 이동" })).toBeDisabled();
    expect(screen.getByText("담당자")).toBeInTheDocument();
    expect(
      screen.getByText("다음 단계를 맡을 사람을 바꿉니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Execution")).not.toBeInTheDocument();
    expect(screen.queryByText("Ownership")).not.toBeInTheDocument();
    expect(screen.queryByText(/CEO is cc'd/)).not.toBeInTheDocument();
    expect(screen.queryByText("/tmp/customer-portal-task-request")).toBeNull();
  });

  it("does not surface channel metadata for project-scoped tasks", () => {
    apiMocks.getActions.mockResolvedValue({ actions: [] });

    renderTaskDetail({
      id: "task-request",
      title: "Implement project invite flow",
      status: "review",
      owner: "eng",
      project_id: "customer-portal",
      channel: "general",
      execution_mode: "local_worktree",
    });

    expect(screen.queryByText("Channel")).not.toBeInTheDocument();
    expect(screen.queryByText(/#general/)).not.toBeInTheDocument();
  });
});
