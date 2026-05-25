const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedRequestHandlers,
} = require("./requestHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    actions: [],
    permissions: [],
    writes: [],
  };
  return {
    calls,
    async approvalAction(...args) {
      calls.actions.push(args);
    },
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async startupOfficeApprovals(teamID, options) {
      calls.approvals = { options, teamID };
      return [
        {
          action: "publish_offer",
          details: "Approve the updated offer package.",
          id: "approval-1",
          requested_at: "2026-05-25T01:02:03.000Z",
          requested_by: null,
          risk_level: "high",
          status: "pending",
          title: "Offer Package",
        },
      ];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("requests handler maps Startup Office approvals to request cards", async () => {
  const deps = baseDeps();
  const handlers = createHostedRequestHandlers(deps);

  await handlers.requests({ method: "GET", query: { limit: "7" } }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.approvals, {
    options: { limit: 7, status: undefined },
    teamID: "team-1",
  });
  assert.equal(deps.calls.writes[0].status, 200);
  assert.deepEqual(deps.calls.writes[0].body.requests[0], {
    blocking: true,
    channel: "startup-office",
    context: "Approve the updated offer package.",
    created_at: "2026-05-25T01:02:03.000Z",
    from: "agent",
    id: "approval-1",
    kind: "approval",
    options: [
      {
        description: "Approve this Startup Office action and record the decision.",
        id: "approve",
        label: "Approve high-risk action",
      },
      {
        description: "Reject this action and close the pending run.",
        id: "reject",
        label: "Reject",
      },
      {
        description: "Ask the AI office to revise the draft before approval.",
        id: "revise",
        label: "Request revision",
        requires_text: true,
        text_hint: "What should change?",
      },
    ],
    question: "Approve the updated offer package.",
    recommended_id: "approve",
    required: true,
    status: "pending",
    timestamp: "2026-05-25T01:02:03.000Z",
    title: "Offer Package",
    updated_at: "2026-05-25T01:02:03.000Z",
  });
});

test("request answer delegates to the Startup Office approval action", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        choice_id: "revise",
        custom_text: "Tighten the ICP language.",
        id: "approval-1",
      };
    },
  });
  const handlers = createHostedRequestHandlers(deps);
  const req = { body: {}, headers: {}, method: "POST" };
  const res = {};

  await handlers.requestAnswer(req, res);

  assert.equal(deps.calls.actions.length, 1);
  assert.equal(deps.calls.actions[0][1], res);
  assert.equal(deps.calls.actions[0][2], "approval-1");
  assert.equal(deps.calls.actions[0][3], "revise");
  assert.deepEqual(deps.calls.actions[0][0].body, {
    note: "Tighten the ICP language.",
    reason: "Tighten the ICP language.",
    revision_note: "Tighten the ICP language.",
  });
});

test("request answer rejects malformed answers", async () => {
  const handlers = createHostedRequestHandlers(baseDeps({
    async readBody() {
      return { choice_id: "approve" };
    },
  }));

  await assert.rejects(
    () => handlers.requestAnswer({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "request id is required",
  );
});
