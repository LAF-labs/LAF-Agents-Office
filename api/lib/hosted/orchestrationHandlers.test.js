const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildOrchestrationIntent,
  createHostedOrchestrationHandlers,
} = require("./orchestrationHandlers");

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
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
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
    },
    randomID() {
      return "id-1";
    },
    async readBody() {
      return {};
    },
    requirePermission(_membership, permission) {
      calls.permissions.push(permission);
    },
    async requireUser() {
      return {
        membership: { team_id: "team-1", user_id: "user-1" },
      };
    },
    async rest(table, options = {}) {
      calls.rest.push({ options, table });
      return [];
    },
    async writeAuditEvent(membership, action, targetType, targetID, metadata = {}) {
      calls.audits.push({ action, membership, metadata, targetID, targetType });
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("orchestration intent builder routes normal chat without confirmation", () => {
  assert.deepEqual(
    buildOrchestrationIntent({
      nowISO: () => "2026-05-26T00:00:00.000Z",
      randomID: () => "intent-1",
    }),
    {
      created_at: "2026-05-26T00:00:00.000Z",
      id: "intent-1",
      proposed_actions: [],
      required_permissions: [],
      requires_confirmation: false,
      risk: "low",
      status: "routed",
      summary: "Route as normal home chat",
      type: "chat",
    },
  );
});

test("orchestration intent rejects empty messages", async () => {
  const deps = baseDeps();
  const handlers = createHostedOrchestrationHandlers(deps);

  await assert.rejects(
    () => handlers.orchestrationIntent({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "message is required",
  );
});

test("orchestration intent writes routed chat response without persistence", async () => {
  const deps = baseDeps({
    async readBody() {
      return { message: "Run customer discovery" };
    },
  });
  const handlers = createHostedOrchestrationHandlers(deps);

  await handlers.orchestrationIntent({ method: "POST" }, {});

  assert.deepEqual(deps.calls.rest, []);
  assert.equal(deps.calls.audits[0].action, "orchestration.intent");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.intent.status, "routed");
});

test("orchestration confirm requires an intent id and existing pending intent", async () => {
  const missingID = createHostedOrchestrationHandlers(baseDeps());
  await assert.rejects(
    () => missingID.orchestrationConfirm({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "intent_id is required",
  );

  const deps = baseDeps({
    async readBody() {
      return { intent_id: "intent-1" };
    },
  });
  const handlers = createHostedOrchestrationHandlers(deps);
  await assert.rejects(
    () => handlers.orchestrationConfirm({ method: "POST" }, {}),
    (err) => err.status === 404 && err.message === "orchestration intent not found",
  );
});

test("orchestration confirm checks permissions before unsupported actions fail closed", async () => {
  const deps = baseDeps({
    async readBody() {
      return { intent_id: "intent-1" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{
        id: "intent-1",
        proposed_actions: [{ method: "POST", path: "/unsupported" }],
        required_permissions: ["workspace:manage"],
        status: "pending",
        type: "chat",
      }];
    },
  });
  const handlers = createHostedOrchestrationHandlers(deps);

  await assert.rejects(
    () => handlers.orchestrationConfirm({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "unsupported orchestration action",
  );
  assert.deepEqual(deps.calls.permissions, ["workspace:manage"]);
});
