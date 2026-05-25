const assert = require("node:assert/strict");
const test = require("node:test");

const { startupOfficeReceiptReplay } = require("./provenanceReplay");

test("receipt replay reconstructs inputs, prompt, output, approval, cost, and memory diff", () => {
  const result = startupOfficeReceiptReplay(fixture());

  assert.equal(result.passed, true, result.issues.join("\n"));
  assert.equal(result.replay.receipt.id, "receipt-1");
  assert.equal(result.replay.run.id, "run-1");
  assert.deepEqual(result.replay.inputs.run_inputs, { market: "AI operations" });
  assert.equal(result.replay.inputs.skill_invocations[0].skill_name, "market-research");
  assert.equal(result.replay.prompt_version.version, "idea-validation.prompt.v1");
  assert.equal(result.replay.tool_policy.version, "startup-office-tool-policy.v1");
  assert.equal(result.replay.cost.total_tokens, 180);
  assert.equal(result.replay.artifact.structured_output.summary, "Validation plan ready.");
  assert.equal(result.replay.approval.id, "approval-1");
  assert.deepEqual(result.replay.approval.memory_diff.changed_pages, ["company-profile"]);
  assert.deepEqual(result.replay.memory_pages.map((page) => page.slug), ["learning-updates"]);
});

test("receipt replay fails closed when replay-critical records are missing", () => {
  const broken = startupOfficeReceiptReplay({
    receipt: {
      event_type: "run.ai_draft_ready",
      id: "receipt-1",
      run_id: "run-1",
      trace: {
        approval_required: true,
        cost: { model: "gpt-5-mini", provider: "openai", total_tokens: 180 },
      },
    },
    run: { id: "run-1", inputs: {}, metadata: {} },
  });

  assert.equal(broken.passed, false);
  assert.match(broken.issues.join("\n"), /artifact record/);
  assert.match(broken.issues.join("\n"), /structured output/);
  assert.match(broken.issues.join("\n"), /prompt version manifest/);
  assert.match(broken.issues.join("\n"), /tool policy snapshot/);
  assert.match(broken.issues.join("\n"), /run inputs or skill invocation/);
  assert.match(broken.issues.join("\n"), /memory diff/);
});

function fixture() {
  const promptVersion = {
    instructions_hash: "a".repeat(64),
    schema_hash: "b".repeat(64),
    schema_name: "idea_validation_output",
    version: "idea-validation.prompt.v1",
  };
  const toolPolicy = {
    allowed_tools: ["browser_research"],
    loop_slug: "idea-validation",
    version: "startup-office-tool-policy.v1",
  };
  const cost = {
    model: "gpt-5-mini",
    provider: "openai",
    total_tokens: 180,
  };
  return {
    approval: {
      id: "approval-1",
      metadata: {
        approval_gates: [{ type: "public_claim" }],
        memory_diff: { changed_pages: ["company-profile"] },
        prompt_version: promptVersion,
        tool_policy: toolPolicy,
      },
      risk_level: "high",
      status: "pending",
    },
    artifact: {
      id: "artifact-1",
      kind: "plan",
      metadata: {
        cost,
        prompt_version: promptVersion,
        structured_output: {
          next_actions: ["Review before sending."],
          risk_level: "medium",
          summary: "Validation plan ready.",
        },
        tool_policy: toolPolicy,
      },
      title: "Idea Validation AI draft",
    },
    memoryPages: [
      {
        id: "memory-1",
        provenance: {
          approval_id: "approval-1",
          receipt_id: "receipt-1",
          run_id: "run-1",
          source: "startup_office_receipt",
        },
        slug: "learning-updates",
        sources: [{ receipt_id: "receipt-1", run_id: "run-1" }],
        summary: "Latest learning.",
        title: "Learning Updates",
      },
      {
        id: "memory-2",
        provenance: { receipt_id: "other-receipt", run_id: "other-run" },
        slug: "unrelated",
      },
    ],
    receipt: {
      approval_id: "approval-1",
      event_type: "run.ai_draft_ready",
      id: "receipt-1",
      run_id: "run-1",
      summary: "Draft is ready.",
      trace: {
        approval_required: true,
        artifact_id: "artifact-1",
        cost,
        loop_slug: "idea-validation",
        prompt_version: promptVersion,
        skill_invocations: [
          {
            input_keys: ["market"],
            input_snapshot: {
              inputs: { market: "AI operations" },
              objective: "Validate the first buyer segment",
            },
            reason: "Validate market evidence.",
            skill_name: "market-research",
          },
        ],
        tool_policy: toolPolicy,
      },
    },
    run: {
      id: "run-1",
      inputs: { market: "AI operations" },
      metadata: { cost, prompt_version: promptVersion, tool_policy: toolPolicy },
      objective: "Validate the first buyer segment",
      status: "waiting_approval",
      summary: "Draft is ready.",
    },
  };
}
