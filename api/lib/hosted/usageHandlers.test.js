const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedUsageHandlers,
} = require("./usageHandlers");

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
    async startupOfficeBetaOpsSnapshot(teamID) {
      calls.snapshotTeamID = teamID;
      return {
        billing: {
          billing_state: "active",
          monthly_model_spend_cents: 25000,
          monthly_run_limit: 80,
          plan: "beta",
        },
        limits: {
          monthly_model_spend_cents: 20000,
          monthly_run_limit: 50,
          storage_mb_limit: 1024,
        },
        usage: {
          model_spend_cents: 1234,
          model_spend_percent: 6,
          run_percent: 14,
          runs: 7,
          tool_calls: 22,
          total_tokens: 4567,
        },
      };
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("usage handler returns Startup Office usage and billing snapshot", async () => {
  const deps = baseDeps();
  const handlers = createHostedUsageHandlers(deps);

  await handlers.usage({ method: "GET" }, {});

  assert.equal(deps.calls.snapshotTeamID, "team-1");
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.writes[0], {
    status: 200,
    body: {
      total: {
        cost_usd: 12.34,
        tool_calls: 22,
        total_tokens: 4567,
      },
      session: {
        total_tokens: 4567,
      },
      personal_cli: {
        total_tokens: 4567,
      },
      laf_ai: {
        limit_percent: 6,
        percent: 6,
      },
      startup_office: {
        billing_state: "active",
        cost_usd: 12.34,
        model_spend_cents: 1234,
        monthly_model_spend_cents: 20000,
        monthly_run_limit: 50,
        plan: "beta",
        run_percent: 14,
        runs: 7,
        tool_calls: 22,
        total_tokens: 4567,
      },
    },
  });
});

test("usage handler falls back to zeroed trial snapshot when optional fields are missing", async () => {
  const deps = baseDeps({
    async startupOfficeBetaOpsSnapshot() {
      return {};
    },
  });
  const handlers = createHostedUsageHandlers(deps);

  await handlers.usage({ method: "GET" }, {});

  assert.equal(deps.calls.writes[0].body.total.cost_usd, 0);
  assert.equal(deps.calls.writes[0].body.total.total_tokens, 0);
  assert.equal(deps.calls.writes[0].body.laf_ai.percent, 0);
  assert.equal(deps.calls.writes[0].body.startup_office.billing_state, "trial");
  assert.equal(deps.calls.writes[0].body.startup_office.monthly_run_limit, 0);
});
