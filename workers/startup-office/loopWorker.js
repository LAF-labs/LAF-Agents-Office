function createStartupOfficeLoopWorker({
  claimWorkerJob,
  loadWorkerJobContext,
  nowISO = () => new Date().toISOString(),
  retryDelayMs = defaultRetryDelayMs,
  runLoop,
  truncateText = defaultTruncateText,
  updateWorkerJob,
}) {
  if (typeof claimWorkerJob !== "function") throw new TypeError("claimWorkerJob is required");
  if (typeof loadWorkerJobContext !== "function") throw new TypeError("loadWorkerJobContext is required");
  if (typeof runLoop !== "function") throw new TypeError("runLoop is required");
  if (typeof updateWorkerJob !== "function") throw new TypeError("updateWorkerJob is required");

  async function processOne() {
    const job = await claimWorkerJob();
    if (!job?.id) return { job: null, status: "idle" };

    try {
      const context = await loadWorkerJobContext(job);
      const terminal = terminalRunStatus(context.run?.status);
      if (terminal) {
        const skippedAt = nowISO();
        await updateWorkerJob(job.team_id, job.id, {
          completed_at: skippedAt,
          last_error: "",
          locked_at: null,
          metadata: {
            ...objectValue(job.metadata),
            skipped_run_status: context.run.status,
          },
          status: terminal,
          updated_at: skippedAt,
        });
        return { job, run: context.run, status: "skipped" };
      }

      const result = await runLoop({
        ...context,
        workerJob: job,
      });
      if (result.status === "failed") {
        const failure = await markFailed(job, result.error || "Startup Office loop failed");
        return { error: failure.error, job, result, status: failure.status };
      }
      return { job, result, status: result.status || "completed" };
    } catch (err) {
      const failure = await markFailed(job, err?.message || "Startup Office loop worker failed");
      return { error: failure.error, job, status: failure.status };
    }
  }

  async function markFailed(job, message) {
    const failedAt = nowISO();
    const attempts = Number(job.attempts || 0);
    const maxAttempts = Number(job.max_attempts || 1);
    const exhausted = attempts >= maxAttempts;
    const patch = {
      last_error: truncateText(message, 2000),
      locked_at: null,
      status: exhausted ? "dead_letter" : "failed",
      updated_at: failedAt,
    };
    if (exhausted) {
      patch.completed_at = failedAt;
    } else {
      patch.available_at = new Date(
        Date.parse(failedAt) + retryDelayMs(attempts),
      ).toISOString();
    }
    await updateWorkerJob(job.team_id, job.id, patch);
    return { error: patch.last_error, status: patch.status };
  }

  async function processBatch({ limit = 5 } = {}) {
    const max = Math.max(1, Math.min(Number(limit) || 5, 50));
    const results = [];
    for (let index = 0; index < max; index += 1) {
      const result = await processOne();
      if (result.status === "idle") break;
      results.push(result);
    }
    return {
      completed: results.filter((item) => ["completed", "waiting_approval"].includes(item.status)).length,
      dead_letter: results.filter((item) => item.status === "dead_letter").length,
      failed: results.filter((item) => item.status === "failed").length,
      processed: results.length,
      results,
      skipped: results.filter((item) => item.status === "skipped").length,
    };
  }

  return { processBatch, processOne };
}

function terminalRunStatus(status) {
  if (["completed", "waiting_approval"].includes(status)) return "completed";
  if (status === "canceled") return "canceled";
  return "";
}

function defaultRetryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(Number(attempts || 1) - 1, 5));
  return 60000 * 2 ** exponent;
}

function defaultTruncateText(value, max) {
  return String(value || "").slice(0, max);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  createStartupOfficeLoopWorker,
  defaultRetryDelayMs,
  terminalRunStatus,
};
