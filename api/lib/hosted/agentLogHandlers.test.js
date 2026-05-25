const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedAgentLogHandlers,
} = require("./agentLogHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    permissions: [],
    writes: [],
  };
  return {
    calls,
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async startupOfficeReceipts(teamID, options) {
      calls.receipts = { options, teamID };
      return [
        {
          actor_slug: "agent",
          created_at: "2026-05-25T01:02:03.000Z",
          event_type: "run.ai_draft_ready",
          id: "receipt-1",
          run_id: "run-1",
          summary: "Idea Validation AI draft is ready.",
          trace: {
            cost: {
              estimated_usd: 0.34,
              input_tokens: 1200,
              output_tokens: 700,
              total_tokens: 1900,
            },
          },
        },
      ];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("agent logs handler maps Startup Office receipts to legacy log contract", async () => {
  const deps = baseDeps();
  const handlers = createHostedAgentLogHandlers(deps);

  await handlers.agentLogs({ method: "GET", query: { limit: "7" } }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.receipts, {
    options: { limit: 7, run_id: "" },
    teamID: "team-1",
  });
  assert.deepEqual(deps.calls.writes[0], {
    status: 200,
    body: {
      logs: [
        {
          action: "run.ai_draft_ready",
          agent: "agent",
          content: "Idea Validation AI draft is ready.",
          id: "receipt-1",
          task: "run-1",
          timestamp: "2026-05-25T01:02:03.000Z",
          usage: {
            cost_usd: 0.34,
            input_tokens: 1200,
            output_tokens: 700,
            total_tokens: 1900,
          },
        },
      ],
    },
  });
});

test("agent logs handler treats task query as a Startup Office run id", async () => {
  const deps = baseDeps();
  const handlers = createHostedAgentLogHandlers(deps);

  await handlers.agentLogs({ method: "GET", query: { task: "run-9" } }, {});

  assert.equal(deps.calls.receipts.options.run_id, "run-9");
  assert.equal(deps.calls.receipts.options.limit, 100);
});
