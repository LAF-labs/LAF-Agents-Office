const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeOperationsStore,
  percent,
} = require("./operationsStore");
const { STARTUP_OFFICE_TERMS_PACKAGE } = require("./betaTerms");

test("operations snapshot composes billing, usage, terms, activation, and entitlements", async () => {
  const store = createStore({
    startup_office_activation_events: [
      { id: "act-1", milestone: "first_loop_run", source_id: "run-1" },
    ],
    startup_office_billing_documents: [
      { id: "doc-1", document_type: "agreement", reference_url: "https://deal.test", status: "signed" },
    ],
    startup_office_terms_acceptances: [
      { id: "terms-1", ...STARTUP_OFFICE_TERMS_PACKAGE },
    ],
    startup_office_usage_events: [
      { cost_cents: 100, event_type: "model_run", tool_calls: 2, total_tokens: 50 },
      { cost_cents: 50, event_type: "tool_call", tool_calls: 1, total_tokens: 10 },
    ],
    memberships: [{ id: "member-1" }, { id: "member-2" }],
    team_invites: [{ id: "invite-1" }],
    workspace_billing: [{
      billing_provider: "stripe",
      billing_state: "active",
      monthly_model_spend_cents: 1000,
      monthly_run_limit: 4,
      payment_status: "paid",
      plan: "founder",
      seat_limit: 5,
      storage_mb_limit: 10,
    }],
  });

  const snapshot = await store.startupOfficeBetaOpsSnapshot("team-1");

  assert.equal(snapshot.billing.billing_provider, "stripe");
  assert.equal(snapshot.billing.payment_status, "paid");
  assert.equal(snapshot.commercial.status, "paid_beta_ready");
  assert.equal(snapshot.entitlements.ai_runs, true);
  assert.equal(snapshot.terms.accepted, true);
  assert.equal(snapshot.usage.runs, 1);
  assert.equal(snapshot.usage.model_spend_cents, 150);
  assert.equal(snapshot.usage.model_spend_percent, 15);
  assert.equal(snapshot.usage.run_percent, 25);
  assert.equal(snapshot.usage.seat_percent, 60);
  assert.equal(snapshot.activation.completed_count, 1);
});

test("operations store upserts billing, billing documents, and terms acceptances", async () => {
  const writes = [];
  const store = createStore({}, {
    safeStartupOfficeRest: async (table, options = {}) => {
      writes.push([table, options]);
      if (table === "workspace_billing") return [{ ...options.body, id: "billing-1" }];
      if (table === "startup_office_billing_documents") return [{ ...options.body, id: "doc-1" }];
      return [];
    },
    shortID: () => "terms-fallback",
  });

  assert.deepEqual(await store.upsertStartupOfficeBilling("team-1", { plan: "paid" }), {
    id: "billing-1",
    plan: "paid",
    team_id: "team-1",
    updated_at: "2026-05-26T00:00:00.000Z",
  });
  assert.deepEqual(await store.upsertStartupOfficeBillingDocument(
    { team_id: "team-1", user_id: "user-1" },
    { document_type: "receipt", status: "paid" },
  ), {
    amount_cents: 0,
    created_at: null,
    currency: "USD",
    document_type: "receipt",
    external_reference: "",
    id: "doc-1",
    metadata: {},
    notes: "",
    period_end: null,
    period_start: null,
    plan: "",
    provider: "manual",
    reference_url: "",
    status: "paid",
    updated_at: null,
  });
  assert.equal(await store.upsertStartupOfficeBillingDocument({ team_id: "team-1" }, null), null);
  const acceptance = await store.upsertStartupOfficeTermsAcceptance(
    { team_id: "team-1" },
    { terms_version: "terms-v1" },
  );
  assert.equal(acceptance.id, "terms-fallback");
  assert.equal(acceptance.terms_version, "terms-v1");
  assert.equal(writes.length, 3);
});

test("usage, storage, and stuck job helpers query tenant-scoped operating tables", async () => {
  const calls = [];
  const tables = {
    startup_office_assets: [{ body: "asset" }],
    startup_office_usage_events: [{ cost_cents: 25, event_type: "model_run" }],
    memberships: [{ id: "member-1" }],
    team_invites: [],
  };
  const store = createStore(tables, {
    safeStartupOfficeRest: async (table, options = {}) => {
      calls.push([table, options.query]);
      return table === "startup_office_worker_jobs"
        ? [{ id: "job-1", status: "failed" }]
        : (tables[table] || []);
    },
  });

  const usage = await store.startupOfficeUsage("team-1");
  const stuckJobs = await store.startupOfficeStuckJobs("team-1");

  assert.equal(usage.runs, 1);
  assert.equal(usage.seats, 1);
  assert.equal(usage.pending_invites, 0);
  assert.ok(usage.storage_bytes > 0);
  assert.deepEqual(stuckJobs, [{ id: "job-1", status: "failed" }]);
  assert.ok(calls.some(([table]) => table === "startup_office_assets"));
  assert.deepEqual(calls.at(-1), [
    "startup_office_worker_jobs",
    {
      limit: "20",
      select: "*",
      status: "in.(queued,running,failed,dead_letter)",
      team_id: "eq.team-1",
    },
  ]);
});

test("percent handles empty limits and rounded percentages", () => {
  assert.equal(percent(25, 100), 25);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(100, 0), 0);
});

function createStore(tables = {}, overrides = {}) {
  return createStartupOfficeOperationsStore({
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    nowISO: () => "2026-05-26T00:00:00.000Z",
    safeStartupOfficeRest: async (table) => tables[table] || [],
    shortID: () => "short-id",
    ...overrides,
  });
}
