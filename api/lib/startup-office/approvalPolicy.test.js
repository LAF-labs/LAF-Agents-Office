const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mergeStartupOfficeApprovalPolicyPatch,
  startupOfficeApprovalDecision,
  startupOfficeApprovalPolicy,
} = require("./approvalPolicy");

test("approval policy normalizes canonical and legacy action controls", () => {
  const policy = startupOfficeApprovalPolicy({
    preferences: {
      startup_office_approval_policy: {
        action_modes: {
          publish: "draft_only",
        },
        founder_approval_required: {
          outbound_messages: false,
          pricing_change: true,
        },
        support_access: {
          time_bound_hours: 999,
          visible_to_owner: "false",
        },
      },
    },
  });

  assert.equal(policy.action_modes.external_send, "draft_only");
  assert.equal(policy.action_modes.publish, "draft_only");
  assert.equal(policy.action_modes.pricing_change, "approval_required");
  assert.equal(policy.founder_approval_required.outbound_messages, false);
  assert.equal(policy.founder_approval_required.external_send, false);
  assert.equal(policy.auto_draft_only.publish, true);
  assert.equal(policy.support_access.time_bound_hours, 168);
  assert.equal(policy.support_access.visible_to_owner, false);
});

test("approval decision converts draft-only gates without weakening required gates", () => {
  const decision = startupOfficeApprovalDecision(
    {
      action_modes: {
        external_send: "draft_only",
        payment: "approval_required",
      },
    },
    [
      { required: true, type: "external_send" },
      { required: true, type: "payment" },
    ],
  );

  assert.equal(decision.approval_required, true);
  assert.equal(decision.approval_mode, "approval_required");
  assert.equal(decision.approval_gates[0].mode, "draft_only");
  assert.equal(decision.approval_gates[0].required, false);
  assert.equal(decision.approval_gates[1].required, true);
});

test("approval decision marks all-policy draft outputs as draft-only", () => {
  const decision = startupOfficeApprovalDecision(
    {
      auto_draft_only: {
        external_send: true,
        publish: true,
      },
    },
    [
      { required: true, type: "external_send" },
      { required: true, type: "publish" },
    ],
  );

  assert.equal(decision.approval_required, false);
  assert.equal(decision.approval_mode, "draft_only");
  assert.deepEqual(
    decision.approval_gates.map((gate) => gate.required),
    [false, false],
  );
});

test("approval policy patch merge preserves unrelated existing action modes", () => {
  const merged = mergeStartupOfficeApprovalPolicyPatch(
    {
      action_modes: {
        external_send: "draft_only",
        payment: "approval_required",
      },
      support_access: {
        time_bound_hours: 12,
      },
    },
    {
      action_modes: {
        publish: "draft_only",
      },
      support_access: {
        visible_to_owner: false,
      },
    },
  );

  assert.deepEqual(merged.action_modes, {
    external_send: "draft_only",
    payment: "approval_required",
    publish: "draft_only",
  });
  assert.deepEqual(merged.support_access, {
    time_bound_hours: 12,
    visible_to_owner: false,
  });
});
