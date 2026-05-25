import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { TasksApp } from "./TasksApp";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  createTask: vi.fn(),
  getOfficeMembers: vi.fn(),
  getOfficeTasks: vi.fn(),
  getProjectRepoReadiness: vi.fn(),
  getProjects: vi.fn(),
  getThreadMessages: vi.fn(),
  normalizeModelMode: (mode?: string | null) =>
    mode === "laf_model" || mode === "record_only" ? mode : "record_only",
  postMessage: vi.fn(),
  postMessageAs: vi.fn(),
  updateProject: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);
vi.mock("../ui/Toast", () => ({ showNotice: vi.fn() }));

function renderTasksApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TasksApp />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    currentApp: "tasks",
    language: "en",
    projectFocusId: null,
    wikiPath: null,
  });
  apiMocks.getProjects.mockResolvedValue({
    projects: [
      {
        channel: "general",
        github_repo_url: "https://github.com/laf-labs/customer-portal",
        id: "customer-portal",
        lead_agent: "engineer",
        name: "Customer Portal",
      },
    ],
  });
  apiMocks.getOfficeTasks.mockResolvedValue({
    tasks: [
      {
        channel: "general",
        details: "Write the first release narrative.",
        id: "task-open",
        model_mode: "laf_model",
        owner: "engineer",
        project_id: "customer-portal",
        status: "open",
        thread_id: "thread-open",
        title: "Draft launch brief",
      },
    ],
  });
  apiMocks.getOfficeMembers.mockResolvedValue({
    members: [
      { name: "CEO", slug: "ceo" },
      { name: "Engineer", slug: "engineer" },
    ],
  });
  apiMocks.getProjectRepoReadiness.mockResolvedValue({ readiness: null });
  apiMocks.getThreadMessages.mockResolvedValue({ messages: [] });
});

describe("TasksApp cloud office workflow", () => {
  it("renders projects and tasks without obsolete execution setup copy", async () => {
    const user = userEvent.setup();
    renderTasksApp();

    await user.click(await screen.findByText("Customer Portal"));
    expect(await screen.findByText("Draft launch brief")).toBeInTheDocument();
    expect(screen.queryByText(/obsolete execution setup/i)).not.toBeInTheDocument();
  });
});
