const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REQUIRED_EXTERNAL_APPROVAL_GATE_TYPES,
  approvalGateDefinition,
  approvalGatesFor,
  approvalRiskLevel,
  inferApprovalGateTypes,
  normalizeApprovalGate,
} = require("./approvalGates");
const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("./loopTemplates");

test("approval gate definitions cover required external action classes", () => {
  for (const type of REQUIRED_EXTERNAL_APPROVAL_GATE_TYPES) {
    const definition = approvalGateDefinition(type);
    assert.equal(definition?.category, "external_impact", type);
    const gate = normalizeApprovalGate(type);
    assert.equal(gate.required, true, type);
    assert.equal(gate.type, type, type);
  }
});

test("every Startup Office loop declares machine-readable approval gates", () => {
  const allGateTypes = new Set();
  for (const [slug, template] of Object.entries(STARTUP_OFFICE_LOOP_TEMPLATES)) {
    const gates = approvalGatesFor({ template });
    assert.ok(gates.length > 0, `${slug} must declare approval gates`);
    for (const gate of gates) {
      assert.equal(gate.required, true, `${slug}:${gate.type}`);
      assert.ok(gate.label, `${slug}:${gate.type} needs a label`);
      assert.ok(gate.reason, `${slug}:${gate.type} needs a reason`);
      allGateTypes.add(gate.type);
    }
  }
  for (const type of REQUIRED_EXTERNAL_APPROVAL_GATE_TYPES) {
    assert.equal(allGateTypes.has(type), true, `missing required gate ${type}`);
  }
});

test("launch campaign gates always include publish, send, and payment control", () => {
  const gates = approvalGatesFor({
    template: STARTUP_OFFICE_LOOP_TEMPLATES["launch-campaign"],
  });
  const types = gates.map((gate) => gate.type).sort();
  assert.deepEqual(
    types.filter((type) => ["external_send", "payment", "publish"].includes(type)),
    ["external_send", "payment", "publish"],
  );
});

test("approval gates infer risky external actions from draft content", () => {
  const inferred = inferApprovalGateTypes([
    "Publish the landing page.",
    "Send the outreach email.",
    "Charge the beta deposit.",
    "Update refund terms and privacy copy.",
  ].join(" "));
  assert.deepEqual(
    inferred.filter((type) =>
      ["external_send", "legal_sensitive", "payment", "publish"].includes(type),
    ).sort(),
    ["external_send", "legal_sensitive", "payment", "publish"],
  );

  const gates = approvalGatesFor({
    output: {
      next_actions: [
        "Founder approval before publishing, sending email, charging a deposit, or changing refund terms.",
      ],
    },
  });
  assert.equal(gates.some((gate) => gate.type === "legal_sensitive"), true);
});

test("approval risk escalates when an external-impact gate is present", () => {
  assert.equal(approvalRiskLevel("medium", []), "medium");
  assert.equal(
    approvalRiskLevel("low", [normalizeApprovalGate("external_send")]),
    "high",
  );
});
