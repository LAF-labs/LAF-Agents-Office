const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeWorkspaceConfigHandlers,
} = require("./workspaceConfigHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    rest: [],
    safeRest: [],
    seed: [],
    writes: [],
  };
  const deps = {
    calls,
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    createHTTPError,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    async readBody() {
      return {};
    },
    async requireUser() {
      return {
        membership,
        team: { id: "team-1", name: "Acme", slug: "acme" },
        user: { email: "founder@example.com" },
      };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    async safeStartupOfficeRest(table, options) {
      calls.safeRest.push({ options, table });
      return [];
    },
    async seedStartupOfficeWorkspace(...args) {
      calls.seed.push(args);
      return { loops: [], receipt: null };
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
      _res.status = status;
      _res.body = body;
    },
    ...overrides,
  };
  return deps;
}

test("config handler returns founder workspace settings as a hosted config snapshot", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        {
          company_profile: {
            description: "Builds transparent AI offices",
            name: "LAF Office",
            priority: "Close beta founders",
            size: "2",
          },
          llm_provider: "codex",
          preferences: {
            blueprint: "ai-startup-office",
            insights_poll_minutes: 15,
            max_concurrent_agents: 8,
          },
          team_lead_slug: "founder",
        },
      ];
    },
  });
  const handlers = createStartupOfficeWorkspaceConfigHandlers(deps);

  const res = {};
  await handlers.config({ method: "GET" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.company_name, "LAF Office");
  assert.equal(res.body.company_description, "Builds transparent AI offices");
  assert.equal(res.body.email, "founder@example.com");
  assert.equal(res.body.llm_provider, "codex");
  assert.equal(res.body.max_concurrent_agents, 8);
  assert.equal(deps.calls.rest[0].table, "workspace_settings");
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
});

test("config handler normalizes posted company profile and workspace preferences", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        agent_names: ["CEO", "Growth"],
        company_description: "Founder controlled office",
        company_name: "LAF Office",
        first_task: "Launch beta",
        llm_provider: "CODEX",
        max_concurrent_agents: "12",
        team_lead_slug: "operator",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "POST") return [options.body];
      return [{ company_profile: { name: "Old" }, preferences: {} }];
    },
  });
  const handlers = createStartupOfficeWorkspaceConfigHandlers(deps);

  const res = {};
  await handlers.config({ method: "POST" }, res);

  const upsert = deps.calls.rest.find((call) => call.options.method === "POST");
  assert.equal(upsert.table, "workspace_settings");
  assert.equal(upsert.options.prefer, "resolution=merge-duplicates,return=representation");
  assert.equal(upsert.options.body.company_profile.name, "LAF Office");
  assert.equal(upsert.options.body.company_profile.description, "Founder controlled office");
  assert.equal(upsert.options.body.preferences.first_task, "Launch beta");
  assert.deepEqual(upsert.options.body.preferences.agent_names, ["CEO", "Growth"]);
  assert.equal(upsert.options.body.llm_provider, "codex");
  assert.equal(upsert.options.body.team_lead_slug, "operator");
  assert.equal(res.body.config.company_name, "LAF Office");
  assert.equal(res.body.config.llm_provider, "codex");
  assert.equal(res.body.status, "ok");
});

test("onboarding state treats existing Startup Office data as onboarded fallback", async () => {
  const deps = baseDeps({
    async safeStartupOfficeRest(table, options) {
      deps.calls.safeRest.push({ options, table });
      return [{ id: "loop-1" }];
    },
  });
  const handlers = createStartupOfficeWorkspaceConfigHandlers(deps);

  const res = {};
  await handlers.onboardingState({ method: "GET" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.onboarded, true);
  assert.equal(res.body.onboarding_completed_at, null);
  assert.equal(deps.calls.safeRest[0].table, "startup_office_loops");
});

test("onboarding completion seeds the first Startup Office workspace once", async () => {
  const deps = baseDeps({
    async readBody() {
      return { company_name: "LAF Office", first_task: "Find paid beta users" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "POST") return [options.body];
      return [];
    },
    async seedStartupOfficeWorkspace(...args) {
      deps.calls.seed.push(args);
      return {
        loops: [{ id: "loop-1" }],
        receipt: { id: "receipt-1" },
      };
    },
  });
  const handlers = createStartupOfficeWorkspaceConfigHandlers(deps);

  const res = {};
  await handlers.onboardingComplete({ method: "POST" }, res);

  assert.equal(deps.calls.seed.length, 1);
  assert.equal(deps.calls.seed[0][0].team_id, "team-1");
  assert.equal(deps.calls.audits[0][1], "onboarding.completed");
  assert.deepEqual(deps.calls.audits[0][4], {
    loop_count: 1,
    receipt_id: "receipt-1",
  });
  assert.equal(res.body.onboarded, true);
  assert.deepEqual(res.body.loops, [{ id: "loop-1" }]);
  assert.deepEqual(res.body.receipt, { id: "receipt-1" });
});

test("approval policy keeps founder-control defaults and clamps support access", () => {
  const handlers = createStartupOfficeWorkspaceConfigHandlers(baseDeps());
  const policy = handlers.startupOfficeApprovalPolicy({
    preferences: {
      startup_office_approval_policy: {
        founder_approval_required: {
          outbound_messages: false,
        },
        require_citations_for_public_claims: false,
        support_access: {
          time_bound_hours: 999,
        },
      },
    },
  });

  assert.equal(policy.founder_approval_required.customer_promises, true);
  assert.equal(policy.founder_approval_required.outbound_messages, false);
  assert.equal(policy.require_citations_for_public_claims, false);
  assert.equal(policy.revision_enabled, true);
  assert.equal(policy.support_access.logged, true);
  assert.equal(policy.support_access.time_bound_hours, 168);
});
