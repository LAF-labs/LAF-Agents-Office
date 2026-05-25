function createHostedSchedulerHandlers(deps) {
  const {
    nowISO,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    writeJSON,
  } = deps;

  async function handleHostedScheduler(req, res) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const dueOnly = truthy(req.query?.due_only);
    const jobs = await safeStartupOfficeRest("startup_office_worker_jobs", {
      query: {
        limit: String(Number(req.query?.limit) || 100),
        order: "created_at.desc",
        select: "*",
        status: "in.(queued,running,failed,dead_letter)",
        team_id: `eq.${membership.team_id}`,
      },
    });
    const now = Date.parse(nowISO());
    writeJSON(res, 200, {
      jobs: (jobs || [])
        .filter((job) => !dueOnly || isDueJob(job, now))
        .map(schedulerJob),
    });
  }

  return {
    scheduler: handleHostedScheduler,
  };
}

function schedulerJob(job) {
  const metadata = objectValue(job.metadata);
  const loopSlug = job.loop_slug || metadata.loop_slug || "";
  return {
    channel: "startup-office",
    due_at: job.available_at || job.created_at || "",
    id: job.id || "",
    kind: "startup_office_worker_job",
    label: metadata.objective || humanizeLoopSlug(loopSlug) || "Startup Office worker job",
    last_run: job.completed_at || job.started_at || "",
    next_run: job.available_at || "",
    provider: metadata.provider || "",
    run_id: job.run_id || "",
    skill_name: loopSlug,
    slug: loopSlug || job.id || "",
    status: job.status || "queued",
    workflow_key: loopSlug,
  };
}

function isDueJob(job, now) {
  const status = String(job.status || "").toLowerCase();
  if (status === "running") return true;
  if (!["queued", "failed"].includes(status)) return false;
  const availableAt = Date.parse(job.available_at || job.created_at || "");
  return Number.isFinite(availableAt) && availableAt <= now;
}

function humanizeLoopSlug(value) {
  const text = String(value || "").trim().replace(/[-_]+/g, " ");
  return text ? `${text.replace(/\b\w/g, (char) => char.toUpperCase())} worker job` : "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

module.exports = {
  createHostedSchedulerHandlers,
};
