const assert = require("node:assert/strict");
const test = require("node:test");

const { runStartupOfficeLoop } = require("./loopEngine");
const { STARTUP_OFFICE_TOOL_POLICY_VERSION } = require("./toolPolicy");

test("startup office loop engine creates AI artifact, approval, receipt, and cost metadata", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: { market: "AI operations" },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "waiting_approval");
  assert.equal(result.run.status, "waiting_approval");
  assert.equal(result.run.metadata.cost.total_tokens, 30);
  assert.equal(result.run.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(result.artifact.metadata.skill_invocations[0].reason, "Validate market evidence.");
  assert.equal(result.approval.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(result.artifact.metadata.tool_policy.version, STARTUP_OFFICE_TOOL_POLICY_VERSION);
  assert.equal(result.artifact.metadata.tool_policy.allowed_tools.includes("browser_research"), true);
  assert.equal(result.run.metadata.tool_policy.loop_slug, "idea-validation");
  assert.equal(result.approval.risk_level, "high");
  assert.deepEqual(
    gateTypes(result.approval.metadata.approval_gates),
    ["customer_promise", "public_claim"],
  );
  assert.equal(result.approval.metadata.approval_required, true);
  assert.equal(result.artifact.metadata.approval_risk_level, "high");
  assert.deepEqual(
    gateTypes(result.run.metadata.approval_gates),
    ["customer_promise", "public_claim"],
  );
  assert.equal(result.artifact.title, "Idea Validation AI draft");
  assert.equal(result.artifact.idempotency_key, "run-1:job-1:artifact");
  assert.equal(result.approval.status, "pending");
  assert.equal(result.approval.idempotency_key, "run-1:job-1:approval");
  assert.equal(state.receipts.at(-1).event_type, "run.ai_draft_ready");
  assert.deepEqual(
    gateTypes(state.receipts.at(-1).trace.approval_gates),
    ["customer_promise", "public_claim"],
  );
  assert.deepEqual(
    gateTypes(state.jobPatches.at(-1).metadata.approval_gates),
    ["customer_promise", "public_claim"],
  );
  assert.equal(state.receipts.at(0).trace.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.receipts.at(-1).trace.tool_policy.disallowed_tools.includes("payment_capture"), true);
  assert.equal(state.jobPatches.at(-1).metadata.tool_policy.version, STARTUP_OFFICE_TOOL_POLICY_VERSION);
  assert.equal(state.receipts.at(-1).trace.skill_invocations[0].input_snapshot.objective, "Validate the first buyer segment");
  assert.deepEqual(
    state.runPatches.map((patch) => patch.status),
    ["running", "waiting_approval"],
  );
  assert.deepEqual(
    state.jobPatches.map((patch) => patch.status),
    ["running", "completed"],
  );
  assert.deepEqual(
    state.audits.map((audit) => audit.action),
    [
      "startup_office.run_started",
      "startup_office.receipt.created",
      "startup_office.artifact.created",
      "startup_office.approval.created",
      "startup_office.run_waiting_approval",
      "startup_office.receipt.created",
    ],
  );
  assert.equal(state.audits[2].target_id, result.artifact.id);
  assert.equal(state.audits[3].target_id, result.approval.id);
});

test("startup office loop engine records external-impact approval gates", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: { campaign: "launch the paid beta" },
    loop: launchCampaignLoop(),
    membership: membership(),
    modelClient: launchCampaignModelClient(),
    nowISO: fixedNow,
    objective: "Prepare a public launch campaign",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  const types = gateTypes(result.approval.metadata.approval_gates);
  assert.equal(result.status, "waiting_approval");
  assert.equal(result.approval.risk_level, "high");
  assert.equal(types.includes("publish"), true);
  assert.equal(types.includes("external_send"), true);
  assert.equal(types.includes("payment"), true);
  assert.equal(result.run.metadata.approval_required, true);
  assert.equal(result.run.metadata.approval_risk_level, "high");
  assert.equal(state.receipts.at(-1).trace.approval_risk_level, "high");
});

test("startup office loop engine completes draft-only policy runs without approvals", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    approvalPolicy: {
      action_modes: {
        customer_promise: "draft_only",
        external_send: "draft_only",
        legal_sensitive: "draft_only",
        payment: "draft_only",
        pricing_change: "draft_only",
        public_claim: "draft_only",
        publish: "draft_only",
      },
    },
    inputs: { campaign: "launch the paid beta" },
    loop: launchCampaignLoop(),
    membership: membership(),
    modelClient: launchCampaignModelClient(),
    nowISO: fixedNow,
    objective: "Prepare a public launch campaign",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.run.status, "completed");
  assert.equal(result.approval, null);
  assert.equal(state.approvals.length, 0);
  assert.equal(result.run.metadata.approval_required, false);
  assert.equal(result.run.metadata.approval_mode, "draft_only");
  assert.equal(result.artifact.metadata.approval_gates.every((gate) => gate.required === false), true);
  assert.equal(state.receipts.at(-1).trace.approval_required, false);
  assert.equal(state.jobPatches.at(-1).metadata.approval_required, false);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.approval.created"), false);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.run_completed"), true);
});

test("startup office loop engine records failed model calls as receipted run failures", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: failingModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.run.status, "failed");
  assert.equal(result.run.metadata.cost.pricing_source, "not_billed");
  assert.equal(result.run.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
  assert.equal(state.receipts.at(-1).trace.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.jobPatches.at(-1).status, "failed");
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.run_failed"), true);
  assert.equal(state.audits.at(-1).action, "startup_office.receipt.created");
});

test("startup office loop engine stops before side effects when a run is canceled during generation", async () => {
  const state = fakeRepositoryState();
  const statuses = ["queued", "running", "canceled"];
  const repository = {
    ...fakeRepository(state),
    findRun: async (_teamID, runID) => ({
      ...queuedRun(),
      completed_at: statuses[0] === "canceled" ? fixedNow() : null,
      id: runID,
      status: statuses.shift() || "canceled",
    }),
  };

  const result = await runStartupOfficeLoop({
    inputs: { market: "AI operations" },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository,
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "canceled");
  assert.equal(result.artifact, null);
  assert.equal(result.approval, null);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.receipts.at(-1).event_type, "run.started");
  assert.deepEqual(
    state.jobPatches.map((patch) => patch.status),
    ["running", "canceled"],
  );
  assert.equal(state.jobPatches.at(-1).metadata.cancellation_stage, "after_model");
  assert.equal(state.runPatches.at(-1).status, "running");
});

test("startup office loop engine rejects oversized model artifacts before database writes", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: oversizedArtifactModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /model artifact content exceeds/);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.artifact.created"), false);
});

test("startup office loop engine blocks externally informed drafts without citations", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {
      sources: [{ label: "Market report", url: "https://example.com/market-report" }],
    },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment from an attached report",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /externally informed outputs require source citations/);
  assert.equal(result.run.status, "failed");
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
});

test("startup office loop engine gathers browser research and records cited sources", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    browserResearchClient: {
      provider: "fetch",
      research: async ({ inputs }) => {
        assert.deepEqual(inputs.research_urls, ["https://example.com/report"]);
        return {
          enabled: true,
          findings: [
            {
              excerpt: "Founders want controlled AI startup offices.",
              fetched_at: fixedNow(),
              title: "Market Report",
              url: "https://example.com/report",
            },
          ],
          provider: "fetch",
          skipped: [],
          sources: [
            {
              fetched_at: fixedNow(),
              label: "Market Report",
              type: "browser_research",
              url: "https://example.com/report",
            },
          ],
        };
      },
    },
    inputs: {
      research_urls: ["https://example.com/report"],
    },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: citingModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment with web evidence",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "waiting_approval");
  assert.equal(result.artifact.metadata.browser_research.sources[0].url, "https://example.com/report");
  assert.equal(result.artifact.metadata.context.browser_research_source_count, 1);
  assert.equal(result.run.metadata.browser_research.source_count, 1);
  assert.match(result.artifact.content, /Market Report: https:\/\/example.com\/report/);
  assert.equal(state.receipts.at(-1).trace.browser_research.source_count, 1);
});

test("startup office loop engine skips browser research when tool policy disallows it", async () => {
  const state = fakeRepositoryState();
  let researchCalled = false;
  const result = await runStartupOfficeLoop({
    browserResearchClient: {
      provider: "fetch",
      research: async () => {
        researchCalled = true;
        throw new Error("browser research should not run for weekly review");
      },
    },
    inputs: {
      research_urls: ["https://example.com/weekly-report"],
    },
    loop: weeklyReviewLoop(),
    membership: membership(),
    modelClient: weeklyReviewModelClient(),
    nowISO: fixedNow,
    objective: "Review the company operating week",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(researchCalled, false);
  assert.equal(result.status, "waiting_approval");
  assert.equal(result.artifact.metadata.browser_research.provider, "policy_denied");
  assert.deepEqual(result.artifact.metadata.browser_research.skipped, [{
    reason: "tool policy disallows browser_research",
    url: "https://example.com/weekly-report",
  }]);
  assert.equal(result.artifact.metadata.tool_policy.allowed_tools.includes("browser_research"), false);
  assert.equal(state.receipts.at(-1).trace.browser_research.source_count, 0);
});

test("startup office loop engine includes revision requests in the model prompt", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: { market: "AI operations" },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: revisionAwareModelClient(),
    nowISO: fixedNow,
    objective: "Revise the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: {
      ...queuedRun(),
      metadata: {
        revision_request: {
          approval_id: "approval-1",
          note: "Tighten the ICP and remove the pricing claim.",
          requested_by: "user-1",
          source: "approval_revision",
        },
      },
    },
    truncateText,
    workerJob: {
      id: "job-1",
      metadata: {
        revision: true,
      },
    },
  });

  assert.equal(result.status, "waiting_approval");
  assert.match(result.artifact.metadata.structured_output.summary, /Revised/);
});

function fakeRepositoryState() {
  return {
    audits: [],
    approvals: [],
    artifacts: [],
    jobPatches: [],
    receipts: [],
    runPatches: [],
  };
}

function fakeRepository(state) {
  return {
    artifacts: async () => [],
    approvals: async () => [],
    createApproval: async (membershipValue, body) => {
      const approval = {
        id: `approval-${state.approvals.length + 1}`,
        requested_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.approvals.push(approval);
      return approval;
    },
    createAuditEvent: async (membershipValue, body) => {
      const audit = {
        id: `audit-${state.audits.length + 1}`,
        team_id: membershipValue.team_id,
        ...body,
      };
      state.audits.push(audit);
      return audit;
    },
    createArtifact: async (membershipValue, body) => {
      const artifact = {
        id: `artifact-${state.artifacts.length + 1}`,
        created_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.artifacts.push(artifact);
      return artifact;
    },
    createReceipt: async (membershipValue, body) => {
      const receipt = {
        id: `receipt-${state.receipts.length + 1}`,
        created_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.receipts.push(receipt);
      return receipt;
    },
    memoryPages: async () => [],
    receipts: async () => [],
    runs: async () => [],
    safeRest: async () => [],
    updateRun: async (teamID, runID, patch) => {
      state.runPatches.push(patch);
      return {
        ...queuedRun(),
        ...patch,
        id: runID,
        team_id: teamID,
      };
    },
    updateWorkerJob: async (teamID, jobID, patch) => {
      state.jobPatches.push(patch);
      return { id: jobID, team_id: teamID, ...patch };
    },
  };
}

function successfulModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => ({
      cost: {
        currency: "USD",
        estimated_usd: null,
        input_tokens: 10,
        model: "fake-model",
        output_tokens: 20,
        pricing_source: "usage_tokens_only",
        provider: "fake",
        total_tokens: 30,
      },
      data: {
        assumptions: [
          {
            claim: "Founders will pay for controlled validation.",
            confidence: "medium",
            evidence_needed: "Paid beta deposits.",
          },
        ],
        customer_segment: "Solo B2B founders",
        icp_hypothesis:
          "Solo B2B founders who need a paid-beta validation package before hiring operators.",
        next_evidence: [
          {
            experiment: "Five discovery interviews",
            owner_action: "Ask each founder for a paid beta commitment.",
            success_signal: "Two deposits or signed commitments.",
          },
        ],
        next_actions: ["Ask five founders for paid beta commitments."],
        risk_level: "medium",
        risks: ["The wedge may still be too broad."],
        sources: [],
        summary: "A paid-beta validation wedge is plausible.",
      },
    }),
  };
}

function citingModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async ({ input }) => {
      assert.match(input, /browser_research/);
      assert.match(input, /citation_sources/);
      const output = {
        assumptions: [
          {
            claim: "Founders want controlled AI startup offices.",
            confidence: "medium",
            evidence_needed: "Repeat the finding across three more calls.",
          },
        ],
        customer_segment: "Solo B2B founders",
        icp_hypothesis: "Solo B2B founders validating paid demand before hiring operators.",
        next_evidence: [
          {
            experiment: "Follow-up interviews",
            owner_action: "Ask for paid beta deposits.",
            success_signal: "Two deposits.",
          },
        ],
        next_actions: ["Ask five founders for a paid beta commitment."],
        risk_level: "medium",
        risks: ["One report is not enough evidence."],
        sources: [{ label: "Market Report", url: "https://example.com/report" }],
        summary: "Web evidence supports testing a founder-controlled paid beta.",
      };
      return {
        cost: {
          currency: "USD",
          estimated_usd: null,
          input_tokens: 10,
          model: "fake-model",
          output_tokens: 20,
          pricing_source: "usage_tokens_only",
          provider: "fake",
          total_tokens: 30,
        },
        data: output,
      };
    },
  };
}

function revisionAwareModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async ({ input }) => {
      assert.match(input, /Revision request/);
      assert.match(input, /Tighten the ICP and remove the pricing claim/);
      return successfulModelOutput({
        summary: "Revised paid-beta validation wedge is ready.",
      });
    },
  };
}

function successfulModelOutput(overrides = {}) {
  return {
    cost: {
      currency: "USD",
      estimated_usd: null,
      input_tokens: 10,
      model: "fake-model",
      output_tokens: 20,
      pricing_source: "usage_tokens_only",
      provider: "fake",
      total_tokens: 30,
    },
    data: {
      assumptions: [
        {
          claim: "Founders will pay for controlled validation.",
          confidence: "medium",
          evidence_needed: "Paid beta deposits.",
        },
      ],
      customer_segment: "Solo B2B founders",
      icp_hypothesis:
        "Solo B2B founders who need a paid-beta validation package before hiring operators.",
      next_evidence: [
        {
          experiment: "Five discovery interviews",
          owner_action: "Ask each founder for a paid beta commitment.",
          success_signal: "Two deposits or signed commitments.",
        },
      ],
      next_actions: ["Ask five founders for paid beta commitments."],
      risk_level: "medium",
      risks: ["The wedge may still be too broad."],
      sources: [],
      summary: "A paid-beta validation wedge is plausible.",
      ...overrides,
    },
  };
}

function launchCampaignModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => ({
      cost: {
        currency: "USD",
        estimated_usd: null,
        input_tokens: 10,
        model: "fake-model",
        output_tokens: 20,
        pricing_source: "usage_tokens_only",
        provider: "fake",
        total_tokens: 30,
      },
      data: {
        approval_gates: [
          "Founder approval before publishing the landing page.",
          "Founder approval before sending outreach email.",
          "Founder approval before paid spend.",
        ],
        assumptions: [
          {
            claim: "Founder-control messaging will earn replies.",
            confidence: "medium",
            evidence_needed: "Organic campaign replies.",
          },
        ],
        campaign_goal: "Book five qualified paid-beta calls.",
        channel_plan: [
          {
            angle: "Control and transparency over black-box autonomy.",
            audience: "Solo B2B founders",
            channel: "LinkedIn post",
            effort: "Low",
            success_metric: "Three qualified replies.",
          },
        ],
        copy_variants: [
          {
            body: "A controlled AI Startup Office drafts launch assets with approvals.",
            channel: "LinkedIn",
            cta: "Reply beta.",
            headline: "Launch with AI operators under founder control.",
          },
        ],
        experiments: [
          {
            hypothesis: "Founder-control messaging beats autonomy messaging.",
            metric: "Qualified reply rate",
            stop_condition: "Fewer than two replies after the first test.",
          },
        ],
        metrics_to_track: ["qualified_replies", "booked_calls"],
        next_actions: [
          "Approve the public post before publishing.",
          "Approve the outreach email before sending.",
          "Approve paid spend before buying ads.",
        ],
        risk_level: "medium",
        risks: ["Copy can overclaim unless reviewed."],
        sources: [],
        summary: "A public launch draft is ready for approval.",
      },
    }),
  };
}

function weeklyReviewModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async ({ input }) => {
      assert.match(input, /tool_policy/);
      assert.match(input, /weekly-operator-review/);
      return {
        cost: {
          currency: "USD",
          estimated_usd: null,
          input_tokens: 10,
          model: "fake-model",
          output_tokens: 20,
          pricing_source: "usage_tokens_only",
          provider: "fake",
          total_tokens: 30,
        },
        data: {
          assumptions: [{
            claim: "The weekly review needs current founder confirmation.",
            confidence: "medium",
            evidence_needed: "Founder confirms the next operating priority.",
          }],
          company_pulse: {
            concerns: ["No live metric movement was supplied."],
            status: "watch",
            wins: ["The team has a clearer approval workflow."],
          },
          decisions: [{
            decision: "Keep next week focused on first paid beta evidence.",
            needs_approval: true,
            rationale: "The workspace still needs external customer proof.",
          }],
          metrics_review: [{
            current: "No current metric supplied.",
            interpretation: "Treat activation as unknown until the founder updates metrics.",
            metric: "qualified founder calls",
            next_check: "Review after the next discovery loop.",
          }],
          next_actions: ["Ask the founder to approve the next discovery loop."],
          next_loops: [{
            loop_slug: "customer-discovery",
            objective: "Book three qualified beta discovery calls.",
            reason: "Customer proof is still the highest-leverage gap.",
          }],
          receipt_takeaways: ["Recent receipts show draft work, not executed external actions."],
          risk_level: "medium",
          risks: ["Operating priorities can drift without founder approval."],
          sources: [],
          summary: "Weekly operating review is ready for founder approval.",
        },
      };
    },
  };
}

function failingModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => {
      throw new Error("model unavailable");
    },
  };
}

function oversizedArtifactModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => successfulModelOutput({
      summary: "x".repeat(100 * 1024),
    }),
  };
}

function membership() {
  return {
    team_id: "team-1",
    user_id: "user-1",
  };
}

function ideaValidationLoop() {
  return {
    id: "loop-1",
    name: "Idea Validation",
    slug: "idea-validation",
  };
}

function launchCampaignLoop() {
  return {
    id: "loop-2",
    name: "Launch Campaign",
    slug: "launch-campaign",
  };
}

function weeklyReviewLoop() {
  return {
    id: "loop-3",
    name: "Weekly Operator Review",
    slug: "weekly-operator-review",
  };
}

function queuedRun() {
  return {
    id: "run-1",
    inputs: {},
    metadata: {},
    status: "queued",
    title: "Idea Validation",
  };
}

function skillInvocations() {
  return [{
    input_keys: ["market"],
    input_snapshot: { objective: "Validate the first buyer segment" },
    reason: "Validate market evidence.",
    selected_by: "startup_office_loop_manifest",
    sequence: 1,
    skill_name: "market-research",
  }];
}

function fixedNow() {
  return "2026-05-24T00:00:00.000Z";
}

function truncateText(value, max) {
  return String(value || "").slice(0, max);
}

function gateTypes(gates = []) {
  return gates.map((gate) => gate.type).sort();
}
