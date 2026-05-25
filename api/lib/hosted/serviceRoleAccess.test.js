const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createServiceRoleAccessGuards,
} = require("./serviceRoleAccess");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("service-role guards allow only current schema tables and internal RPCs", () => {
  const guards = createServiceRoleAccessGuards({ createHTTPError });

  assert.equal(guards.assertAllowedRestTable("startup_office_runs"), "startup_office_runs");
  assert.equal(guards.assertAllowedRestTable("hosted_rate_limits"), "hosted_rate_limits");
  assert.equal(guards.assertAllowedRPC("claim_hosted_rate_limit"), "claim_hosted_rate_limit");
  assert.equal(
    guards.assertAllowedRPC("claim_startup_office_outbox_event"),
    "claim_startup_office_outbox_event",
  );
  assert.equal(
    guards.assertAllowedRPC("claim_startup_office_worker_job"),
    "claim_startup_office_worker_job",
  );
  assert.equal(
    guards.assertAllowedRPC("toggle_channel_message_reaction"),
    "toggle_channel_message_reaction",
  );

  assert.throws(
    () => guards.assertAllowedRestTable("auth.users"),
    /invalid service-role table/,
  );
  assert.throws(
    () => guards.assertAllowedRestTable("unregistered_table"),
    /service-role table is not registered/,
  );
  assert.throws(
    () => guards.assertAllowedRPC("unknown_function"),
    /service-role rpc is not registered/,
  );
});
