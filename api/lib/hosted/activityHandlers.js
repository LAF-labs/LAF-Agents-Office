function createHostedActivityHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleHostedActions(req, res) {
    const { membership } = await requireReadable(req);
    const receipts = await readRows("startup_office_receipts", membership, {
      limit: limitFrom(req),
      order: "created_at.desc",
    });
    writeJSON(res, 200, { actions: receipts.map(actionFromReceipt) });
  }

  async function handleHostedSignals(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const rows = await readRows("startup_office_signals", membership, {
        limit: limitFrom(req),
        order: "created_at.desc",
        status: "neq.archived",
      });
      writeJSON(res, 200, { signals: rows.map(signalRecord) });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const body = objectValue(await readBody(req));
    const [row] = await safeStartupOfficeRest("startup_office_signals", {
      method: "POST",
      body: signalPayload(membership, body, nowISO(), truncateText),
    });
    await writeAuditEvent(membership, "startup_office.signal.created", "signal", row?.id || "");
    writeJSON(res, 200, { signal: signalRecord(row), stored: true });
  }

  async function handleHostedDecisions(req, res) {
    const { membership } = await requireReadable(req);
    const approvals = await readRows("startup_office_approvals", membership, {
      limit: limitFrom(req),
      order: "decided_at.desc.nullslast,requested_at.desc",
      status: "in.(approved,rejected,revision_requested)",
    });
    writeJSON(res, 200, { decisions: approvals.map(decisionFromApproval) });
  }

  async function handleHostedWatchdogs(req, res) {
    const { membership } = await requireReadable(req);
    const [jobs, runs] = await Promise.all([
      readRows("startup_office_worker_jobs", membership, {
        limit: limitFrom(req),
        order: "available_at.desc.nullslast,created_at.desc",
        status: "in.(failed,dead_letter)",
      }),
      readRows("startup_office_runs", membership, {
        limit: limitFrom(req),
        order: "updated_at.desc.nullslast,created_at.desc",
        status: "eq.failed",
      }),
    ]);
    const watchdogs = [
      ...jobs.map(watchdogFromJob),
      ...runs.map(watchdogFromRun),
    ].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
    writeJSON(res, 200, { watchdogs: watchdogs.slice(0, limitFrom(req)) });
  }

  async function requireReadable(req) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    return { membership };
  }

  async function readRows(table, membership, options) {
    const query = {
      limit: String(options.limit || 100),
      order: options.order,
      select: "*",
      team_id: `eq.${membership.team_id}`,
    };
    if (options.status) query.status = options.status;
    const rows = await safeStartupOfficeRest(table, { query });
    return Array.isArray(rows) ? rows : [];
  }

  return {
    actions: handleHostedActions,
    decisions: handleHostedDecisions,
    signals: handleHostedSignals,
    watchdogs: handleHostedWatchdogs,
  };
}

function actionFromReceipt(receipt) {
  return {
    actor: receipt.actor_slug || "",
    channel: "startup-office",
    created_at: receipt.created_at || "",
    id: receipt.id || "",
    kind: receipt.event_type || "receipt",
    related_id: receipt.run_id || receipt.approval_id || "",
    source: "startup-office",
    summary: receipt.summary || "",
  };
}

function signalRecord(row) {
  const metadata = objectValue(row?.metadata);
  return {
    body: row?.body || "",
    channel: metadata.channel || "startup-office",
    created_at: row?.created_at || "",
    id: row?.id || "",
    kind: metadata.kind || row?.source || "signal",
    source: row?.source || "",
    status: row?.status || "new",
    summary: row?.title || row?.body || "",
    title: row?.title || "Startup Office signal",
    updated_at: row?.updated_at || row?.created_at || "",
  };
}

function decisionFromApproval(approval) {
  return {
    blocking: approval.status === "revision_requested",
    channel: "startup-office",
    created_at: approval.decided_at || approval.requested_at || "",
    id: approval.id || "",
    kind: approval.status || "decision",
    owner: approval.decided_by || approval.requested_by || "",
    reason: approval.decision_note || approval.details || "",
    related_id: approval.run_id || approval.artifact_id || "",
    summary: approval.title || approval.action || "Startup Office decision",
  };
}

function watchdogFromJob(job) {
  return {
    channel: "startup-office",
    created_at: job.created_at || "",
    id: job.id || "",
    kind: job.status === "dead_letter" ? "critical" : "failed_job",
    summary: `${job.loop_slug || "Startup Office"} job ${job.status || "failed"}`,
    target_id: job.run_id || job.id || "",
    target_type: "worker_job",
    updated_at: job.available_at || job.created_at || "",
  };
}

function watchdogFromRun(run) {
  return {
    channel: "startup-office",
    created_at: run.created_at || "",
    id: run.id || "",
    kind: "failed_run",
    owner: run.loop_id || "",
    summary: run.summary || run.title || "Startup Office run failed",
    target_id: run.id || "",
    target_type: "run",
    updated_at: run.updated_at || run.completed_at || run.created_at || "",
  };
}

function signalPayload(membership, body, now, truncateText) {
  const title = body.title || body.summary || body.kind || "Workspace signal";
  return {
    body: truncateText(body.body || body.summary || "", 6000),
    created_by: membership.user_id,
    metadata: {
      channel: body.channel || "startup-office",
      kind: body.kind || "manual",
    },
    source: truncateText(body.source || "manual", 120),
    status: "new",
    team_id: membership.team_id,
    title: truncateText(title, 180),
    updated_at: now,
  };
}

function limitFrom(req) {
  const limit = Number(req.query?.limit || 100);
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(500, Math.floor(limit)));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  createHostedActivityHandlers,
};
