const {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
} = require("./loopDefinitions");
const {
  normalizeStartupOfficeApprovalStatus,
  objectValue,
  publicStartupOfficeApproval,
  publicStartupOfficeArtifact,
  publicStartupOfficeLoop,
  publicStartupOfficeReceipt,
  publicStartupOfficeRun,
} = require("./serializers");

function createStartupOfficeRepository({
  HTTPError,
  clamp,
  nowISO,
  rest,
  shortID,
  slugify,
  truncateText,
}) {
  async function safeRest(table, options = {}) {
    try {
      return (await rest(table, options)) || [];
    } catch (err) {
      if (isMissingTableError(err, table)) return [];
      throw err;
    }
  }

  function isMissingTableError(err, table) {
    if (!(err instanceof HTTPError)) return false;
    if (err.status !== 404) return false;
    const message = String(err.message || "");
    return message.includes(table) || message.includes(`public.${table}`);
  }

  async function loops(teamID) {
    const rows = await safeRest("startup_office_loops", {
      query: {
        order: "created_at.asc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    const bySlug = new Map(
      (rows || []).map((row) => [row.slug, publicStartupOfficeLoop(row)]),
    );
    for (const definition of STARTUP_OFFICE_LOOP_DEFINITIONS) {
      if (!bySlug.has(definition.slug)) {
        bySlug.set(
          definition.slug,
          publicStartupOfficeLoop({
            ...definition,
            id: definition.slug,
            policy: {
              founder_approval_required: true,
              source: "system_default",
            },
            status: "active",
          }),
        );
      }
    }
    return [...bySlug.values()];
  }

  async function runs(teamID, options = {}) {
    const query = {
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    };
    if (options.run_id) query.id = `eq.${options.run_id}`;
    if (options.loop_id) query.loop_id = `eq.${options.loop_id}`;
    if (options.status) query.status = `eq.${options.status}`;
    applyLimit(query, options.limit);
    const rows = await safeRest("startup_office_runs", { query });
    return rows.map(publicStartupOfficeRun).filter(Boolean);
  }

  async function artifacts(teamID, options = {}) {
    const query = {
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    };
    if (options.run_id) query.run_id = `eq.${options.run_id}`;
    applyLimit(query, options.limit);
    const rows = await safeRest("startup_office_artifacts", { query });
    return rows.map(publicStartupOfficeArtifact).filter(Boolean);
  }

  async function approvals(teamID, options = {}) {
    const query = {
      order: "requested_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    };
    if (options.status) {
      query.status = `eq.${normalizeStartupOfficeApprovalStatus(options.status)}`;
    }
    if (options.run_id) query.run_id = `eq.${options.run_id}`;
    applyLimit(query, options.limit);
    const rows = await safeRest("startup_office_approvals", { query });
    return rows.map(publicStartupOfficeApproval).filter(Boolean);
  }

  async function receipts(teamID, options = {}) {
    const query = {
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    };
    if (options.run_id) query.run_id = `eq.${options.run_id}`;
    applyLimit(query, options.limit);
    const rows = await safeRest("startup_office_receipts", { query });
    return rows.map(publicStartupOfficeReceipt).filter(Boolean);
  }

  async function ensureLoop(membership, loopID) {
    const rows = await safeRest("startup_office_loops", {
      query: {
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    });
    const normalized = String(loopID || "").trim();
    const existing = rows.find(
      (loop) => loop.id === normalized || loop.slug === normalized,
    );
    if (existing) return publicStartupOfficeLoop(existing);
    const definition = STARTUP_OFFICE_LOOP_DEFINITIONS.find(
      (loop) => loop.slug === normalized,
    );
    if (!definition) throw new HTTPError(404, "loop not found");
    const [created] = await safeRest("startup_office_loops", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id,slug" },
      body: {
        cadence: definition.cadence,
        created_by: membership.user_id,
        department: definition.department,
        name: definition.name,
        objective: definition.objective,
        policy: {
          founder_approval_required: true,
          source: "system_default",
        },
        slug: definition.slug,
        status: "active",
        team_id: membership.team_id,
        updated_at: nowISO(),
      },
    });
    return publicStartupOfficeLoop(
      created || {
        ...definition,
        id: definition.slug,
        status: "active",
      },
    );
  }

  async function findApproval(teamID, approvalID) {
    const rows = await safeRest("startup_office_approvals", {
      query: {
        id: `eq.${approvalID}`,
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows?.[0] || null;
  }

  async function findRun(teamID, runID) {
    const rows = await safeRest("startup_office_runs", {
      query: {
        id: `eq.${runID}`,
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows?.[0] || null;
  }

  async function createRun(membership, body) {
    const [run] = await safeRest("startup_office_runs", {
      method: "POST",
      body: {
        created_at: body.created_at || nowISO(),
        created_by: membership.user_id,
        inputs: objectValue(body.inputs),
        loop_id: body.loop_id || null,
        metadata: objectValue(body.metadata),
        objective: truncateText(body.objective || "", 2000),
        started_at: body.started_at || null,
        status: body.status || "queued",
        summary: truncateText(body.summary || "", 2000),
        team_id: membership.team_id,
        title: truncateText(body.title || "", 180),
        updated_at: body.updated_at || nowISO(),
      },
    });
    return run || null;
  }

  async function updateRun(teamID, runID, patch) {
    const [run] = await safeRest("startup_office_runs", {
      method: "PATCH",
      query: {
        id: `eq.${runID}`,
        team_id: `eq.${teamID}`,
      },
      body: patch,
    });
    return run || null;
  }

  async function createArtifact(membership, body) {
    const [artifact] = await safeRest("startup_office_artifacts", {
      method: "POST",
      body: {
        content: truncateText(body.content || "", 20000),
        created_by: membership.user_id,
        kind: body.kind || "draft",
        metadata: objectValue(body.metadata),
        run_id: body.run_id || null,
        team_id: membership.team_id,
        title: truncateText(body.title || "", 180),
      },
    });
    return publicStartupOfficeArtifact(
      artifact || {
        id: `artifact-${shortID()}`,
        ...body,
        created_at: nowISO(),
        team_id: membership.team_id,
      },
    );
  }

  async function createApproval(membership, body) {
    const [approval] = await safeRest("startup_office_approvals", {
      method: "POST",
      body: {
        action: truncateText(body.action || "", 120),
        artifact_id: body.artifact_id || null,
        details: truncateText(body.details || "", 4000),
        metadata: objectValue(body.metadata),
        requested_by: body.requested_by || membership.user_id,
        risk_level: body.risk_level || "medium",
        run_id: body.run_id || null,
        status: body.status || "pending",
        team_id: membership.team_id,
        title: truncateText(body.title || "", 180),
      },
    });
    return publicStartupOfficeApproval(
      approval || {
        id: `approval-${shortID()}`,
        ...body,
        requested_at: nowISO(),
        team_id: membership.team_id,
      },
    );
  }

  async function createReceipt(membership, body) {
    const [receipt] = await safeRest("startup_office_receipts", {
      method: "POST",
      body: {
        actor_slug: truncateText(body.actor_slug || "agent", 80),
        approval_id: body.approval_id || null,
        created_by: membership.user_id,
        event_type: truncateText(body.event_type || "event", 80),
        run_id: body.run_id || null,
        summary: truncateText(body.summary || "", 2000),
        team_id: membership.team_id,
        trace: objectValue(body.trace),
      },
    });
    return publicStartupOfficeReceipt(
      receipt || {
        id: `receipt-${shortID()}`,
        ...body,
        created_at: nowISO(),
        created_by: membership.user_id,
        team_id: membership.team_id,
      },
    );
  }

  async function uniqueLoopSlug(teamID, seed) {
    const base = slugify(seed) || `loop-${shortID()}`;
    const existing = await safeRest("startup_office_loops", {
      query: {
        limit: "1",
        select: "id",
        slug: `eq.${base}`,
        team_id: `eq.${teamID}`,
      },
    });
    return existing?.length ? `${base}-${shortID()}` : base;
  }

  async function createWorkerJob(membership, body) {
    const [job] = await safeRest("startup_office_worker_jobs", {
      method: "POST",
      body: {
        attempts: Number(body.attempts || 0),
        created_by: membership.user_id,
        loop_slug: truncateText(body.loop_slug || "", 120),
        max_attempts: Number(body.max_attempts || 2),
        metadata: objectValue(body.metadata),
        run_id: body.run_id || null,
        status: body.status || "queued",
        team_id: membership.team_id,
        updated_at: body.updated_at || nowISO(),
      },
    });
    return job || null;
  }

  async function updateWorkerJob(teamID, jobID, patch) {
    if (!jobID) return null;
    const [job] = await safeRest("startup_office_worker_jobs", {
      method: "PATCH",
      query: {
        id: `eq.${jobID}`,
        team_id: `eq.${teamID}`,
      },
      body: patch,
    });
    return job || null;
  }

  function applyLimit(query, limit) {
    if (limit) query.limit = String(clamp(Number(limit) || 20, 1, 200));
  }

  return {
    approvals,
    artifacts,
    createApproval,
    createArtifact,
    createReceipt,
    createRun,
    createWorkerJob,
    ensureLoop,
    findApproval,
    findRun,
    isMissingTableError,
    loops,
    receipts,
    runs,
    safeRest,
    updateRun,
    updateWorkerJob,
    uniqueLoopSlug,
  };
}

module.exports = {
  createStartupOfficeRepository,
};
