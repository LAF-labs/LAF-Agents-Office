const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedModelAccess,
  normalizeModelMode,
} = require("./modelAccess");

const membership = Object.freeze({
  permissions: { allow: ["model:use_laf"] },
  team_id: "team-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    hasPermission(value, permission) {
      return (value.permissions?.allow || []).includes(permission);
    },
    managedModelEnabled() {
      return false;
    },
    async requireUser() {
      return { membership };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("normalizeModelMode preserves supported modes and falls back to record-only", () => {
  assert.equal(normalizeModelMode("laf_model"), "laf_model");
  assert.equal(normalizeModelMode("record_only"), "record_only");
  assert.equal(normalizeModelMode("claude"), "record_only");
});

test("model availability uses workspace billing and model permission", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ laf_model_enabled: true }];
    },
  });
  const access = createHostedModelAccess(deps);

  const availability = await access.modelAvailabilityForMembership(membership);

  assert.equal(deps.calls.rest[0].table, "workspace_billing");
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
  assert.equal(availability.default_mode, "laf_model");
  assert.deepEqual(availability.allowed_modes, ["laf_model", "record_only"]);
  assert.equal(availability.reason, "workspace billing loaded from DB");
});

test("model availability falls back to environment policy when billing is missing", async () => {
  const access = createHostedModelAccess(baseDeps({
    managedModelEnabled() {
      return true;
    },
  }));

  const availability = await access.modelAvailabilityForMembership({
    permissions: {},
    team_id: "team-1",
  });

  assert.equal(availability.default_mode, "record_only");
  assert.deepEqual(availability.allowed_modes, ["record_only"]);
  assert.equal(availability.laf_model.reason, "permission required: model:use_laf");
  assert.equal(availability.reason, "workspace billing uses environment fallback");
});

test("resolveAllowedModelMode blocks unavailable managed model execution", async () => {
  const access = createHostedModelAccess(baseDeps());

  assert.equal(await access.resolveAllowedModelMode(membership, "record_only"), "record_only");
  await assert.rejects(
    () => access.resolveAllowedModelMode(membership, "laf_model"),
    (err) =>
      err.status === 403 &&
      err.message === "workspace is not on a paid managed-model plan",
  );
});

test("model availability handler writes the current availability", async () => {
  const deps = baseDeps({
    managedModelEnabled() {
      return true;
    },
  });
  const access = createHostedModelAccess(deps);

  await access.availability({ method: "GET" }, {});

  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.default_mode, "laf_model");
});
