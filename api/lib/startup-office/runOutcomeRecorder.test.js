const assert = require("node:assert/strict");
const test = require("node:test");

const {
  recordStartupOfficeRunOutcome,
  recordStartupOfficeUsageEvent,
  startupOfficeUsageEventBody,
} = require("./runOutcomeRecorder");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

test("usage event body attributes tokens, tools, duration, and cost to workspace", () => {
  const body = startupOfficeUsageEventBody({
    membership,
    objectValue,
    result: meteredResult(),
  });

  assert.equal(body.team_id, "team-1");
  assert.equal(body.created_by, "user-1");
  assert.equal(body.run_id, "run-1");
  assert.equal(body.idempotency_key, "run-1:model_run");
  assert.equal(body.provider, "openai");
  assert.equal(body.model, "gpt-5-mini");
  assert.equal(body.input_tokens, 100);
  assert.equal(body.output_tokens, 40);
  assert.equal(body.total_tokens, 140);
  assert.equal(body.cost_cents, 37);
  assert.equal(body.tool_calls, 3);
  assert.equal(body.worker_duration_ms, 120000);
  assert.deepEqual(body.metadata.tool_calls, {
    browser_research_sources: 1,
    explicit: 0,
    skill_invocations: 2,
    total: 3,
  });
});

test("run outcome recorder writes idempotent usage and notification events", async () => {
  const calls = [];
  await recordStartupOfficeRunOutcome({
    membership,
    objectValue,
    result: meteredResult(),
    async safeStartupOfficeRest(table, options) {
      calls.push({ options, table });
      return [{ id: `${table}-1`, ...options.body }];
    },
  });

  assert.equal(calls[0].table, "startup_office_usage_events");
  assert.equal(calls[0].options.prefer, "resolution=merge-duplicates,return=representation");
  assert.deepEqual(calls[0].options.query, { on_conflict: "team_id,idempotency_key" });
  assert.equal(calls[0].options.body.tool_calls, 3);
  assert.equal(calls[1].table, "startup_office_notifications");
  assert.equal(calls[1].options.body.event_type, "approval_waiting");
});

test("worker usage recorder can persist metering without notification side effects", async () => {
  const calls = [];
  await recordStartupOfficeUsageEvent({
    membership,
    objectValue,
    result: {
      run: {
        id: "run-failed",
        metadata: {
          cost: {
            estimated_cents: 0,
            input_tokens: 0,
            output_tokens: 0,
            pricing_source: "not_billed",
            total_tokens: 0,
          },
          skill_invocations: [{ skill_name: "quality-check" }],
        },
        status: "failed",
      },
      status: "failed",
    },
    async safeStartupOfficeRest(table, options) {
      calls.push({ options, table });
      return [{ id: "usage-1", ...options.body }];
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "startup_office_usage_events");
  assert.equal(calls[0].options.body.idempotency_key, "run-failed:model_run");
  assert.equal(calls[0].options.body.metadata.status, "failed");
  assert.equal(calls[0].options.body.tool_calls, 1);
});

function meteredResult() {
  return {
    artifact: {
      metadata: {
        browser_research: {
          source_count: 1,
        },
      },
    },
    run: {
      id: "run-1",
      metadata: {
        browser_research: {
          source_count: 1,
        },
        cost: {
          estimated_cents: 37,
          input_tokens: 100,
          model: "gpt-5-mini",
          output_tokens: 40,
          pricing_source: "usage_tokens_only",
          provider: "openai",
          total_tokens: 140,
        },
        skill_invocations: [
          { skill_name: "market-research" },
          { skill_name: "offer-package" },
        ],
        worker_job_id: "job-1",
      },
      started_at: "2026-05-26T00:00:00.000Z",
      status: "waiting_approval",
      updated_at: "2026-05-26T00:02:00.000Z",
    },
    status: "waiting_approval",
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
