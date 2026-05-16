import { describe, expect, it } from "vitest";

import type { Skill } from "../../api/client";
import type { NotebookCatalogSummary, ReviewItem } from "../../api/notebook";
import type {
  PlaybookSummary,
  PlaybookSynthesisStatus,
} from "../../api/playbook";
import { __test__ } from "./SkillsApp";

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
