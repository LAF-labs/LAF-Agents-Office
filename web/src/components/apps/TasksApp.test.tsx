import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { TasksApp } from "./TasksApp";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  createTask: vi.fn(),
  getActions: vi.fn(),
  getOfficeMembers: vi.fn(),
  getOfficeTasks: vi.fn(),
  getProjects: vi.fn(),
  post: vi.fn(),
  reassignTask: vi.fn(),
  updateProject: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);
vi.mock("../ui/Toast", () => ({ showNotice: vi.fn() }));

function renderTasksApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TasksApp />
    </QueryClientProvider>,
  );
}

describe("TasksApp project workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentApp: null, language: "en", wikiPath: null });
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          id: "customer-portal",
          name: "Customer Portal",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        },
      ],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-open",
          title: "Draft launch brief",
          status: "open",
          project_id: "customer-portal",
          channel: "general",
          owner: "human",
        },
        {
          id: "task-build",
          title: "Implement signup flow",
          status: "in_progress",
          project_id: "customer-portal",
          owner: "engineer",
        },
        {
          id: "task-done",
          title: "Pick wedge",
          status: "done",
          project_id: "customer-portal",
          owner: "ceo",
        },
      ],
    });
    apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
    apiMocks.getActions.mockResolvedValue({ actions: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the first project as a workspace with wiki, task, agent, and GitHub status", async () => {
    renderTasksApp();

    expect(
      await screen.findByRole("heading", { name: "Project workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Customer Portal workspace")).toBeInTheDocument();
    expect(screen.getByText("Wiki context")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Project memory agents read before work and update after decisions and changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Task queue")).toBeInTheDocument();
    expect(screen.getByText("Agent work")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(await screen.findByText("2 active tasks")).toBeInTheDocument();
    expect(screen.getByText("1 agent-owned task")).toBeInTheDocument();
    expect(screen.queryByText("#general")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open GitHub repo" }),
    ).toHaveAttribute("href", "https://github.com/laf-labs/customer-portal");

    await waitFor(() => {
      expect(apiMocks.getOfficeTasks).toHaveBeenLastCalledWith({
        includeDone: true,
        projectId: "customer-portal",
      });
    });
  });

  it("keeps GitHub optional when the selected project has no repo", async () => {
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ id: "agent-lab", name: "Agent Lab" }],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });

    renderTasksApp();

    expect(await screen.findByText("Agent Lab workspace")).toBeInTheDocument();
    expect(screen.getByText("Repo not connected")).toBeInTheDocument();
    expect(
      screen.getByText("Connect it only when code work starts."),
    ).toBeInTheDocument();
  });

  it("connects a GitHub repo to the selected project after project creation", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects
      .mockResolvedValueOnce({
        projects: [
          {
            id: "agent-lab",
            name: "Agent Lab",
            description: "Build agents for implementation work.",
          },
        ],
      })
      .mockResolvedValue({
        projects: [
          {
            id: "agent-lab",
            name: "Agent Lab",
            description: "Build agents for implementation work.",
            github_repo_url: "https://github.com/laf-labs/agent-lab",
          },
        ],
      });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });
    apiMocks.updateProject.mockResolvedValue({
      project: {
        id: "agent-lab",
        name: "Agent Lab",
        description: "Build agents for implementation work.",
        github_repo_url: "https://github.com/laf-labs/agent-lab",
      },
    });

    renderTasksApp();

    expect(await screen.findByText("Agent Lab workspace")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Connect GitHub repo" }),
    );
    await user.type(
      screen.getByLabelText("GitHub repository URL"),
      "https://github.com/laf-labs/agent-lab",
    );
    await user.click(screen.getByRole("button", { name: "Save GitHub repo" }));

    await waitFor(() => {
      expect(apiMocks.updateProject).toHaveBeenCalledWith({
        id: "agent-lab",
        name: "Agent Lab",
        description: "Build agents for implementation work.",
        github_repo_url: "https://github.com/laf-labs/agent-lab",
        created_by: "human",
      });
    });
    expect(
      await screen.findByRole("link", { name: "Open GitHub repo" }),
    ).toHaveAttribute("href", "https://github.com/laf-labs/agent-lab");
  });

  it("creates a local worktree task from the selected project request box when a repo is connected", async () => {
    const user = userEvent.setup();
    apiMocks.createTask.mockResolvedValue({
      task: {
        id: "task-request",
        title: "Implement project invite flow",
        status: "in_progress",
        project_id: "customer-portal",
        channel: "general",
        owner: "eng",
        execution_mode: "local_worktree",
        worktree_branch: "laf-office-task-task-request",
        worktree_path: "/tmp/customer-portal-task-request",
      },
    });

    renderTasksApp();

    expect(
      await screen.findByText("Customer Portal workspace"),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Project work request"),
      "Implement project invite flow",
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith({
        title: "Implement project invite flow",
        details: "Implement project invite flow",
        project_id: "customer-portal",
        channel: "general",
        owner: "eng",
        task_type: "feature",
        execution_mode: "local_worktree",
        created_by: "human",
      });
    });
    expect(
      await screen.findByRole("dialog", { name: "Task task-request" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Agent is working")).toBeInTheDocument();
    expect(screen.getAllByText("@eng").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("/tmp/customer-portal-task-request").length,
    ).toBeGreaterThan(0);
  });

  it("creates an office planning task from the request box when no repo is connected", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ id: "agent-lab", name: "Agent Lab" }],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });
    apiMocks.createTask.mockResolvedValue({
      task: {
        id: "task-request",
        title: "Plan the first implementation slice",
        project_id: "agent-lab",
        owner: "ceo",
        execution_mode: "office",
      },
    });

    renderTasksApp();

    expect(await screen.findByText("Agent Lab workspace")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Project work request"),
      "Plan the first implementation slice",
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith({
        title: "Plan the first implementation slice",
        details: "Plan the first implementation slice",
        project_id: "agent-lab",
        channel: "general",
        owner: "ceo",
        task_type: "research",
        execution_mode: "office",
        created_by: "human",
      });
    });
  });

  it("opens the wiki route for a newly created project workspace", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects
      .mockResolvedValueOnce({ projects: [] })
      .mockResolvedValue({
        projects: [{ id: "mobile-app", name: "Mobile App" }],
      });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });
    apiMocks.createProject.mockResolvedValue({
      project: { id: "mobile-app", name: "Mobile App" },
    });

    renderTasksApp();

    expect(
      await screen.findByText("Create the first project"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("Project name"), "Mobile App");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Mobile App workspace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open project wiki" }));

    expect(useAppStore.getState().currentApp).toBe("wiki");
    expect(useAppStore.getState().wikiPath).toBe("projects/mobile-app");
  });
});

describe("TasksApp project creation handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentApp: null, language: "en", wikiPath: null });
    apiMocks.getProjects
      .mockResolvedValueOnce({ projects: [] })
      .mockResolvedValue({
        projects: [{ id: "mobile-app", name: "Mobile App" }],
      });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });
    apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
    apiMocks.getActions.mockResolvedValue({ actions: [] });
    apiMocks.createProject.mockResolvedValue({
      project: { id: "mobile-app", name: "Mobile App" },
    });
  });

  it("guides a newly created project into the first planning task request", async () => {
    const user = userEvent.setup();

    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: "New project" }),
    );
    await user.type(screen.getByLabelText("Project name"), "Mobile App");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Mobile App workspace")).toBeInTheDocument();
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No GitHub repo is connected yet. This creates a planning, documentation, or task-breakdown request.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Project work request")).toBeInTheDocument();
  });
});

describe("TasksApp project activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentApp: null, language: "en", wikiPath: null });
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ id: "customer-portal", name: "Customer Portal" }],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-build",
          title: "Implement signup flow",
          status: "in_progress",
          project_id: "customer-portal",
          owner: "engineer",
        },
      ],
    });
    apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
    apiMocks.getActions.mockResolvedValue({
      actions: [
        {
          id: "project-action",
          kind: "project_created",
          summary: "Customer Portal",
          related_id: "customer-portal",
          actor: "human",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "task-action",
          kind: "task_created",
          summary: "Implement signup flow",
          related_id: "task-build",
          actor: "human",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: "other-action",
          kind: "task_created",
          summary: "Other project task",
          related_id: "other-task",
          actor: "human",
          created_at: "2026-01-03T00:00:00Z",
        },
      ],
    });
  });

  it("shows project-scoped activity from project and task actions", async () => {
    renderTasksApp();

    expect(
      await screen.findByText("Customer Portal workspace"),
    ).toBeInTheDocument();
    const activity = await screen.findByRole("region", {
      name: "Activity log",
    });

    expect(within(activity).getByText("Customer Portal")).toBeInTheDocument();
    expect(
      within(activity).getByText("Implement signup flow"),
    ).toBeInTheDocument();
    expect(
      within(activity).queryByText("Other project task"),
    ).not.toBeInTheDocument();
  });
});

describe("TasksApp localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentApp: null, language: "ko", wikiPath: null });
    apiMocks.getProjects.mockResolvedValue({ projects: [] });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });
    apiMocks.getOfficeMembers.mockResolvedValue({ members: [] });
    apiMocks.getActions.mockResolvedValue({ actions: [] });
  });

  it("renders the empty project workspace in Korean", async () => {
    renderTasksApp();

    expect(
      await screen.findByText("프로젝트 워크스페이스"),
    ).toBeInTheDocument();
    expect(screen.getByText("첫 프로젝트 만들기")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "프로젝트를 만들거나 선택해 워크스페이스를 여세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Project workspace")).not.toBeInTheDocument();
  });

  it("opens the project creation form from the empty workspace CTA", async () => {
    const user = userEvent.setup();
    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: "새 프로젝트 만들기" }),
    );

    expect(
      screen.getByRole("textbox", { name: "프로젝트 이름" }),
    ).toBeInTheDocument();
  });
});
