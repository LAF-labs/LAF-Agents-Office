#!/usr/bin/env node
"use strict";

function thresholdsFromEnv(env = process.env) {
  return {
    maxDeadLetterOutbox: intEnv(env, "LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX", 0, 0, 10000),
    maxFailedRuns: intEnv(env, "LAF_MONITOR_MAX_FAILED_RUNS", 25, 0, 10000),
    maxFailedOutbox: intEnv(env, "LAF_MONITOR_MAX_FAILED_OUTBOX", 25, 0, 10000),
    maxDeadLetterWorkerJobs: intEnv(env, "LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS", 0, 0, 10000),
    maxStalePendingApprovals: intEnv(env, "LAF_MONITOR_MAX_STALE_PENDING_APPROVALS", 25, 0, 10000),
    maxStaleProcessingOutbox: intEnv(env, "LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX", 0, 0, 10000),
    maxStuckWorkerJobs: intEnv(env, "LAF_MONITOR_MAX_STUCK_WORKER_JOBS", 0, 0, 10000),
    approvalStaleMs: intEnv(env, "LAF_MONITOR_APPROVAL_STALE_MS", 86400000, 1000, 604800000),
    outboxStaleMs: intEnv(env, "LAF_MONITOR_OUTBOX_STALE_MS", 600000, 1000, 86400000),
    workerJobStuckMs: intEnv(env, "LAF_MONITOR_WORKER_JOB_STUCK_MS", 1800000, 1000, 86400000),
  };
}

function evaluateStartupOfficeOpsSnapshot(snapshot, thresholds = thresholdsFromEnv()) {
  const nowMs = Date.parse(snapshot.now || new Date().toISOString());
  const outboxEvents = Array.isArray(snapshot.outbox_events) ? snapshot.outbox_events : [];
  const workerJobs = Array.isArray(snapshot.worker_jobs) ? snapshot.worker_jobs : [];
  const runs = Array.isArray(snapshot.runs) ? snapshot.runs : [];
  const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
  const usageEvents = Array.isArray(snapshot.usage_events) ? snapshot.usage_events : [];
  const deadLetterOutbox = outboxEvents.filter((row) => row.status === "dead_letter");
  const failedOutbox = outboxEvents.filter((row) => row.status === "failed");
  const deadLetterWorkerJobs = workerJobs.filter((row) => row.status === "dead_letter");
  const failedRuns = runs.filter((row) => row.status === "failed");
  const completedRunLatencies = runs
    .filter((row) => row.status === "completed")
    .map((row) => durationMs(row.started_at || row.created_at, row.completed_at))
    .filter((value) => value !== null);
  const pendingApprovals = approvals.filter((row) => row.status === "pending");
  const pendingApprovalWaits = pendingApprovals
    .map((row) => ageMs(row.requested_at || row.created_at, nowMs))
    .filter((value) => value !== null);
  const stalePendingApprovals = pendingApprovals.filter((row) =>
    isOlderThan(row.requested_at || row.created_at, nowMs, thresholds.approvalStaleMs),
  );
  const workerDurations = usageEvents
    .map((row) => numberValue(row.worker_duration_ms))
    .filter((value) => value > 0);
  const modelCostCents = usageEvents.reduce((sum, row) => sum + numberValue(row.cost_cents), 0);
  const toolCalls = usageEvents.reduce((sum, row) => sum + numberValue(row.tool_calls), 0);
  const totalTokens = usageEvents.reduce((sum, row) => sum + numberValue(row.total_tokens), 0);
  const staleProcessingOutbox = outboxEvents.filter(
    (row) =>
      row.status === "processing" &&
      isOlderThan(row.locked_at || row.updated_at || row.created_at, nowMs, thresholds.outboxStaleMs),
  );
  const stuckWorkerJobs = workerJobs.filter(
    (row) =>
      ["queued", "running"].includes(row.status) &&
      isOlderThan(row.locked_at || row.started_at || row.updated_at || row.created_at, nowMs, thresholds.workerJobStuckMs),
  );

  const issues = [];
  if (deadLetterOutbox.length > thresholds.maxDeadLetterOutbox) {
    issues.push(
      `dead-letter outbox rows ${deadLetterOutbox.length} > ${thresholds.maxDeadLetterOutbox}`,
    );
  }
  if (failedOutbox.length > thresholds.maxFailedOutbox) {
    issues.push(`failed outbox rows ${failedOutbox.length} > ${thresholds.maxFailedOutbox}`);
  }
  if (failedRuns.length > thresholds.maxFailedRuns) {
    issues.push(`failed runs ${failedRuns.length} > ${thresholds.maxFailedRuns}`);
  }
  if (deadLetterWorkerJobs.length > thresholds.maxDeadLetterWorkerJobs) {
    issues.push(
      `dead-letter worker jobs ${deadLetterWorkerJobs.length} > ${thresholds.maxDeadLetterWorkerJobs}`,
    );
  }
  if (staleProcessingOutbox.length > thresholds.maxStaleProcessingOutbox) {
    issues.push(
      `stale processing outbox rows ${staleProcessingOutbox.length} > ${thresholds.maxStaleProcessingOutbox}`,
    );
  }
  if (stuckWorkerJobs.length > thresholds.maxStuckWorkerJobs) {
    issues.push(`stuck worker jobs ${stuckWorkerJobs.length} > ${thresholds.maxStuckWorkerJobs}`);
  }
  if (stalePendingApprovals.length > thresholds.maxStalePendingApprovals) {
    issues.push(
      `stale pending approvals ${stalePendingApprovals.length} > ${thresholds.maxStalePendingApprovals}`,
    );
  }

  return {
    counts: {
      dead_letter_outbox: deadLetterOutbox.length,
      dead_letter_worker_jobs: deadLetterWorkerJobs.length,
      failed_runs: failedRuns.length,
      failed_outbox: failedOutbox.length,
      pending_approvals: pendingApprovals.length,
      stale_pending_approvals: stalePendingApprovals.length,
      stale_processing_outbox: staleProcessingOutbox.length,
      stuck_worker_jobs: stuckWorkerJobs.length,
    },
    issues,
    metrics: {
      approval_wait_ms_avg: average(pendingApprovalWaits),
      approval_wait_ms_max: max(pendingApprovalWaits),
      model_cost_cents: modelCostCents,
      run_latency_ms_avg: average(completedRunLatencies),
      run_latency_ms_p95: percentile(completedRunLatencies, 0.95),
      tool_calls: toolCalls,
      total_tokens: totalTokens,
      worker_duration_ms_avg: average(workerDurations),
      worker_duration_ms_max: max(workerDurations),
    },
    ok: issues.length === 0,
    thresholds,
  };
}

function ageMs(value, nowMs) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return null;
  return Math.max(0, nowMs - time);
}

function durationMs(start, end) {
  const startMs = Date.parse(start || "");
  const endMs = Date.parse(end || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, endMs - startMs);
}

function isOlderThan(value, nowMs, maxAgeMs) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && nowMs - time > maxAgeMs;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function max(values) {
  if (!values.length) return 0;
  return Math.max(...values);
}

function numberValue(value) {
  const out = Number(value || 0);
  return Number.isFinite(out) ? out : 0;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * quantile) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function intEnv(env, name, defaultValue, min, max) {
  const raw = String(env[name] || "").trim();
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function supabaseURL(path) {
  return `${requiredEnv("SUPABASE_URL").replace(/\/+$/, "")}${path}`;
}

function serviceHeaders(extra = {}) {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path) {
  const response = await fetch(supabaseURL(path), {
    headers: serviceHeaders(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || response.statusText);
  return text ? JSON.parse(text) : [];
}

function queryPath(table, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return `/rest/v1/${table}?${params.toString()}`;
}

async function readStartupOfficeOpsSnapshot(now = new Date().toISOString()) {
  const [outboxEvents, workerJobs, runs, approvals, usageEvents] = await Promise.all([
    supabaseFetch(
      queryPath("startup_office_outbox_events", {
        limit: "1000",
        order: "created_at.asc",
        select: "id,status,attempts,max_attempts,available_at,locked_at,processed_at,last_error,created_at,updated_at",
        status: "in.(failed,dead_letter,processing)",
      }),
    ),
    supabaseFetch(
      queryPath("startup_office_worker_jobs", {
        limit: "1000",
        order: "created_at.asc",
        select: "id,status,attempts,max_attempts,available_at,locked_at,started_at,completed_at,last_error,created_at,updated_at",
        status: "in.(queued,running,dead_letter)",
      }),
    ),
    supabaseFetch(
      queryPath("startup_office_runs", {
        limit: "1000",
        order: "created_at.desc",
        select: "id,status,created_at,started_at,completed_at,updated_at",
        status: "in.(completed,failed,running,waiting_approval)",
      }),
    ),
    supabaseFetch(
      queryPath("startup_office_approvals", {
        limit: "1000",
        order: "requested_at.asc",
        select: "id,status,requested_at,decided_at,created_at,updated_at",
        status: "eq.pending",
      }),
    ),
    supabaseFetch(
      queryPath("startup_office_usage_events", {
        limit: "1000",
        order: "created_at.desc",
        select: "id,run_id,provider,model,total_tokens,tool_calls,cost_cents,worker_duration_ms,created_at",
      }),
    ),
  ]);
  return {
    approvals,
    now,
    outbox_events: outboxEvents,
    runs,
    usage_events: usageEvents,
    worker_jobs: workerJobs,
  };
}

function printMonitorResult(result) {
  const counts = result.counts || {};
  const metrics = result.metrics || {
    approval_wait_ms_avg: 0,
    approval_wait_ms_max: 0,
    model_cost_cents: 0,
    run_latency_ms_avg: 0,
    run_latency_ms_p95: 0,
    tool_calls: 0,
    total_tokens: 0,
    worker_duration_ms_avg: 0,
    worker_duration_ms_max: 0,
  };
  const lines = [
    `[startup-office-ops-monitor] ${result.ok ? "PASS" : "FAIL"} Startup Office ops thresholds`,
    `[startup-office-ops-monitor] dead-letter outbox: ${counts.dead_letter_outbox || 0}`,
    `[startup-office-ops-monitor] dead-letter worker jobs: ${counts.dead_letter_worker_jobs || 0}`,
    `[startup-office-ops-monitor] failed outbox: ${counts.failed_outbox || 0}`,
    `[startup-office-ops-monitor] failed runs: ${counts.failed_runs || 0}`,
    `[startup-office-ops-monitor] pending approvals: ${counts.pending_approvals || 0}`,
    `[startup-office-ops-monitor] stale pending approvals: ${counts.stale_pending_approvals || 0}`,
    `[startup-office-ops-monitor] stale processing outbox: ${counts.stale_processing_outbox || 0}`,
    `[startup-office-ops-monitor] stuck worker jobs: ${counts.stuck_worker_jobs || 0}`,
    `[startup-office-ops-monitor] run latency avg/p95 ms: ${metrics.run_latency_ms_avg}/${metrics.run_latency_ms_p95}`,
    `[startup-office-ops-monitor] approval wait avg/max ms: ${metrics.approval_wait_ms_avg}/${metrics.approval_wait_ms_max}`,
    `[startup-office-ops-monitor] model tokens/cost cents: ${metrics.total_tokens}/${metrics.model_cost_cents}`,
    `[startup-office-ops-monitor] tool calls: ${metrics.tool_calls}`,
    `[startup-office-ops-monitor] worker duration avg/max ms: ${metrics.worker_duration_ms_avg}/${metrics.worker_duration_ms_max}`,
  ];
  for (const issue of result.issues) {
    lines.push(`[startup-office-ops-monitor] ERROR ${issue}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const json = process.argv.includes("--json");
  const snapshot = await readStartupOfficeOpsSnapshot();
  const result = evaluateStartupOfficeOpsSnapshot(snapshot, thresholdsFromEnv());
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : printMonitorResult(result));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

module.exports = {
  evaluateStartupOfficeOpsSnapshot,
  printMonitorResult,
  queryPath,
  thresholdsFromEnv,
};
