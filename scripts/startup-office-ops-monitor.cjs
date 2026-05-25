#!/usr/bin/env node
"use strict";

function thresholdsFromEnv(env = process.env) {
  return {
    maxDeadLetterOutbox: intEnv(env, "LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX", 0, 0, 10000),
    maxFailedOutbox: intEnv(env, "LAF_MONITOR_MAX_FAILED_OUTBOX", 25, 0, 10000),
    maxStaleProcessingOutbox: intEnv(env, "LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX", 0, 0, 10000),
    maxStuckWorkerJobs: intEnv(env, "LAF_MONITOR_MAX_STUCK_WORKER_JOBS", 0, 0, 10000),
    outboxStaleMs: intEnv(env, "LAF_MONITOR_OUTBOX_STALE_MS", 600000, 1000, 86400000),
    workerJobStuckMs: intEnv(env, "LAF_MONITOR_WORKER_JOB_STUCK_MS", 1800000, 1000, 86400000),
  };
}

function evaluateStartupOfficeOpsSnapshot(snapshot, thresholds = thresholdsFromEnv()) {
  const nowMs = Date.parse(snapshot.now || new Date().toISOString());
  const outboxEvents = Array.isArray(snapshot.outbox_events) ? snapshot.outbox_events : [];
  const workerJobs = Array.isArray(snapshot.worker_jobs) ? snapshot.worker_jobs : [];
  const deadLetterOutbox = outboxEvents.filter((row) => row.status === "dead_letter");
  const failedOutbox = outboxEvents.filter((row) => row.status === "failed");
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
  if (staleProcessingOutbox.length > thresholds.maxStaleProcessingOutbox) {
    issues.push(
      `stale processing outbox rows ${staleProcessingOutbox.length} > ${thresholds.maxStaleProcessingOutbox}`,
    );
  }
  if (stuckWorkerJobs.length > thresholds.maxStuckWorkerJobs) {
    issues.push(`stuck worker jobs ${stuckWorkerJobs.length} > ${thresholds.maxStuckWorkerJobs}`);
  }

  return {
    counts: {
      dead_letter_outbox: deadLetterOutbox.length,
      failed_outbox: failedOutbox.length,
      stale_processing_outbox: staleProcessingOutbox.length,
      stuck_worker_jobs: stuckWorkerJobs.length,
    },
    issues,
    ok: issues.length === 0,
    thresholds,
  };
}

function isOlderThan(value, nowMs, maxAgeMs) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && nowMs - time > maxAgeMs;
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
  const [outboxEvents, workerJobs] = await Promise.all([
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
        select: "id,status,attempts,max_attempts,locked_at,started_at,completed_at,last_error,created_at,updated_at",
        status: "in.(queued,running)",
      }),
    ),
  ]);
  return {
    now,
    outbox_events: outboxEvents,
    worker_jobs: workerJobs,
  };
}

function printMonitorResult(result) {
  const lines = [
    `[startup-office-ops-monitor] ${result.ok ? "PASS" : "FAIL"} Startup Office ops thresholds`,
    `[startup-office-ops-monitor] dead-letter outbox: ${result.counts.dead_letter_outbox}`,
    `[startup-office-ops-monitor] failed outbox: ${result.counts.failed_outbox}`,
    `[startup-office-ops-monitor] stale processing outbox: ${result.counts.stale_processing_outbox}`,
    `[startup-office-ops-monitor] stuck worker jobs: ${result.counts.stuck_worker_jobs}`,
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
