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
    runLoop: async (context) => {
      calls.push(context);
      return { status: "waiting_approval" };
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
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob: async () => claimedJob({ attempts: 1 }),
    loadWorkerJobContext: async (job) => ({
      run: { id: job.run_id, status: "waiting_approval" },
    }),
    nowISO: fixedNow,
    runLoop: async () => {
      throw new Error("should not run loop");
    },
    updateWorkerJob: async (teamID, jobID, patch) => {
      updates.push({ jobID, patch, teamID });
    },
  });

  const result = await worker.processOne();
  assert.equal(result.status, "skipped");
  assert.equal(updates[0].patch.status, "completed");
  assert.equal(updates[0].patch.locked_at, null);
  assert.equal(updates[0].patch.metadata.skipped_run_status, "waiting_approval");
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
