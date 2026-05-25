function createStartupOfficeWorkerJobRecoveryHandlers(deps) {
  const {
    createHTTPError,
    nowISO = () => new Date().toISOString(),
    objectValue,
    readBody,
    requireAdminRole,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeWorkerJobAction(req, res, jobID, action) {
    const { membership } = await requireUser(req);
    requireAdminRole(membership, "owner or admin role required for worker job recovery");
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = objectValue(await readBody(req));
    const job = await findWorkerJob(membership.team_id, jobID);
    if (!job) throw createHTTPError(404, "worker job not found");
    if (action === "retry") return retryWorkerJob({ body, job, membership, res });
    if (action === "cancel") return cancelWorkerJob({ body, job, membership, res });
    throw createHTTPError(404, "worker job action not found");
  }

  async function retryWorkerJob({ body, job, membership, res }) {
    if (!["failed", "dead_letter", "canceled"].includes(job.status)) {
      throw createHTTPError(409, `worker job is ${job.status}; only failed, dead_letter, or canceled jobs can be retried`);
    }
    const now = nowISO();
    const patch = {
      attempts: 0,
      available_at: now,
      completed_at: null,
      last_error: "",
      locked_at: null,
      metadata: {
        ...objectValue(job.metadata),
        previous_attempts: Number(job.attempts || 0),
        previous_status: job.status,
        recovery_note: truncateText(body.note || body.reason || "", 1000),
        retried_at: now,
        retried_by: membership.user_id,
      },
      status: "queued",
      updated_at: now,
    };
    const [updatedJob] = await patchWorkerJob(membership.team_id, job.id, patch);
    await requeueRunForWorkerJob(membership.team_id, job.run_id, now);
    await writeAuditEvent(membership, "startup_office.worker_job_retried", "worker_job", job.id, {
      previous_status: job.status,
      run_id: job.run_id || "",
    });
    writeJSON(res, 200, {
      status: "queued",
      worker_job: updatedJob || { ...job, ...patch },
    });
  }

  async function cancelWorkerJob({ body, job, membership, res }) {
    if (job.status === "completed") {
      throw createHTTPError(409, "completed worker jobs cannot be canceled");
    }
    const now = nowISO();
    const patch = {
      completed_at: now,
      last_error: "",
      locked_at: null,
      metadata: {
        ...objectValue(job.metadata),
        canceled_at: now,
        canceled_by: membership.user_id,
        cancellation_note: truncateText(body.note || body.reason || "", 1000),
        previous_status: job.status,
      },
      status: "canceled",
      updated_at: now,
    };
    const [updatedJob] = await patchWorkerJob(membership.team_id, job.id, patch);
    await cancelRunForWorkerJob(membership.team_id, job.run_id, now);
    await writeAuditEvent(membership, "startup_office.worker_job_canceled", "worker_job", job.id, {
      previous_status: job.status,
      run_id: job.run_id || "",
    });
    writeJSON(res, 200, {
      status: "canceled",
      worker_job: updatedJob || { ...job, ...patch },
    });
  }

  async function findWorkerJob(teamID, jobID) {
    const rows = await safeStartupOfficeRest("startup_office_worker_jobs", {
      query: {
        id: `eq.${jobID}`,
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows?.[0] || null;
  }

  async function patchWorkerJob(teamID, jobID, patch) {
    return safeStartupOfficeRest("startup_office_worker_jobs", {
      method: "PATCH",
      query: {
        id: `eq.${jobID}`,
        team_id: `eq.${teamID}`,
      },
      body: patch,
    });
  }

  async function requeueRunForWorkerJob(teamID, runID, now) {
    if (!runID) return null;
    const [run] = await safeStartupOfficeRest("startup_office_runs", {
      method: "PATCH",
      query: {
        id: `eq.${runID}`,
        status: "in.(failed,canceled,queued)",
        team_id: `eq.${teamID}`,
      },
      body: {
        completed_at: null,
        status: "queued",
        summary: "Operator requeued the Startup Office worker job.",
        updated_at: now,
      },
    });
    return run || null;
  }

  async function cancelRunForWorkerJob(teamID, runID, now) {
    if (!runID) return null;
    const [run] = await safeStartupOfficeRest("startup_office_runs", {
      method: "PATCH",
      query: {
        id: `eq.${runID}`,
        status: "in.(queued,running,failed)",
        team_id: `eq.${teamID}`,
      },
      body: {
        completed_at: now,
        status: "canceled",
        summary: "Operator canceled the Startup Office worker job.",
        updated_at: now,
      },
    });
    return run || null;
  }

  return { workerJobAction: handleStartupOfficeWorkerJobAction };
}

module.exports = {
  createStartupOfficeWorkerJobRecoveryHandlers,
};
