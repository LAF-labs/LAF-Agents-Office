import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { TasksApp } from "./TasksApp";

const apiMocks = vi.hoisted(() => ({
  createExecutionPlan: vi.fn(),
  createDM: vi.fn(),
  createProject: vi.fn(),
  createTask: vi.fn(),
  getActions: vi.fn(),
  getBridgeAvailability: vi.fn(),
  getExecutionPlan: vi.fn(),
  getExecutionPlanEvents: vi.fn(),
  getModelAvailability: vi.fn(),
  getOfficeMembers: vi.fn(),
  getOfficeTasks: vi.fn(),
  getProjectRepoReadiness: vi.fn(),
  getProjects: vi.fn(),
  getThreadMessages: vi.fn(),
  normalizeModelMode: (mode?: string | null) => {
    const value = String(mode || "").trim();
    if (value === "local_cli" || value === "team_bridge") return "my_bridge";
    if (
      value === "laf_model" ||
      value === "my_bridge" ||
      value === "record_only"
    ) {
      return value;
    }
    return "record_only";
  },
  post: vi.fn(),
  postMessage: vi.fn(),
  postMessageAs: vi.fn(),
  reassignTask: vi.fn(),
  updateTask: vi.fn(),
  updateProject: vi.fn(),
  updateTaskStatus: vi.fn(),
}));
const executionEventMocks = vi.hoisted(() => ({
  subscribeExecutionPlanEvents: vi.fn(() => vi.fn()),
}));

vi.mock("../../api/client", () => apiMocks);
vi.mock("../../api/executionEvents", () => executionEventMocks);
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

function lastCreateExecutionPlanPayload() {
  const {
    mock: { calls },
  } = apiMocks.createExecutionPlan;
  return calls[calls.length - 1]?.[0];
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
          "Pick up the Korean user-reported latency issue: `사용자가 사주정보를 입력하고 결제 확인까지 가는 과정에서 지연되는 지점이 있는지 확인.` Treat this as a bugfix lane.",
        human_details:
          "Pick up the Korean user-reported latency issue: `사용자가 사주정보를 입력하고 결제 확인까지 가는 과정에서 지연되는 지점이 있는지 확인.` Treat this as a bugfix lane.",
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
  apiMocks.getBridgeAvailability.mockResolvedValue({
    devices: [],
    my_bridge: {
      available: false,
      device_count: 0,
      online_device_count: 0,
      reason: "bridge required",
    },
  });
  apiMocks.getExecutionPlan.mockResolvedValue({
    plan: { id: "plan-1", status: "pending" },
    receipt: null,
  });
  apiMocks.getExecutionPlanEvents.mockResolvedValue({ events: [] });
  apiMocks.getModelAvailability.mockResolvedValue({
    allowed_modes: ["record_only"],
    default_mode: "record_only",
    laf_model: { available: false, reason: "paid workspace required" },
    my_bridge: { available: false, reason: "bridge required" },
    record_only: { available: true },
  });
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
      {
        channel: "general",
        content: "I am checking payment timing.",
        from: "engineer",
        id: "message-agent-2",
        timestamp: "2026-05-05T01:00:35Z",
        thread_id: "thread-build",
      },
      {
        channel: "general",
        content: "Please check the checkout handoff.",
        from: "you",
        id: "message-human",
        timestamp: "2026-05-05T01:01:00Z",
        thread_id: "thread-build",
      },
      {
        channel: "general",
        content: "Also check confirmation copy.",
        from: "you",
        id: "message-human-2",
        timestamp: "2026-05-05T01:01:40Z",
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

  it("renders only a project work list with status and task counts", async () => {
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
    expect(screen.queryByText("Work items")).not.toBeInTheDocument();
  });

  it("opens a detailed project creation modal and submits recommended context", async () => {
    const user = userEvent.setup();
    apiMocks.createProject.mockResolvedValue({
      project: {
        id: "customer-onboarding",
        name: "Customer onboarding",
      },
    });
    renderTasksApp();

    const directory = await screen.findByRole("region", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "New project" }));

    const modal = await screen.findByRole("dialog", {
      name: "Create a new project",
    });
    expect(within(modal).getAllByText("Required").length).toBeGreaterThan(0);
    expect(within(modal).getAllByText("Recommended").length).toBeGreaterThan(0);
    expect(within(directory).getByText("Customer Portal")).toBeInTheDocument();

    await user.type(
      within(modal).getByLabelText("Project name"),
      "Customer onboarding",
    );
    await user.type(within(modal).getByLabelText("Project code"), "cust");
    await user.type(
      within(modal).getByLabelText("Project summary"),
      "Improve the first-run customer experience.",
    );
    await user.type(
      within(modal).getByLabelText("Goals, constraints, and notes"),
      "Keep billing copy unchanged until approved.",
    );
    await user.type(
      within(modal).getByLabelText("Operating guide"),
      "Verify locally before reporting done.",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Create project" }),
    );

    await waitFor(() => {
      expect(apiMocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          additional_info: "Keep billing copy unchanged until approved.",
          code: "CUST",
          created_by: "human",
          description: "Improve the first-run customer experience.",
          name: "Customer onboarding",
          recipe_filename: "project-brief.md",
          recipe_markdown: "Verify locally before reporting done.",
        }),
      );
    });
  });

  it("opens a project detail view with its task list", async () => {
    const user = userEvent.setup();
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
      },
    });
    renderTasksApp();

    const customerPortal = await screen.findByRole("button", {
      name: /Customer Portal/,
    });
    await user.click(customerPortal);

    expect(useAppStore.getState().projectFocusId).toBe("customer-portal");
    expect(
      await screen.findByRole("heading", { name: "Customer Portal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show info" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Managed checkout")).not.toBeInTheDocument();

    const taskList = screen.getByRole("region", { name: "Tasks" });
    expect(
      within(taskList).getByText("Implement signup flow"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show info" }));
    expect(screen.getByText("GitHub repo required")).toBeInTheDocument();
    expect(screen.getAllByText("LAF Bridge connected").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByText("LAF Bridge is unavailable"),
    ).not.toBeInTheDocument();

    expect(
      (await screen.findAllByText("LAF Bridge connected")).length,
    ).toBeGreaterThan(0);
    expect(
      within(taskList).getByText("Review signup flow"),
    ).toBeInTheDocument();
    expect(within(taskList).getAllByText("Created by").length).toBeGreaterThan(
      0,
    );
    expect(within(taskList).getAllByText("@ceo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
  });
});

describe("TasksApp project bridge workspace", () => {
  beforeEach(mockProjectDirectory);

  it("keeps hosted runtime on managed checkout", async () => {
    renderTasksApp();

    await userEvent.click(
      await screen.findByRole("button", { name: /Customer Portal/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Show info" }),
    );

    expect(
      screen.queryByRole("button", { name: "Use existing folder" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/laf-bridge link-project/),
    ).not.toBeInTheDocument();
  });

  it("keeps the project workspace pair-only without folder commands", async () => {
    const user = userEvent.setup();
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
      },
    });

    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: /Customer Portal/ }),
    );
    await user.click(await screen.findByRole("button", { name: "Show info" }));

    expect(
      screen.queryByRole("button", { name: "Use existing folder" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/laf-bridge link-project/),
    ).not.toBeInTheDocument();
  });
});

describe("TasksApp project task chat", () => {
  beforeEach(mockProjectDirectory);

  it("creates a task inside the selected project", async () => {
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
    await user.click(screen.getByRole("button", { name: "New task" }));
    expect(
      await screen.findByRole("complementary", { name: "New task" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Task title"), "Instrument funnel");
    await user.type(screen.getByLabelText("Details"), "Track signup drop-off.");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(apiMocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: "human",
          details: "Track signup drop-off.",
          human_details: "Track signup drop-off.",
          owner: "engineer",
          project_id: "customer-portal",
          title: "Instrument funnel",
        }),
      );
    });
    expect(apiMocks.postMessageAs).toHaveBeenCalledWith(
      "engineer",
      "I've got this task and I'm starting now.",
      "general",
      "task-new",
    );
  });

  it("opens task details in a right-side panel with agent chat", async () => {
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
        "사용자가 사주정보를 입력하고 결제 확인까지 가는 과정에서 지연되는 지점이 있는지 확인.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Treat this as/)).not.toBeInTheDocument();
    expect(
      await within(panel).findByText("I am on the signup flow."),
    ).toBeInTheDocument();
    const agentGroup = within(panel)
      .getByText("I am on the signup flow.")
      .closest("article");
    expect(
      within(panel)
        .getByText("I am checking payment timing.")
        .closest("article"),
    ).toBe(agentGroup);
    expect(agentGroup).toHaveClass("justify-start");
    const humanGroup = within(panel)
      .getByText("Please check the checkout handoff.")
      .closest("article");
    expect(
      within(panel)
        .getByText("Also check confirmation copy.")
        .closest("article"),
    ).toBe(humanGroup);
    expect(humanGroup).toHaveClass("justify-end");

    const chatInput = within(panel).getByLabelText("Task chat");
    await user.type(
      chatInput,
      "Please finish this task{Shift>}{Enter}{/Shift}and report blockers.",
    );
    expect(chatInput).toHaveValue(
      "Please finish this task\nand report blockers.",
    );
    expect(apiMocks.postMessage).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "Please finish this task\nand report blockers.",
        "general",
        "thread-build",
        ["engineer"],
        expect.objectContaining({
          model_mode: "record_only",
          project_id: "customer-portal",
          scope: "task_execution",
          task_id: "task-build",
        }),
      );
    });
    expect(
      (
        await within(panel).findByText(
          /Please finish this task\s+and report blockers\./,
        )
      ).closest("article"),
    ).toHaveClass("justify-end");
    expect(
      await within(panel).findByText("Engineer is typing..."),
    ).toBeInTheDocument();
  });
});

describe("TasksApp task Bridge repo gate", () => {
  beforeEach(mockProjectDirectory);

  it("disables LAF Bridge execution until the project has a GitHub repo", async () => {
    const user = userEvent.setup();
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
      },
    });
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
    await user.type(within(panel).getByLabelText("Task chat"), "Run locally");

    expect(
      await within(panel).findByText(
        "Connect a GitHub repo for Bridge managed checkout",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Create plan" }),
    ).toBeDisabled();
  });
});

describe("TasksApp task Bridge plan creation", () => {
  beforeEach(mockProjectDirectory);

  it("creates a LAF Bridge plan after pairing only when the project has a GitHub repo", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn(() => true),
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          github_repo_url: "https://github.com/LAF-labs/demo",
          id: "customer-portal",
          lead_agent: "engineer",
          name: "Customer Portal",
        },
      ],
    });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
        runtimes: ["codex"],
      },
    });
    apiMocks.createExecutionPlan.mockResolvedValue({
      plan: { id: "plan-managed-1", status: "pending" },
      relay: { published: true },
    });

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
    await user.type(
      within(panel).getByLabelText("Task chat"),
      "Run after pairing only",
    );
    await user.click(
      await within(panel).findByRole("button", { name: "Create plan" }),
    );

    await waitFor(() => {
      expect(apiMocks.createExecutionPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: "device-1",
          message: "Run after pairing only",
          mode: "my_bridge",
          provider: "codex",
          task_id: "task-build",
        }),
      );
    });
    expect(lastCreateExecutionPlanPayload()).not.toHaveProperty("binding_id");
  });
});

describe("TasksApp task Bridge receipt rendering", () => {
  beforeEach(mockProjectDirectory);

  it("creates a LAF Bridge execution plan and renders events with the receipt", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn(() => true),
    });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
      },
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          github_repo_url: "https://github.com/LAF-labs/demo",
          id: "customer-portal",
          lead_agent: "engineer",
          name: "Customer Portal",
        },
      ],
    });
    apiMocks.createExecutionPlan.mockResolvedValue({
      plan: { id: "plan-1", status: "pending" },
      relay: { published: true },
    });
    apiMocks.getExecutionPlan.mockResolvedValue({
      plan: { id: "plan-1", status: "completed" },
      receipt: {
        artifacts: [
          {
            title: "Pull request",
            type: "pull_request",
            url: "https://github.com/LAF-labs/demo/pull/42",
          },
        ],
        changed_files: [
          { path: "web/src/App.tsx", status: "modified" },
          { path: "api/index.js", status: "added" },
        ],
        id: "receipt-1",
        mode: "my_bridge",
        provider: "codex",
        status: "completed",
        summary: "Implemented locally.",
        team_id: "team-local",
      },
    });
    apiMocks.getExecutionPlanEvents.mockResolvedValue({
      events: [
        {
          event_type: "provider.output",
          id: "event-1",
          payload: { line: "Running tests" },
          plan_id: "plan-1",
          redacted: false,
          sequence: 1,
          team_id: "team-local",
        },
      ],
    });

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
    await user.type(
      within(panel).getByLabelText("Task chat"),
      "Run the local implementation",
    );
    await user.click(
      await within(panel).findByRole("button", { name: "Create plan" }),
    );

    await waitFor(() => {
      expect(apiMocks.createExecutionPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: "device-1",
          message: "Run the local implementation",
          mode: "my_bridge",
          task_id: "task-build",
        }),
      );
    });
    expect(lastCreateExecutionPlanPayload()).not.toHaveProperty("binding_id");
    expect(apiMocks.postMessage).not.toHaveBeenCalledWith(
      "Run the local implementation",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(await within(panel).findByText("Running tests")).toBeInTheDocument();
    expect(
      await within(panel).findByText("Implemented locally."),
    ).toBeInTheDocument();
    expect(await within(panel).findByText("Pull request")).toHaveAttribute(
      "href",
      "https://github.com/LAF-labs/demo/pull/42",
    );
    expect(
      await within(panel).findByText("modified web/src/App.tsx"),
    ).toBeInTheDocument();
    expect(
      await within(panel).findByText("added api/index.js"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        executionEventMocks.subscribeExecutionPlanEvents,
      ).toHaveBeenCalledWith("plan-1", expect.any(Function));
    });
  });
});

describe("TasksApp task Bridge availability blockers", () => {
  beforeEach(mockProjectDirectory);

  it("does not run through LAF Bridge when the current user has not paired one", async () => {
    const user = userEvent.setup();
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["record_only"],
      default_mode: "record_only",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: false, reason: "no paired LAF Bridge detected" },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "Coworker MacBook",
          id: "other-device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-2",
        },
      ],
      my_bridge: {
        available: false,
        device_count: 0,
        online_device_count: 0,
        reason: "no paired LAF Bridge detected",
      },
    });

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
    await user.type(
      within(panel).getByLabelText("Task chat"),
      "Run this through the connected Bridge",
    );
    await user.click(
      await within(panel).findByRole("button", { name: "Send" }),
    );

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "Run this through the connected Bridge",
        "general",
        "thread-build",
        ["engineer"],
        expect.objectContaining({
          model_mode: "record_only",
          scope: "task_execution",
          task_id: "task-build",
        }),
      );
    });
    expect(apiMocks.createExecutionPlan).not.toHaveBeenCalled();
  });

  it("shows a friendly Bridge blocker when no supported local CLI is detected", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          github_repo_url: "https://github.com/LAF-labs/demo",
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
          id: "task-build",
          model_mode: "my_bridge",
          owner: "engineer",
          project_id: "customer-portal",
          status: "in_progress",
          thread_id: "thread-build",
          title: "Implement signup flow",
        },
      ],
    });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: false,
        device_count: 1,
        online_device_count: 1,
        reason: "no supported local CLI detected",
      },
    });

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
      await within(panel).findByText(
        "LAF Bridge has not detected Codex or Claude Code CLI.",
      ),
    ).toBeInTheDocument();
    await user.type(within(panel).getByLabelText("Task chat"), "Run locally");
    expect(
      await within(panel).findByRole("button", { name: "Create plan" }),
    ).toBeDisabled();
    expect(apiMocks.createExecutionPlan).not.toHaveBeenCalled();
  });
});

describe("TasksApp task Bridge permission and default execution", () => {
  beforeEach(mockProjectDirectory);

  it("shows a friendly Bridge blocker when execution permission is missing", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          github_repo_url: "https://github.com/LAF-labs/demo",
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
          id: "task-build",
          model_mode: "my_bridge",
          owner: "engineer",
          project_id: "customer-portal",
          status: "in_progress",
          thread_id: "thread-build",
          title: "Implement signup flow",
        },
      ],
    });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: false,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
        reason: "permission required: bridge:execute_own",
      },
    });

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
      await within(panel).findByText(
        "Your account cannot run LAF Bridge execution plans.",
      ),
    ).toBeInTheDocument();
    await user.type(within(panel).getByLabelText("Task chat"), "Run locally");
    expect(
      await within(panel).findByRole("button", { name: "Create plan" }),
    ).toBeDisabled();
    expect(apiMocks.createExecutionPlan).not.toHaveBeenCalled();
  });

  it("prefers LAF Bridge execution when one paired Bridge can run without a project binding", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          github_repo_url: "https://github.com/LAF-labs/demo",
          id: "customer-portal",
          lead_agent: "engineer",
          name: "Customer Portal",
        },
      ],
    });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: true },
      record_only: { available: true },
    });
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [
        {
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-local",
          user_id: "user-1",
        },
      ],
      my_bridge: {
        available: true,
        default_device_id: "device-1",
        device_count: 1,
        online_device_count: 1,
        runtimes: ["codex"],
      },
    });
    apiMocks.createExecutionPlan.mockResolvedValue({
      plan: { id: "plan-pair-only", status: "pending" },
      relay: { published: true },
    });

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
    await user.type(
      within(panel).getByLabelText("Task chat"),
      "Run after pairing only",
    );
    await user.click(
      await within(panel).findByRole("button", { name: "Create plan" }),
    );

    await waitFor(() => {
      expect(apiMocks.createExecutionPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: "device-1",
          message: "Run after pairing only",
          mode: "my_bridge",
          task_id: "task-build",
        }),
      );
    });
    expect(lastCreateExecutionPlanPayload()).not.toHaveProperty("binding_id");
  });
});

describe("TasksApp task detail interactions", () => {
  beforeEach(mockProjectDirectory);

  it("edits and clears task details from the side panel", async () => {
    const user = userEvent.setup();
    apiMocks.updateTask.mockResolvedValueOnce({
      task: {
        id: "task-build",
        channel: "general",
        created_by: "ceo",
        details: "Updated checkout handoff.",
        human_details: "Updated checkout handoff.",
        owner: "engineer",
        project_id: "customer-portal",
        status: "in_progress",
        thread_id: "thread-build",
        title: "Implement checkout flow",
      },
    });
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
    await user.click(within(panel).getByRole("button", { name: "Edit" }));
    await user.clear(within(panel).getByLabelText("Task title"));
    await user.type(
      within(panel).getByLabelText("Task title"),
      "Implement checkout flow",
    );
    await user.clear(within(panel).getByLabelText("Details"));
    await user.type(
      within(panel).getByLabelText("Details"),
      "Updated checkout handoff.",
    );
    await user.click(
      within(panel).getByRole("button", { name: "Save details" }),
    );

    await waitFor(() => {
      expect(apiMocks.updateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "general",
          clear_details: false,
          created_by: "human",
          details: "Updated checkout handoff.",
          human_details: "Updated checkout handoff.",
          id: "task-build",
          project_id: "customer-portal",
          title: "Implement checkout flow",
        }),
      );
    });
  });

  it("deletes task detail text without deleting the task", async () => {
    const user = userEvent.setup();
    apiMocks.updateTask.mockResolvedValueOnce({
      task: {
        id: "task-build",
        channel: "general",
        created_by: "ceo",
        details: "",
        human_details: "",
        owner: "engineer",
        project_id: "customer-portal",
        status: "in_progress",
        thread_id: "thread-build",
        title: "Implement signup flow",
      },
    });
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
    await user.click(
      within(panel).getByRole("button", { name: "Delete details" }),
    );

    await waitFor(() => {
      expect(apiMocks.updateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          clear_details: true,
          id: "task-build",
          title: "Implement signup flow",
        }),
      );
    });
  });
});

describe("TasksApp project creation", () => {
  beforeEach(mockProjectDirectory);

  it("creates a new project from the plus button", async () => {
    const user = userEvent.setup();
    apiMocks.createProject.mockResolvedValue({
      project: { id: "mobile-app", name: "Mobile App" },
    });

    renderTasksApp();

    await user.click(
      await screen.findByRole("button", { name: "New project" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "Create a new project",
    });
    await user.type(within(modal).getByLabelText("Project name"), "Mobile App");
    await user.type(within(modal).getByLabelText("Project code"), "mobi");
    await user.click(
      within(modal).getByRole("button", { name: "Create project" }),
    );

    await waitFor(() => {
      expect(apiMocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "MOBI",
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
    expect(screen.getAllByText(/시작/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Next task")).not.toBeInTheDocument();
  });
});
