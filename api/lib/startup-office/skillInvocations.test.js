const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startupOfficeLoopSkillInvocations,
} = require("./skillInvocations");

test("loop skill invocations record selected skills, reasons, and inputs", () => {
  const invocations = startupOfficeLoopSkillInvocations({
    inputs: { market: "AI founders", nested: { signal: "urgent" } },
    loop: { objective: "Validate idea", slug: "idea-validation" },
    objective: "Validate the paid beta wedge",
    profile: { name: "LAF Labs", priority: "Find paid beta users" },
    truncateText: (value, max) => String(value || "").slice(0, max),
  });

  assert.deepEqual(invocations.map((item) => item.skill_name), [
    "market-research",
    "icp-definition",
    "assumption-mapping",
  ]);
  assert.equal(invocations[0].reason, "Ground the startup idea in falsifiable market evidence.");
  assert.deepEqual(invocations[0].input_keys, ["market", "nested"]);
  assert.equal(invocations[0].input_snapshot.company_name, "LAF Labs");
  assert.equal(invocations[0].input_snapshot.input_values.market, "AI founders");
  assert.equal(invocations[0].input_snapshot.objective, "Validate the paid beta wedge");
  assert.equal(invocations[0].selected_by, "startup_office_loop_manifest");
});
