const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertStartupOfficeLoopRollout,
  startupOfficeLoopRolloutDecision,
  startupOfficeRolloutPolicy,
} = require("./loopRollout");

test("stable Startup Office loops are enabled by the default beta rollout", () => {
  const decision = startupOfficeLoopRolloutDecision({
    loop: { slug: "idea-validation" },
    settings: { preferences: {} },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "stable_default");
  assert.equal(decision.stage, startupOfficeRolloutPolicy.default_stage);
});

test("risky loops require an explicit workspace rollout flag", () => {
  const blocked = startupOfficeLoopRolloutDecision({
    loop: { slug: "launch-campaign" },
    settings: { preferences: {} },
  });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.source, "workspace_flag_required");
  assert.equal(blocked.flag, "startup_office_rollout.enabled_loops");
  assert.throws(
    () => assertStartupOfficeLoopRollout({
      createHTTPError(status, message) {
        const err = new Error(message);
        err.status = status;
        return err;
      },
      loop: { slug: "launch-campaign" },
      settings: { preferences: {} },
    }),
    (err) => err.status === 403 && /not enabled/.test(err.message),
  );
});

test("workspace rollout settings can enable a gated loop", () => {
  const decision = assertStartupOfficeLoopRollout({
    loop: { slug: "launch-campaign" },
    settings: {
      preferences: {
        startup_office_rollout: {
          enabled_loops: ["launch-campaign"],
        },
      },
    },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "workspace_flag");
  assert.equal(decision.stage, "operator_preview");
});
