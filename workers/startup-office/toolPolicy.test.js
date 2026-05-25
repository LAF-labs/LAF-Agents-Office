const assert = require("node:assert/strict");
const test = require("node:test");

const { STARTUP_OFFICE_APPROVAL_ACTIONS } = require("../../api/lib/startup-office/approvalPolicy");
const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("./loopTemplates");
const {
  BLOCKED_EXECUTION_TOOLS,
  LOOP_TOOL_POLICY_MANIFEST,
  STARTUP_OFFICE_TOOL_POLICY_VERSION,
  startupOfficeLoopToolPolicy,
  startupOfficeToolPolicyAllows,
} = require("./toolPolicy");

test("every startup office loop has a tool permission manifest", () => {
  const templateSlugs = Object.keys(STARTUP_OFFICE_LOOP_TEMPLATES).sort();
  const manifestSlugs = Object.keys(LOOP_TOOL_POLICY_MANIFEST).sort();

  assert.deepEqual(manifestSlugs, templateSlugs);
  for (const slug of templateSlugs) {
    const policy = startupOfficeLoopToolPolicy({ loop: { slug } });
    assert.equal(policy.version, STARTUP_OFFICE_TOOL_POLICY_VERSION);
    assert.equal(policy.loop_slug, slug);
    assert.equal(policy.allowed_tools.includes("artifact_writer"), true);
    assert.equal(policy.allowed_tools.includes("approval_request"), true);
    assert.equal(policy.allowed_tools.includes("receipt_writer"), true);
    assert.equal(policy.disallowed_tools.includes("payment_capture"), true);
    assert.equal(policy.disallowed_tools.includes("public_publisher"), true);
  }
});

test("external actions are never auto-executable even when a workspace uses draft-only mode", () => {
  const actionModes = Object.fromEntries(
    STARTUP_OFFICE_APPROVAL_ACTIONS.map((action) => [action.type, "draft_only"]),
  );
  const policy = startupOfficeLoopToolPolicy({
    approvalPolicy: { action_modes: actionModes },
    loop: { slug: "launch-campaign" },
  });

  for (const action of STARTUP_OFFICE_APPROVAL_ACTIONS) {
    assert.equal(policy.external_actions[action.type].execution, "never_auto_execute");
    assert.equal(policy.external_actions[action.type].mode, "draft_only");
  }
});

test("weekly operator review cannot perform browser research", () => {
  const policy = startupOfficeLoopToolPolicy({ loop: { slug: "weekly-operator-review" } });

  assert.equal(startupOfficeToolPolicyAllows(policy, "browser_research"), false);
  assert.equal(policy.allowed_tools.includes("browser_research"), false);
});

test("market and growth loops can use browser research without external execution tools", () => {
  for (const slug of [
    "customer-discovery",
    "idea-validation",
    "launch-campaign",
    "offer-package",
  ]) {
    const policy = startupOfficeLoopToolPolicy({ loop: { slug } });
    assert.equal(startupOfficeToolPolicyAllows(policy, "browser_research"), true);
    for (const blockedTool of BLOCKED_EXECUTION_TOOLS) {
      assert.equal(startupOfficeToolPolicyAllows(policy, blockedTool), false);
    }
  }
});
