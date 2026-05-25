"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateStartupOfficeOpsSnapshot,
  printMonitorResult,
  queryPath,
  thresholdsFromEnv,
} = require("./startup-office-ops-monitor.cjs");

const now = "2026-05-25T12:00:00.000Z";

test("ops monitor passes when counts are within thresholds", () => {
  const result = evaluateStartupOfficeOpsSnapshot(
    {
      now,
      outbox_events: [
        { id: "failed-1", status: "failed", updated_at: "2026-05-25T11:59:00.000Z" },
      ],
      worker_jobs: [
        { id: "job-1", status: "queued", updated_at: "2026-05-25T11:59:00.000Z" },
      ],
    },
    {
      maxDeadLetterOutbox: 0,
      maxDeadLetterWorkerJobs: 0,
      maxFailedRuns: 25,
      maxFailedOutbox: 5,
      maxStalePendingApprovals: 25,
      maxStaleProcessingOutbox: 0,
      maxStuckWorkerJobs: 5,
      approvalStaleMs: 86400000,
      outboxStaleMs: 600000,
      workerJobStuckMs: 1800000,
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.counts.failed_outbox, 1);
});

test("ops monitor fails on dead letters, stale processing rows, and stuck jobs", () => {
  const result = evaluateStartupOfficeOpsSnapshot(
    {
      now,
      outbox_events: [
        { id: "dead-1", status: "dead_letter", updated_at: "2026-05-25T11:59:00.000Z" },
        { id: "processing-1", locked_at: "2026-05-25T11:00:00.000Z", status: "processing" },
      ],
      worker_jobs: [
        { id: "job-1", status: "running", locked_at: "2026-05-25T11:00:00.000Z" },
        { id: "job-2", status: "dead_letter", updated_at: "2026-05-25T11:59:00.000Z" },
      ],
    },
    {
      maxDeadLetterOutbox: 0,
      maxDeadLetterWorkerJobs: 0,
      maxFailedRuns: 0,
      maxFailedOutbox: 25,
      maxStalePendingApprovals: 0,
      maxStaleProcessingOutbox: 0,
      maxStuckWorkerJobs: 0,
      approvalStaleMs: 86400000,
      outboxStaleMs: 600000,
      workerJobStuckMs: 1800000,
    },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, {
    dead_letter_outbox: 1,
    dead_letter_worker_jobs: 1,
    failed_runs: 0,
    failed_outbox: 0,
    pending_approvals: 0,
    stale_pending_approvals: 0,
    stale_processing_outbox: 1,
    stuck_worker_jobs: 1,
  });
  assert(result.issues.some((issue) => issue.includes("dead-letter outbox")));
  assert(result.issues.some((issue) => issue.includes("dead-letter worker jobs")));
  assert(result.issues.some((issue) => issue.includes("stale processing outbox")));
  assert(result.issues.some((issue) => issue.includes("stuck worker jobs")));
});

test("ops monitor honors the failed outbox threshold", () => {
  const result = evaluateStartupOfficeOpsSnapshot(
    {
      now,
      outbox_events: [
        { id: "failed-1", status: "failed", updated_at: "2026-05-25T11:59:00.000Z" },
        { id: "failed-2", status: "failed", updated_at: "2026-05-25T11:59:00.000Z" },
      ],
      worker_jobs: [],
    },
    {
      maxDeadLetterOutbox: 0,
      maxDeadLetterWorkerJobs: 0,
      maxFailedRuns: 25,
      maxFailedOutbox: 1,
      maxStalePendingApprovals: 25,
      maxStaleProcessingOutbox: 0,
      maxStuckWorkerJobs: 0,
      approvalStaleMs: 86400000,
      outboxStaleMs: 600000,
      workerJobStuckMs: 1800000,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.counts.failed_outbox, 2);
  assert(result.issues.some((issue) => issue.includes("failed outbox rows 2 > 1")));
});

test("ops monitor exposes run latency, approval wait, failure, and model cost metrics", () => {
  const result = evaluateStartupOfficeOpsSnapshot(
    {
      now,
      approvals: [
        { id: "approval-1", requested_at: "2026-05-25T11:00:00.000Z", status: "pending" },
        { id: "approval-2", requested_at: "2026-05-25T11:58:00.000Z", status: "pending" },
      ],
      outbox_events: [],
      runs: [
        {
          completed_at: "2026-05-25T11:10:00.000Z",
          id: "run-1",
          started_at: "2026-05-25T11:00:00.000Z",
          status: "completed",
        },
        {
          completed_at: "2026-05-25T11:40:00.000Z",
          id: "run-2",
          started_at: "2026-05-25T11:10:00.000Z",
          status: "completed",
        },
        { id: "run-3", status: "failed", updated_at: "2026-05-25T11:59:00.000Z" },
      ],
      usage_events: [
        { cost_cents: 12, total_tokens: 1000, worker_duration_ms: 1200 },
        { cost_cents: 8, total_tokens: 500, worker_duration_ms: 800 },
      ],
      worker_jobs: [],
    },
    {
      maxDeadLetterOutbox: 0,
      maxDeadLetterWorkerJobs: 0,
      maxFailedRuns: 0,
      maxFailedOutbox: 25,
      maxStalePendingApprovals: 0,
      maxStaleProcessingOutbox: 0,
      maxStuckWorkerJobs: 0,
      approvalStaleMs: 1800000,
      outboxStaleMs: 600000,
      workerJobStuckMs: 1800000,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.counts.failed_runs, 1);
  assert.equal(result.counts.pending_approvals, 2);
  assert.equal(result.counts.stale_pending_approvals, 1);
  assert.equal(result.metrics.run_latency_ms_avg, 1200000);
  assert.equal(result.metrics.run_latency_ms_p95, 1800000);
  assert.equal(result.metrics.approval_wait_ms_avg, 1860000);
  assert.equal(result.metrics.approval_wait_ms_max, 3600000);
  assert.equal(result.metrics.total_tokens, 1500);
  assert.equal(result.metrics.model_cost_cents, 20);
  assert.equal(result.metrics.worker_duration_ms_avg, 1000);
  assert.equal(result.metrics.worker_duration_ms_max, 1200);
  assert(result.issues.some((issue) => issue.includes("failed runs 1 > 0")));
  assert(result.issues.some((issue) => issue.includes("stale pending approvals 1 > 0")));
});

test("ops monitor threshold env parsing is strict", () => {
  const thresholds = thresholdsFromEnv({
    LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX: "1",
    LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS: "5",
    LAF_MONITOR_MAX_FAILED_RUNS: "6",
    LAF_MONITOR_MAX_FAILED_OUTBOX: "2",
    LAF_MONITOR_MAX_STALE_PENDING_APPROVALS: "7",
    LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX: "3",
    LAF_MONITOR_MAX_STUCK_WORKER_JOBS: "4",
    LAF_MONITOR_APPROVAL_STALE_MS: "7000",
    LAF_MONITOR_OUTBOX_STALE_MS: "5000",
    LAF_MONITOR_WORKER_JOB_STUCK_MS: "6000",
  });

  assert.deepEqual(thresholds, {
    maxDeadLetterOutbox: 1,
    maxDeadLetterWorkerJobs: 5,
    maxFailedRuns: 6,
    maxFailedOutbox: 2,
    maxStalePendingApprovals: 7,
    maxStaleProcessingOutbox: 3,
    maxStuckWorkerJobs: 4,
    approvalStaleMs: 7000,
    outboxStaleMs: 5000,
    workerJobStuckMs: 6000,
  });
  assert.throws(
    () => thresholdsFromEnv({ LAF_MONITOR_MAX_FAILED_OUTBOX: "nope" }),
    /LAF_MONITOR_MAX_FAILED_OUTBOX must be an integer/,
  );
});

test("ops monitor query paths are PostgREST safe", () => {
  const path = queryPath("startup_office_outbox_events", {
    limit: "1000",
    select: "id,status",
    status: "in.(failed,dead_letter,processing)",
  });

  assert.equal(
    path,
    "/rest/v1/startup_office_outbox_events?limit=1000&select=id%2Cstatus&status=in.%28failed%2Cdead_letter%2Cprocessing%29",
  );
});

test("ops monitor text output redacts row details", () => {
  const text = printMonitorResult({
    counts: {
      dead_letter_outbox: 1,
      dead_letter_worker_jobs: 0,
      failed_outbox: 0,
      stale_processing_outbox: 0,
      stuck_worker_jobs: 0,
    },
    issues: ["dead-letter outbox rows 1 > 0"],
    ok: false,
  });

  assert.match(text, /FAIL Startup Office ops thresholds/);
  assert.match(text, /dead-letter outbox: 1/);
  assert.doesNotMatch(text, /last_error|provider|secret/i);
});
