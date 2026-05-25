function createHostedHealthHandlers({
  authFetch,
  env = process.env,
  nowISO = () => new Date().toISOString(),
  rest,
  writeJSON,
}) {
  async function health(req, res) {
    if (req.method !== "GET") {
      const err = new Error("method not allowed");
      err.status = 405;
      throw err;
    }
    writeJSON(res, 200, {
      service: "laf-hosted-api",
      status: "ok",
    });
  }

  async function dependencies(req, res) {
    if (req.method !== "GET") {
      const err = new Error("method not allowed");
      err.status = 405;
      throw err;
    }
    const timeoutMs = healthTimeoutMs(env.LAF_HEALTH_DEPENDENCY_TIMEOUT_MS);
    const checks = await Promise.all([
      dependencyCheck("supabase_rest", timeoutMs, () =>
        rest("teams", { query: { limit: "1", select: "id" } }),
      ),
      dependencyCheck("supabase_auth", timeoutMs, () => authFetch("settings")),
      dependencyCheck("startup_office_runs_table", timeoutMs, () =>
        rest("startup_office_runs", { query: { limit: "1", select: "id,status,updated_at" } }),
      ),
      dependencyCheck("startup_office_worker_jobs_table", timeoutMs, () =>
        rest("startup_office_worker_jobs", { query: { limit: "1", select: "id,status,updated_at" } }),
      ),
      dependencyCheck("startup_office_outbox_events_table", timeoutMs, () =>
        rest("startup_office_outbox_events", { query: { limit: "1", select: "id,status,updated_at" } }),
      ),
      modelConfigCheck(env, nowISO),
      outboxEmailConfigCheck(env, nowISO),
    ]);
    const status = checks.every((check) => check.status === "ok") ? "ok" : "degraded";
    writeJSON(res, status === "ok" ? 200 : 503, {
      checked_at: nowISO(),
      dependencies: checks,
      service: "laf-hosted-api",
      status,
    });
  }

  return { dependencies, health };
}

async function dependencyCheck(name, timeoutMs, fn) {
  const startedAt = Date.now();
  try {
    await withTimeout(fn(), timeoutMs, `${name} timed out after ${timeoutMs}ms`);
    return {
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      name,
      status: "ok",
    };
  } catch (err) {
    return {
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      message: publicHealthMessage(err),
      name,
      status: "degraded",
    };
  }
}

function modelConfigCheck(env, nowISO) {
  const provider = String(env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER || "")
    .trim()
    .toLowerCase() || (hasAnyOpenAIKey(env) ? "openai" : "disabled");
  const production = env.NODE_ENV === "production";
  const ok =
    provider === "openai"
      ? hasAnyOpenAIKey(env)
      : provider === "fake" && !production;
  return {
    checked_at: nowISO(),
    name: "startup_office_model_config",
    provider,
    status: ok ? "ok" : "degraded",
  };
}

function outboxEmailConfigCheck(env, nowISO) {
  const provider = String(env.LAF_OUTBOX_EMAIL_PROVIDER || "in_app").trim().toLowerCase();
  const ok =
    !provider ||
    provider === "in_app" ||
    provider === "none" ||
    (provider === "resend" && Boolean(env.RESEND_API_KEY && env.LAF_EMAIL_FROM));
  return {
    checked_at: nowISO(),
    name: "outbox_email_config",
    provider: provider || "in_app",
    status: ok ? "ok" : "degraded",
  };
}

function hasAnyOpenAIKey(env) {
  return Boolean(env.LAF_OFFICE_OPENAI_API_KEY || env.OPENAI_API_KEY);
}

function healthTimeoutMs(value) {
  const parsed = Number(value || 2000);
  const timeoutMs = Number.isFinite(parsed) ? Math.trunc(parsed) : 2000;
  return Math.max(100, Math.min(timeoutMs, 10000));
}

function withTimeout(promise, timeoutMs, message) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function publicHealthMessage(err) {
  const status = Number(err?.status || 0);
  if (status) return `dependency returned ${status}`;
  return String(err?.message || "dependency check failed").slice(0, 160);
}

module.exports = {
  createHostedHealthHandlers,
};
