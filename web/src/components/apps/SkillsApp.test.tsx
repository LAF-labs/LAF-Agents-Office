import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "../../api/client";
import type { NotebookCatalogSummary, ReviewItem } from "../../api/notebook";
import type {
  PlaybookSummary,
  PlaybookSynthesisStatus,
} from "../../api/playbook";
import { useAppStore } from "../../stores/app";
import { __test__, GrowthCenterApp, SkillsApp } from "./SkillsApp";

const apiMocks = vi.hoisted(() => ({
  approveStartupOfficeApproval: vi.fn(),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getSkills: vi.fn(),
  getStartupOfficeGrowthSummary: vi.fn(),
  getUsage: vi.fn(),
  invokeSkill: vi.fn(),
  rejectStartupOfficeApproval: vi.fn(),
  runStartupOfficeLoop: vi.fn(),
  updateSkill: vi.fn(),
}));
const notebookMocks = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
  fetchReviews: vi.fn(),
}));
const playbookMocks = vi.hoisted(() => ({
  fetchPlaybooks: vi.fn(),
  fetchSynthesisStatus: vi.fn(),
}));
const wikiMocks = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);
vi.mock("../../api/notebook", () => notebookMocks);
vi.mock("../../api/playbook", () => playbookMocks);
vi.mock("../../api/wiki", () => wikiMocks);
vi.mock("../ui/Toast", () => ({ showNotice: vi.fn() }));

function renderSkillsApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsApp />
    </QueryClientProvider>,
  );
}

function renderGrowthCenterApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GrowthCenterApp />
    </QueryClientProvider>,
  );
}

function mockSkillsList() {
  vi.clearAllMocks();
  useAppStore.setState({
    currentApp: "skills",
    language: "en",
    projectFocusId: null,
    wikiPath: null,
  });
  apiMocks.getSkills.mockResolvedValue({
    skills: [
      {
        description: "Collect blockers and next actions.",
        name: "daily-standup",
        status: "active",
        title: "Daily Standup",
        updated_at: "2026-05-12T00:00:00Z",
      },
    ],
  });
  apiMocks.getStartupOfficeGrowthSummary.mockResolvedValue({
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
        metadata: { loop_slug: "idea-validation" },
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
        objective: "Find the first paid beta buyer segment.",
        status: "waiting_approval",
        title: "Idea Validation",
      },
    ],
  });
  apiMocks.runStartupOfficeLoop.mockResolvedValue({});
  apiMocks.approveStartupOfficeApproval.mockResolvedValue({});
  apiMocks.rejectStartupOfficeApproval.mockResolvedValue({});
  apiMocks.getUsage.mockResolvedValue({});
  notebookMocks.fetchCatalog.mockResolvedValue({
    agents: [],
    pending_promotion: 0,
    total_agents: 0,
    total_entries: 0,
  });
  notebookMocks.fetchReviews.mockResolvedValue([]);
  playbookMocks.fetchPlaybooks.mockResolvedValue([]);
  playbookMocks.fetchSynthesisStatus.mockResolvedValue(null);
  wikiMocks.fetchCatalog.mockResolvedValue([]);
}

function playbook(
  slug: string,
  overrides: Partial<PlaybookSummary> = {},
): PlaybookSummary {
  return {
    slug,
    title: slug,
    source_path: `team/playbooks/${slug}.md`,
    skill_path: `team/playbooks/.compiled/${slug}/SKILL.md`,
    skill_exists: true,
    execution_log_path: `team/playbooks/${slug}.executions.jsonl`,
    execution_count: 0,
    runnable_by_agents: ["*"],
    ...overrides,
  };
}

function status(
  slug: string,
  overrides: Partial<PlaybookSynthesisStatus> = {},
): PlaybookSynthesisStatus {
  return {
    slug,
    source_path: `team/playbooks/${slug}.md`,
    execution_count: 0,
    last_synthesized_ts: "",
    last_synthesized_sha: "",
    executions_since_last_synthesis: 0,
    threshold: 3,
    ...overrides,
  };
}

describe("SkillsApp management UI", () => {
  beforeEach(mockSkillsList);

  it("keeps the skill list visible until the large manual-registration modal is opened", async () => {
    const user = userEvent.setup();
    renderSkillsApp();

    expect(
      await screen.findByRole("heading", { name: "Shared team skills" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily Standup")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Register a skill manually" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New skill" }));

    const modal = await screen.findByRole("dialog", {
      name: "Register a skill manually",
    });
    expect(
      within(modal).getByRole("heading", { name: "Required" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("heading", { name: "Recommended" }),
    ).toBeInTheDocument();
    expect(within(modal).getByLabelText("Skill name")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Instructions")).toBeInTheDocument();
    expect(screen.getByText("Daily Standup")).toBeInTheDocument();
  });

  it("submits a manually registered skill from the modal", async () => {
    const user = userEvent.setup();
    apiMocks.createSkill.mockResolvedValue({
      skill: { name: "handoff-check", status: "proposed" },
    });
    renderSkillsApp();

    await user.click(await screen.findByRole("button", { name: "New skill" }));
    const modal = await screen.findByRole("dialog", {
      name: "Register a skill manually",
    });
    await user.type(
      within(modal).getByLabelText("Skill name"),
      "handoff-check",
    );
    await user.type(
      within(modal).getByLabelText("Instructions"),
      "Check owner, due date, and next action before closing a handoff.",
    );
    await user.type(within(modal).getByLabelText("Title"), "Handoff Check");
    await user.type(
      within(modal).getByLabelText("Short summary"),
      "Review handoff readiness.",
    );
    await user.click(
      within(modal).getByRole("button", { name: "Submit for approval" }),
    );

    await waitFor(() => {
      expect(apiMocks.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "propose",
          content:
            "Check owner, due date, and next action before closing a handoff.",
          created_by: "human",
          description: "Review handoff readiness.",
          name: "handoff-check",
          title: "Handoff Check",
        }),
      );
    });
  });
});

describe("GrowthCenterApp startup office surface", () => {
  beforeEach(mockSkillsList);

  it("renders the sellable launch office panels without legacy local workflow language", async () => {
    const { container } = renderGrowthCenterApp();

    expect(
      await screen.findByRole("heading", { name: "Startup Office" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Company pulse" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Launch Office loops" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Approval Desk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Receipts and trace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("LAF Labs")).toBeInTheDocument();
    expect(screen.getByText("Validate paid beta demand")).toBeInTheDocument();
    expect(screen.getByText("Idea Validation")).toBeInTheDocument();
    expect(screen.getByText("Weekly Operator Review")).toBeInTheDocument();
    expect(
      screen.getAllByText("Approve Idea Validation draft").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Idea Validation run drafted and queued for founder approval.",
      ),
    ).toBeInTheDocument();

    expect(container.textContent).not.toContain("LAF Bridge");
    expect(container.textContent).not.toContain("Projects");
    expect(container.textContent).not.toContain("Tasks");
  });

  it("runs loops and decisions through the Startup Office API", async () => {
    const user = userEvent.setup();
    renderGrowthCenterApp();

    await screen.findByText("LAF Labs");
    await user.click(
      screen.getByRole("button", { name: "Run Idea Validation loop" }),
    );

    await waitFor(() =>
      expect(apiMocks.runStartupOfficeLoop).toHaveBeenCalledWith(
        "idea-validation",
        { objective: "Find the first paid beta buyer segment." },
      ),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Approve Idea Validation draft",
      }),
    );

    await waitFor(() =>
      expect(apiMocks.approveStartupOfficeApproval).toHaveBeenCalledWith(
        "approval-1",
        { note: "Approved from Startup Office." },
      ),
    );
  });
});

describe("Skills growth model", () => {
  it("builds dashboard metrics and growth inbox from existing APIs", () => {
    const skills: Skill[] = [
      { name: "active", status: "active", usage_count: 3 },
      {
        name: "proposal",
        title: "Proposal",
        status: "proposed",
        description: "Codify a repeated review.",
      },
    ];
    const playbooks = [
      playbook("compiled", { skill_exists: true, execution_count: 4 }),
      playbook("pending", { skill_exists: false, execution_count: 2 }),
    ];
    const statuses = new Map<string, PlaybookSynthesisStatus | null>([
      [
        "compiled",
        status("compiled", {
          execution_count: 4,
          last_synthesized_ts: "2026-05-12T01:00:00Z",
          executions_since_last_synthesis: 2,
        }),
      ],
    ]);
    const notebook: NotebookCatalogSummary = {
      agents: [],
      total_agents: 4,
      total_entries: 9,
      pending_promotion: 1,
    };
    const reviews = [
      {
        id: "r1",
        agent_slug: "ceo",
        entry_slug: "pricing",
        entry_title: "Pricing",
        proposed_wiki_path: "team/playbooks/pricing.md",
        excerpt: "",
        reviewer_slug: "reviewer",
        state: "pending",
        submitted_ts: "",
        updated_ts: "",
        comments: [],
      } as ReviewItem,
    ];

    const model = __test__.buildGrowthModel({
      skills,
      playbooks,
      statuses,
      wikiArticleCount: 11,
      notebook,
      reviews,
    });

    expect(model.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Shared skills", value: "2" }),
        expect.objectContaining({ label: "Proposed skills", value: "1" }),
        expect.objectContaining({ label: "Playbooks", value: "2" }),
        expect.objectContaining({ label: "Execution logs", value: "6" }),
        expect.objectContaining({ label: "Pending promotion", value: "1" }),
        expect.objectContaining({ label: "Learned updates", value: "1" }),
      ]),
    );
    expect(model.inbox.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Proposed skill: Proposal",
        "Review: Pricing",
        "Compile pending: pending",
        "Learning pending: compiled",
      ]),
    );
  });

  it("sorts playbooks by attention needed before mature rows", () => {
    const rows = __test__.sortPlaybookMaturityRows([
      {
        playbook: playbook("mature", {
          skill_exists: true,
          execution_count: 10,
        }),
        status: status("mature"),
      },
      {
        playbook: playbook("needs-learning", {
          skill_exists: true,
          execution_count: 3,
        }),
        status: status("needs-learning", {
          executions_since_last_synthesis: 2,
        }),
      },
      {
        playbook: playbook("needs-compile", {
          skill_exists: false,
          execution_count: 1,
        }),
        status: null,
      },
    ]);

    expect(rows.map((row) => row.playbook.slug)).toEqual([
      "needs-compile",
      "needs-learning",
      "mature",
    ]);
  });

  it("sorts skill list by updated date and formats local timestamps", () => {
    const sorted = __test__.sortSkillsByUpdated([
      {
        name: "older",
        updated_at: "2026-05-10T00:00:00Z",
      },
      {
        name: "newer",
        updated_at: "2026-05-12T00:00:00Z",
      },
    ]);

    expect(sorted.map((skill) => skill.name)).toEqual(["newer", "older"]);
    expect(__test__.formatDateTime("bad-date")).toBe("-");
    expect(__test__.formatDateTime("2026-05-12T00:00:00Z")).toMatch(
      /^2026\.05\.12 \d{2}:\d{2}$/,
    );
  });

  it("maps editable skill form data into the broker payload shape", () => {
    const form = __test__.skillToForm({
      name: "daily-standup",
      title: "Daily Standup",
      description: "Summarize blockers.",
      content: "1. Ask each owner for blockers.",
      trigger: "/daily-standup",
      tags: ["ops", "review"],
      required_permissions: ["workspace:read", "skill:invoke"],
      status: "proposed",
    });

    expect(form.action).toBe("propose");
    expect(form.tags).toBe("ops, review");
    expect(__test__.skillPayloadFromForm(form)).toEqual(
      expect.objectContaining({
        name: "daily-standup",
        title: "Daily Standup",
        tags: ["ops", "review"],
        required_permissions: ["workspace:read", "skill:invoke"],
        channel: "general",
      }),
    );
    expect(__test__.splitCommaList(" ops, , review ")).toEqual([
      "ops",
      "review",
    ]);
  });
});
