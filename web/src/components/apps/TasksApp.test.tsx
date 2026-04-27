import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { TasksApp } from "./TasksApp";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getOfficeTasks: vi.fn(),
  getProjects: vi.fn(),
  post: vi.fn(),
  updateProject: vi.fn(),
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
    useAppStore.setState({ currentApp: null, wikiPath: null });
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
    expect(screen.getByText("Task queue")).toBeInTheDocument();
    expect(screen.getByText("Agent work")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(await screen.findByText("2 active tasks")).toBeInTheDocument();
    expect(screen.getByText("1 agent-owned task")).toBeInTheDocument();
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
