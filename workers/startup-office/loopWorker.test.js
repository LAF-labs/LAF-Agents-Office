const assert = require("node:assert/strict");
const test = require("node:test");

const { createStartupOfficeLoopWorker, defaultRetryDelayMs } = require("./loopWorker");

test("loop worker idles when no job is claimable", async () => {
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => null,
    loadWorkerJobContext: async () => {
      throw new Error("should not load context");
    },
    runLoop: async () => {
      throw new Error("should not run loop");
    },
    updateWorkerJob: async () => {
      throw new Error("should not update job");
    },
  });

  assert.deepEqual(await worker.processOne(), { job: null, status: "idle" });
});

test("loop worker executes a claimed job with loaded context", async () => {
  const calls = [];
  const usageEvents = [];
  const job = claimedJob({ attempts: 1 });
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => job,
    loadWorkerJobContext: async (claimed) => ({
      inputs: { market: "founders" },
      loop: { slug: "idea-validation" },
      membership: { team_id: claimed.team_id, user_id: "user-1" },
      modelClient: { provider: "fake" },
      nowISO: fixedNow,
      objective: "Validate wedge",
      profile: { name: "LAF" },
      repository: {},
      run: { id: claimed.run_id, status: "queued" },
      truncateText,
    }),
    nowISO: fixedNow,
    recordUsageEvent: async (payload) => {
      usageEvents.push(payload);
    },
    runLoop: async (context) => {
      calls.push(context);
      return {
        run: {
          id: context.run.id,
          metadata: {
            cost: { total_tokens: 30 },
            skill_invocations: [{ skill_name: "market-research" }],
          },
          status: "waiting_approval",
        },
        status: "waiting_approval",
      };
    },
    updateWorkerJob: async () => {
      throw new Error("loop engine owns success job update");
    },
  });

  const result = await worker.processOne();
  assert.equal(result.status, "waiting_approval");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workerJob.id, job.id);
  assert.equal(calls[0].workerJob.attempts, 1);
  assert.equal(usageEvents.length, 1);
  assert.equal(usageEvents[0].context.membership.team_id, "team-1");
  assert.equal(usageEvents[0].result.run.id, "run-1");
});

test("loop worker schedules retry when a claimed job fails below max attempts", async () => {
  const updates = [];
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => claimedJob({ attempts: 1, max_attempts: 3 }),
    loadWorkerJobContext: async (job) => ({
      run: { id: job.run_id, status: "queued" },
    }),
    nowISO: fixedNow,
    retryDelayMs: () => 120000,
    runLoop: async () => ({ error: "model unavailable", status: "failed" }),
    updateWorkerJob: async (teamID, jobID, patch) => {
      updates.push({ jobID, patch, teamID });
    },
  });

  const result = await worker.processOne();
  assert.equal(result.status, "failed");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.status, "failed");
  assert.equal(updates[0].patch.locked_at, null);
  assert.equal(updates[0].patch.available_at, "2026-05-25T12:02:00.000Z");
});

test("loop worker dead-letters exhausted failed jobs", async () => {
  const updates = [];
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => claimedJob({ attempts: 2, max_attempts: 2 }),
    loadWorkerJobContext: async (job) => ({
      run: { id: job.run_id, status: "queued" },
    }),
    nowISO: fixedNow,
    runLoop: async () => {
      throw new Error("quality gate failed");
    },
    updateWorkerJob: async (teamID, jobID, patch) => {
      updates.push({ jobID, patch, teamID });
    },
  });

  const result = await worker.processOne();
  assert.equal(result.status, "dead_letter");
  assert.equal(updates[0].patch.status, "dead_letter");
  assert.equal(updates[0].patch.completed_at, fixedNow());
  assert.equal(updates[0].patch.last_error, "quality gate failed");
});

test("loop worker skips jobs whose run already reached a terminal state", async () => {
  const updates = [];
  const usageEvents = [];
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => claimedJob({ attempts: 1 }),
    loadWorkerJobContext: async (job) => ({
      membership: { team_id: job.team_id, user_id: "user-1" },
      run: {
        id: job.run_id,
        metadata: {
          cost: { total_tokens: 30 },
          skill_invocations: [{ skill_name: "market-research" }],
        },
        status: "waiting_approval",
      },
    }),
    nowISO: fixedNow,
    recordUsageEvent: async (payload) => {
      usageEvents.push(payload);
    },
    runLoop: async () => {
      throw new Error("should not run loop");
    },
    updateWorkerJob: async (teamID, jobID, patch) => {
      updates.push({ jobID, patch, teamID });
    },
  });

  const result = await worker.processOne();
  assert.equal(result.status, "skipped");
  assert.equal(usageEvents.length, 1);
  assert.equal(usageEvents[0].result.status, "completed");
  assert.equal(updates[0].patch.status, "completed");
  assert.equal(updates[0].patch.locked_at, null);
  assert.equal(updates[0].patch.metadata.skipped_run_status, "waiting_approval");
});

test("loop worker processes concurrent unique loop jobs without duplicate side effects", async () => {
  const jobs = Array.from({ length: 8 }, (_, index) =>
    claimedJob({
      id: `job-${index + 1}`,
      run_id: `run-${index + 1}`,
    }),
  );
  const seenJobs = [];
  const usageEvents = [];
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => jobs.shift() || null,
    loadWorkerJobContext: async (job) => ({
      membership: { team_id: job.team_id, user_id: "user-1" },
      run: { id: job.run_id, status: "queued" },
    }),
    nowISO: fixedNow,
    recordUsageEvent: async (payload) => {
      usageEvents.push(payload);
    },
    runLoop: async (context) => {
      seenJobs.push(context.workerJob.id);
      await Promise.resolve();
      return {
        run: {
          id: context.run.id,
          metadata: { cost: { total_tokens: 10 } },
          status: "waiting_approval",
        },
        status: "waiting_approval",
      };
    },
    updateWorkerJob: async () => {
      throw new Error("loop engine owns success job update");
    },
  });

  const results = await Promise.all(Array.from({ length: 8 }, () => worker.processOne()));
  assert.deepEqual(results.map((result) => result.status), Array(8).fill("waiting_approval"));
  assert.equal(new Set(seenJobs).size, 8);
  assert.equal(usageEvents.length, 8);
  assert.equal(new Set(usageEvents.map((event) => event.job.id)).size, 8);
});

test("loop worker batch load is capped and stops at idle", async () => {
  const jobs = Array.from({ length: 60 }, (_, index) =>
    claimedJob({
      id: `batch-job-${index + 1}`,
      run_id: `batch-run-${index + 1}`,
    }),
  );
  const processed = [];
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => jobs.shift() || null,
    loadWorkerJobContext: async (job) => ({
      run: { id: job.run_id, status: "queued" },
    }),
    nowISO: fixedNow,
    runLoop: async (context) => {
      processed.push(context.workerJob.id);
      return {
        run: { id: context.run.id, status: "waiting_approval" },
        status: "waiting_approval",
      };
    },
    updateWorkerJob: async () => {
      throw new Error("loop engine owns success job update");
    },
  });

  const capped = await worker.processBatch({ limit: 1000 });
  assert.equal(capped.processed, 50);
  assert.equal(capped.completed, 50);
  assert.equal(new Set(processed).size, 50);

  const remaining = await worker.processBatch({ limit: 50 });
  assert.equal(remaining.processed, 10);
  assert.equal(remaining.completed, 10);
});

test("loop worker retry backoff doubles with attempts", () => {
  assert.equal(defaultRetryDelayMs(1), 60000);
  assert.equal(defaultRetryDelayMs(2), 120000);
  assert.equal(defaultRetryDelayMs(6), 1920000);
});

function claimedJob(overrides = {}) {
  return {
    attempts: 1,
    id: "job-1",
    max_attempts: 2,
    metadata: {},
    run_id: "run-1",
    team_id: "team-1",
    ...overrides,
  };
}

function fixedNow() {
  return "2026-05-25T12:00:00.000Z";
}

function truncateText(value, max) {
  return String(value || "").slice(0, max);
}
