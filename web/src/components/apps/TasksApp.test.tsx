import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getThreadMessages: vi.fn(),
  post: vi.fn(),
  postMessage: vi.fn(),
  postMessageAs: vi.fn(),
  reassignTask: vi.fn(),
  updateProject: vi.fn(),
  updateTaskStatus: vi.fn(),
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

function mockProjectDirectory() {
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
        id: "customer-portal",
        lead_agent: "engineer",
        name: "Customer Portal",
      },
      { id: "agent-lab", name: "Agent Lab" },
      { id: "billing", name: "Billing", status: "waiting" },
    ],
  });
  apiMocks.getOfficeTasks.mockResolvedValue({
    tasks: [
      {
        id: "task-open",
        details: "Write the first release narrative.",
        owner: "human",
        project_id: "customer-portal",
        status: "open",
        title: "Draft launch brief",
      },
      {
        id: "task-build",
        channel: "general",
        created_by: "ceo",
        details:
          "Pick up the Korean user-reported latency issue: `유저가 사주정보를 입력하고 결제 확인까지 가는 과정에서 지연되는 지점이 있는듯함.` Treat this as a bugfix lane.",
        owner: "engineer",
        project_id: "customer-portal",
        status: "in_progress",
        thread_id: "thread-build",
        title: "Implement signup flow",
      },
      {
        id: "task-review",
        owner: "engineer",
        project_id: "customer-portal",
        status: "review",
        title: "Review signup flow",
      },
      {
        id: "task-done",
        owner: "ceo",
        project_id: "customer-portal",
        status: "done",
        title: "Pick wedge",
      },
      {
        id: "task-blocked",
        owner: "pm",
        project_id: "billing",
        status: "blocked",
        title: "Wait for Stripe access",
      },
    ],
  });
  apiMocks.getActions.mockResolvedValue({ actions: [] });
  apiMocks.getOfficeMembers.mockResolvedValue({
    members: [
      { name: "CEO", slug: "ceo" },
      { name: "Engineer", slug: "engineer" },
      { name: "Product", slug: "pm" },
    ],
  });
  apiMocks.getProjectRepoReadiness.mockResolvedValue({ readiness: null });
  apiMocks.getThreadMessages.mockResolvedValue({
    messages: [
      {
        channel: "general",
        content: "I am on the signup flow.",
        from: "engineer",
        id: "message-agent",
        timestamp: "2026-05-05T01:00:00Z",
        thread_id: "thread-build",
      },
    ],
  });
  apiMocks.postMessage.mockResolvedValue({
    channel: "general",
    content: "sent",
    id: "message-1",
  });
  apiMocks.postMessageAs.mockResolvedValue({
    channel: "general",
    content: "ack",
    id: "message-ack",
  });
}

describe("TasksApp project directory", () => {
  beforeEach(mockProjectDirectory);

  it("renders only a Jira-style project list with status and ticket counts", async () => {
    renderTasksApp();

    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();

    const directory = screen.getByRole("region", { name: "Projects" });
    expect(within(directory).getByText("Customer Portal")).toBeInTheDocument();
    expect(
      await within(directory).findByText("In progress"),
    ).toBeInTheDocument();
    expect(within(directory).getByText("Agent Lab")).toBeInTheDocument();
    expect(within(directory).getByText("Not started")).toBeInTheDocument();
    expect(within(directory).getByText("Billing")).toBeInTheDocument();
    expect(within(directory).getByText("Waiting")).toBeInTheDocument();

    expect(
      within(directory).getAllByText("not started").length,
    ).toBeGreaterThan(0);
    expect(
      within(directory).getAllByText("in progress").length,
    ).toBeGreaterThan(0);
    expect(within(directory).getAllByText("waiting").length).toBeGreaterThan(0);
    expect(within(directory).getAllByText("done").length).toBeGreaterThan(0);
    expect(screen.queryByText("Next task")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
    expect(screen.queryByText("Issues")).not.toBeInTheDocument();
  });

  it("opens a project detail view with its ticket list", async () => {
    const user = userEvent.setup();
    renderTasksApp();

    const customerPortal = await screen.findByRole("button", {
      name: /Customer Portal/,
    });
    await user.click(customerPortal);

    expect(useAppStore.getState().projectFocusId).toBe("customer-portal");
    expect(
      await screen.findByRole("heading", { name: "Customer Portal" }),
    ).toBeInTheDocument();

    const ticketList = screen.getByRole("region", { name: "Tickets" });
    expect(
      within(ticketList).getByText("Implement signup flow"),
    ).toBeInTheDocument();
    expect(
      within(ticketList).getByText("Review signup flow"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
  });

  it("creates a ticket inside the selected project", async () => {
    const user = userEvent.setup();
    apiMocks.createTask.mockResolvedValue({
      task: {
        id: "task-new",
        owner: "engineer",
        project_id: "customer-portal",
        status: "open",
        title: "Instrument funnel",
      },
    });

    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: /Customer Portal/ }),
    );
    await user.click(screen.getByRole("button", { name: "New ticket" }));
    await user.type(screen.getByLabelText("Ticket title"), "Instrument funnel");
    await user.type(screen.getByLabelText("Details"), "Track signup drop-off.");
    await user.click(screen.getByRole("button", { name: "Create ticket" }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: "human",
          details: "Track signup drop-off.",
          owner: "engineer",
          project_id: "customer-portal",
          title: "Instrument funnel",
        }),
      );
    });
    expect(apiMocks.postMessageAs).toHaveBeenCalledWith(
      "engineer",
      "I've got this ticket and I'm starting now.",
      "general",
      "task-new",
    );
  });

  it("opens ticket details in a right-side panel with agent chat", async () => {
    const user = userEvent.setup();
    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: /Customer Portal/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Implement signup flow/ }),
    );

    const panel = await screen.findByRole("complementary", {
      name: "Details",
    });
    expect(
      within(panel).getByText(
        "유저가 사주정보를 입력하고 결제 확인까지 가는 과정에서 지연되는 지점이 있는듯함.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Treat this as/)).not.toBeInTheDocument();
    expect(
      await within(panel).findByText("I am on the signup flow."),
    ).toBeInTheDocument();

    await user.type(
      within(panel).getByLabelText("Ticket chat"),
      "Please finish this ticket and report blockers.",
    );
    await user.click(within(panel).getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "Please finish this ticket and report blockers.",
        "general",
        "thread-build",
      );
    });
  });

  it("creates a new project from the plus button", async () => {
    const user = userEvent.setup();
    apiMocks.createProject.mockResolvedValue({
      project: { id: "mobile-app", name: "Mobile App" },
    });

    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: "New project" }),
    );
    await user.type(screen.getByLabelText("Project name"), "Mobile App");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(apiMocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: "human",
          name: "Mobile App",
        }),
      );
    });
    expect(useAppStore.getState().projectFocusId).toBe("mobile-app");
  });
});

describe("TasksApp localization", () => {
  it("uses the Korean project directory labels", async () => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentApp: "tasks",
      language: "ko",
      projectFocusId: null,
      wikiPath: null,
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ id: "sajuhook", name: "sajuhook" }],
    });
    apiMocks.getOfficeTasks.mockResolvedValue({ tasks: [] });

    renderTasksApp();

    expect(
      await screen.findByRole("heading", { name: "프로젝트" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("시작 전").length).toBeGreaterThan(0);
    expect(screen.queryByText("Next task")).not.toBeInTheDocument();
  });
});
