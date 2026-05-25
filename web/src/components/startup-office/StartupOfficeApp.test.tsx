import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { StartupOfficeApp } from "./StartupOfficeApp";

const startupOfficeMocks = vi.hoisted(() => ({
  approveStartupOfficeApproval: vi.fn(),
  getStartupOfficeGrowthSummary: vi.fn(),
  rejectStartupOfficeApproval: vi.fn(),
  reviseStartupOfficeApproval: vi.fn(),
  runStartupOfficeLoop: vi.fn(),
  updateStartupOfficeCompanyProfile: vi.fn(),
}));

vi.mock("../../api/startupOffice", () => startupOfficeMocks);
vi.mock("../ui/Toast", () => ({ showNotice: vi.fn() }));

function renderStartupOfficeApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StartupOfficeApp />
    </QueryClientProvider>,
  );
}

function mockStartupOfficeSummary() {
  vi.clearAllMocks();
  useAppStore.setState({
    currentApp: "growth",
    language: "en",
    projectFocusId: null,
    wikiPath: null,
  });
  startupOfficeMocks.getStartupOfficeGrowthSummary.mockResolvedValue({
    beta_ops: {
      billing: {
        billing_state: "active",
        monthly_model_spend_cents: 20000,
        monthly_run_limit: 50,
        plan: "founder_beta",
      },
      limits: {
        monthly_model_spend_cents: 20000,
        monthly_run_limit: 50,
        storage_mb_limit: 1024,
      },
      usage: {
        model_spend_cents: 0,
        model_spend_percent: 0,
        run_percent: 4,
        runs: 2,
        total_tokens: 3800,
      },
    },
    company_profile: {
      icp: "Solo founders selling B2B software",
      name: "LAF Labs",
      offer: "AI Startup Office in a box",
      positioning: "Founder-controlled AI operators",
      priority: "Validate paid beta demand",
      stage: "closed_beta",
    },
    loops: [
      {
        cadence: "manual",
        department: "Strategy",
        id: "idea-validation",
        name: "Idea Validation",
        objective: "Find the first paid beta buyer segment.",
        policy: { founder_approval_required: true },
        slug: "idea-validation",
        status: "active",
      },
      {
        cadence: "weekly",
        department: "Operations",
        id: "weekly-operator-review",
        name: "Weekly Operator Review",
        objective: "Summarize signals, decisions, receipts, and next loops.",
        policy: { founder_approval_required: true },
        slug: "weekly-operator-review",
        status: "active",
      },
    ],
    pending_approvals: [
      {
        action: "approve_loop_draft",
        details: "Founder control gate before publishing public claims.",
        id: "approval-1",
        metadata: {
          loop_slug: "idea-validation",
          memory_diff: {
            changed_pages: [
              { slug: "validation-log", title: "Validation Log" },
              { slug: "decisions", title: "Decisions" },
            ],
          },
        },
        requested_at: "2026-05-24T00:00:00Z",
        risk_level: "medium",
        run_id: "run-1",
        status: "pending",
        title: "Approve Idea Validation draft",
      },
    ],
    pulse: {
      active_loops: 2,
      pending_approvals: 1,
      recent_receipts: 1,
      recent_runs: 1,
    },
    memory_pages: [
      {
        id: "memory-1",
        slug: "validation-log",
        status: "approved",
        summary: "First paid-beta validation draft approved.",
        title: "Validation Log",
        updated_at: "2026-05-24T00:00:00Z",
      },
    ],
    operating_objects: {
      counts: {
        assets: 2,
        customers: 1,
        metrics: 1,
        signals: 3,
      },
    },
    recent_artifacts: [
      {
        content: "Validate and launch a paid beta with founder control.",
        created_at: "2026-05-24T00:00:00Z",
        id: "artifact-1",
        kind: "offer_package",
        metadata: {
          context: { memory_page_count: 1 },
          loop_slug: "offer-package",
          quality: { risk_level: "medium" },
          structured_output: {
            assumptions: [{ claim: "Founders want control" }],
            sources: [],
          },
        },
        run_id: "run-1",
        title: "Offer Package artifact",
      },
    ],
    recent_receipts: [
      {
        actor_slug: "ceo",
        created_at: "2026-05-24T00:00:00Z",
        event_type: "run.created",
        id: "receipt-1",
        run_id: "run-1",
        summary: "Idea Validation run drafted and queued for founder approval.",
        trace: { loop_slug: "idea-validation" },
      },
    ],
    recent_runs: [
      {
        created_at: "2026-05-24T00:00:00Z",
        id: "run-1",
        metadata: {
          cost: { total_tokens: 1900 },
          model: "fake-model",
          provider: "fake",
        },
        objective: "Find the first paid beta buyer segment.",
        status: "waiting_approval",
        summary: "Drafted buyer segment and founder approval request.",
        title: "Idea Validation",
      },
    ],
  });
  startupOfficeMocks.runStartupOfficeLoop.mockResolvedValue({
    artifact: null,
    run: {
      created_at: "2026-05-24T00:00:00Z",
      id: "run-2",
      metadata: {
        cost: { total_tokens: 1900 },
        model: "fake-model",
        provider: "fake",
      },
      objective: "Find the first paid beta buyer segment.",
      status: "waiting_approval",
      title: "Idea Validation",
    },
  });
  startupOfficeMocks.approveStartupOfficeApproval.mockResolvedValue({});
  startupOfficeMocks.rejectStartupOfficeApproval.mockResolvedValue({});
  startupOfficeMocks.reviseStartupOfficeApproval.mockResolvedValue({});
  startupOfficeMocks.updateStartupOfficeCompanyProfile.mockResolvedValue({
    profile: { name: "Updated Labs" },
  });
}

describe("StartupOfficeApp", () => {
  beforeEach(mockStartupOfficeSummary);

  it("renders the dedicated Startup Office surface without legacy local workflow language", async () => {
    const { container } = renderStartupOfficeApp();

    expect(
      await screen.findByRole("heading", { name: "Startup Office" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Company pulse" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Operating loops" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Approval Desk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Receipts and trace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Artifacts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Company memory" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Operating objects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Beta operations" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("LAF Labs")).toBeInTheDocument();
    expect(
      screen.getAllByText("Validate paid beta demand").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Idea Validation").length).toBeGreaterThan(0);
    expect(screen.getByText("Weekly Operator Review")).toBeInTheDocument();
    expect(screen.getByText("Offer Package artifact")).toBeInTheDocument();
    expect(
      screen.getByText("First paid-beta validation draft approved."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Memory update: Validation Log, Decisions"),
    ).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("2 / 50")).toBeInTheDocument();

    expect(container.textContent).not.toContain("Projects");
    expect(container.textContent).not.toContain("Tasks");
  });

  it("runs loops, approves decisions, opens run/artifact detail, and edits profile", async () => {
    const user = userEvent.setup();
    renderStartupOfficeApp();

    await screen.findByText("LAF Labs");
    await user.click(
      screen.getByRole("button", { name: "Run Idea Validation loop" }),
    );

    await waitFor(() =>
      expect(startupOfficeMocks.runStartupOfficeLoop).toHaveBeenCalledWith(
        "idea-validation",
        { objective: "Find the first paid beta buyer segment." },
      ),
    );
    expect(
      await screen.findByRole("dialog", { name: "Idea Validation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("fake / fake-model")).toBeInTheDocument();
    expect(screen.getByText("1,900 tokens")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close panel" }));

    await user.click(screen.getByRole("button", { name: "View artifact" }));
    expect(
      await screen.findByRole("dialog", { name: "Offer Package artifact" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Validate and launch a paid beta with founder control.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Why this output")).toBeInTheDocument();
    expect(
      screen.getByText("1 memory pages, 0 sources, 1 assumptions"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close panel" }));

    await user.click(screen.getByRole("button", { name: "View run" }));
    expect(
      await screen.findByRole("dialog", { name: "Idea Validation" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close panel" }));

    await user.click(
      screen.getByRole("button", {
        name: "Approve Idea Validation draft",
      }),
    );
    await waitFor(() =>
      expect(
        startupOfficeMocks.approveStartupOfficeApproval,
      ).toHaveBeenCalledWith("approval-1", {
        note: "Approved from Startup Office.",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Revise Idea Validation draft",
      }),
    );
    await waitFor(() =>
      expect(
        startupOfficeMocks.reviseStartupOfficeApproval,
      ).toHaveBeenCalledWith("approval-1", {
        revision_note: "Revision requested from Startup Office.",
      }),
    );

    await user.click(
      screen.getAllByRole("button", { name: "Edit profile" })[0],
    );
    const profileDialog = await screen.findByRole("dialog", {
      name: "Company profile",
    });
    const nameInput = within(profileDialog).getByLabelText("Company name");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Labs");
    await user.click(
      within(profileDialog).getByRole("button", { name: "Save profile" }),
    );

    await waitFor(() =>
      expect(
        startupOfficeMocks.updateStartupOfficeCompanyProfile,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated Labs",
          priority: "Validate paid beta demand",
        }),
      ),
    );
  });
});
