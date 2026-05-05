import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { TasksApp } from "./TasksApp";

const apiMocks = vi.hoisted(() => ({
  createDM: vi.fn(),
  createProject: vi.fn(),
  createTask: vi.fn(),
  getActions: vi.fn(),
  getOfficeMembers: vi.fn(),
  getOfficeTasks: vi.fn(),
  getProjectRepoReadiness: vi.fn(),
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

function mockCustomerPortalWorkspace() {
  vi.clearAllMocks();
  useAppStore.setState({ currentApp: null, language: "en", wikiPath: null });
  apiMocks.getProjectRepoReadiness.mockResolvedValue({
    readiness: {
      project_id: "customer-portal",
      repo_url: "https://github.com/laf-labs/customer-portal",
      status: "ready",
      message: "GitHub CLI can access this repository.",
      can_create_coding_tasks: true,
      default_branch: "main",
    },
  });
  apiMocks.getProjects.mockResolvedValue({
    projects: [
      {
        id: "customer-portal",
        name: "Customer Portal",
        lead_agent: "engineer",
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
  apiMocks.getOfficeMembers.mockResolvedValue({
    members: [
      { slug: "engineer", name: "Engineer", role: "engineering" },
      { slug: "pm", name: "PM", role: "product" },
    ],
  });
  apiMocks.getActions.mockResolvedValue({ actions: [] });
  apiMocks.createDM.mockResolvedValue({ slug: "engineer__human" });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TasksApp project workspace", () => {
  beforeEach(mockCustomerPortalWorkspace);

  it("opens the first project with issue state before the Codex command bar", async () => {
    const { container } = renderTasksApp();

    expect(
      await screen.findByRole("heading", { name: "Project workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Customer Portal workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open project wiki" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /@engineer/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(await screen.findByText("Repo ready")).toBeInTheDocument();
    expect(await screen.findByText(/2 active tasks/)).toBeInTheDocument();
    expect(screen.getByText("Issues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveClass("active");
    expect(screen.queryByText("#general")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open GitHub repo" }),
    ).toHaveAttribute("href", "https://github.com/laf-labs/customer-portal");
    const text = container.textContent ?? "";
    expect(text.indexOf("Customer Portal workspace")).toBeLessThan(
      text.indexOf("Codex command"),
    );
    expect(text.indexOf("Draft launch brief")).toBeLessThan(
      text.indexOf("Codex command"),
    );
    expect(text.indexOf("Codex command")).toBeLessThan(
      text.indexOf("Activity log"),
    );

    await waitFor(() => {
      expect(apiMocks.getOfficeTasks).toHaveBeenCalledWith({
        includeDone: true,
        projectId: "customer-portal",
      });
    });
  });

  it("updates the selected project's lead agent from the header", async () => {
    const user = userEvent.setup();
    apiMocks.updateProject.mockResolvedValue({
      project: {
        id: "customer-portal",
        name: "Customer Portal",
        lead_agent: "pm",
      },
    });

    renderTasksApp();

    const leadSelect = await screen.findByRole("combobox", {
      name: "Project lead",
    });
    expect(leadSelect).toHaveValue("engineer");

    await user.selectOptions(leadSelect, "pm");

    await waitFor(() => {
      expect(apiMocks.updateProject).toHaveBeenCalledWith({
        id: "customer-portal",
        lead_agent: "pm",
        created_by: "human",
      });
    });
  });

  it("shows a project list with status totals and opens the assigned agent chat", async () => {
    const user = userEvent.setup();

    renderTasksApp();

    const projectList = await screen.findByRole("complementary", {
      name: "Projects",
    });
    expect(
      within(projectList).getByText("Customer Portal"),
    ).toBeInTheDocument();
    expect(within(projectList).getAllByText("active").length).toBeGreaterThan(
      0,
    );
    expect(within(projectList).getAllByText("done").length).toBeGreaterThan(0);
    expect(
      within(projectList).getAllByText("@engineer").length,
    ).toBeGreaterThan(0);

    await user.click(
      within(projectList).getAllByRole("button", {
        name: "Chat with agent @engineer",
      })[0],
    );

    await waitFor(() => {
      expect(apiMocks.createDM).toHaveBeenCalledWith("engineer");
    });
    expect(useAppStore.getState().currentChannel).toBe("engineer__human");
  });

  it("keeps issue controls available in the All projects dashboard", async () => {
    const user = userEvent.setup();
    const allTasks = [
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
      {
        id: "task-support",
        title: "Plan support queue",
        status: "review",
        project_id: "agent-lab",
        owner: "planner",
      },
    ];
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          id: "customer-portal",
          name: "Customer Portal",
          lead_agent: "engineer",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        },
        { id: "agent-lab", name: "Agent Lab" },
      ],
    });
    apiMocks.getOfficeTasks.mockImplementation(
      ({ projectId }: { projectId?: string }) =>
        Promise.resolve({
          tasks: projectId
            ? allTasks.filter((task) => task.project_id === projectId)
            : allTasks,
        }),
    );

    renderTasksApp();

    const projectList = await screen.findByRole("complementary", {
      name: "Projects",
    });
    await user.click(
      within(projectList).getByRole("button", { name: /All projects/ }),
    );

    expect(screen.getByText("All projects · 4 issues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByText("Plan support queue")).toBeInTheDocument();
  });
});

describe("TasksApp project workspace controls", () => {
  beforeEach(mockCustomerPortalWorkspace);

  it("keeps GitHub optional when the selected project has no repo", async () => {
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ id: "agent-lab", name: "Agent Lab" }],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });

    renderTasksApp();

    expect(await screen.findByText("Agent Lab workspace")).toBeInTheDocument();
    expect(screen.getByText("Repo not connected")).toBeInTheDocument();
    expect(screen.getAllByText("@ceo").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Connect GitHub repo" }),
    ).toBeInTheDocument();
  });

  it("switches between dense issue list and board view", async () => {
    const user = userEvent.setup();

    renderTasksApp();

    expect(await screen.findByText("Draft launch brief")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Issue" }),
    ).toBeInTheDocument();
    const issueList = screen.getByRole("region", { name: "Issues" });
    expect(
      within(issueList).getAllByText("@engineer")[0].closest("td"),
    ).toHaveAttribute("data-label", "Owner");
    await user.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.getAllByText("in progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("open").length).toBeGreaterThan(0);
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
    apiMocks.getProjectRepoReadiness.mockResolvedValue({
      readiness: {
        project_id: "agent-lab",
        repo_url: "https://github.com/laf-labs/agent-lab",
        status: "ready",
        message: "GitHub CLI can access this repository.",
        can_create_coding_tasks: true,
        default_branch: "main",
      },
    });
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
    expect(await screen.findByText("Repo ready")).toBeInTheDocument();
  });
});

describe("TasksApp project task request flow", () => {
  beforeEach(mockCustomerPortalWorkspace);

  it("creates a local worktree task from the selected project request box when a repo is connected", async () => {
    const user = userEvent.setup();
    apiMocks.createTask.mockResolvedValue({
      task: {
        id: "task-request",
        title: "Implement project invite flow",
        status: "in_progress",
        project_id: "customer-portal",
        channel: "general",
        owner: "engineer",
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
        owner: "engineer",
        task_type: "feature",
        execution_mode: "local_worktree",
        created_by: "human",
      });
    });
    expect(
      await screen.findByRole("dialog", { name: "Task task-request" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Work state")).toBeInTheDocument();
    expect(screen.getByText("Agent is working")).toBeInTheDocument();
    expect(screen.getAllByText("@engineer").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("/tmp/customer-portal-task-request"),
    ).not.toBeInTheDocument();
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

  it("keeps a connected project in planning mode until GitHub readiness passes", async () => {
    const user = userEvent.setup();
    apiMocks.getProjectRepoReadiness.mockResolvedValue({
      readiness: {
        project_id: "customer-portal",
        repo_url: "https://github.com/laf-labs/customer-portal",
        status: "auth_required",
        message: "Run gh auth login.",
        can_create_coding_tasks: false,
      },
    });
    apiMocks.createTask.mockResolvedValue({
      task: {
        id: "task-request",
        title: "Break down the signup implementation",
        project_id: "customer-portal",
        owner: "ceo",
        execution_mode: "office",
      },
    });

    renderTasksApp();

    expect(await screen.findByText("GitHub login needed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "GitHub is connected but not ready. This creates planning, documentation, or task-breakdown work until setup is fixed.",
      ),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Project work request"),
      "Break down the signup implementation",
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith({
        title: "Break down the signup implementation",
        details: "Break down the signup implementation",
        project_id: "customer-portal",
        channel: "general",
        owner: "engineer",
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
    apiMocks.getOfficeMembers.mockResolvedValue({
      members: [{ slug: "designer", name: "Designer", role: "design" }],
    });
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
    await user.selectOptions(screen.getByLabelText("Project lead"), "designer");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(apiMocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Mobile App",
        lead_agent: "designer",
      }),
    );
    expect(await screen.findByText("Mobile App workspace")).toBeInTheDocument();
    expect(screen.getByText("Codex command")).toBeInTheDocument();
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

  it("shows delivery receipt state on project task cards", async () => {
    apiMocks.getOfficeTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-needs-receipt",
          title: "Implement signup flow",
          status: "review",
          project_id: "customer-portal",
          owner: "engineer",
          execution_mode: "local_worktree",
          worktree_branch: "laf-office-task-task-needs-receipt",
        },
        {
          id: "task-has-pr",
          title: "Implement invite flow",
          status: "review",
          project_id: "customer-portal",
          owner: "engineer",
          execution_mode: "local_worktree",
          worktree_branch: "laf-office-task-task-has-pr",
          delivery_url: "https://github.com/laf-labs/customer-portal/pull/42",
          delivery_status: "open",
        },
        {
          id: "task-failing-pr",
          title: "Implement billing flow",
          status: "review",
          project_id: "customer-portal",
          owner: "engineer",
          execution_mode: "local_worktree",
          worktree_branch: "laf-office-task-task-failing-pr",
          delivery_url: "https://github.com/laf-labs/customer-portal/pull/43",
          delivery_status: "open",
          delivery_checks_status: "failing",
        },
      ],
    });

    renderTasksApp();

    expect(
      await screen.findByText("Customer Portal workspace"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Receipt needed")).toBeInTheDocument();
    expect(await screen.findByText("PR open")).toBeInTheDocument();
    expect(await screen.findByText("Checks failing")).toBeInTheDocument();
    expect(await screen.findAllByText("Coding task")).toHaveLength(3);
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
