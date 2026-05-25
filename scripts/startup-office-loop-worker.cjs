#!/usr/bin/env node

const crypto = require("node:crypto");
const { createServiceRoleAccessGuards } = require("../api/lib/hosted/serviceRoleAccess");
const { startupOfficeApprovalPolicy } = require("../api/lib/startup-office/approvalPolicy");
const {
  recordStartupOfficeUsageEvent,
} = require("../api/lib/startup-office/runOutcomeRecorder");
const { createStartupOfficeRepository } = require("../api/lib/startup-office/repositories");
const { publicCompanyProfile } = require("../api/lib/startup-office/serializers");
const { createBrowserResearchClient } = require("../workers/startup-office/browserResearch");
const { createStartupOfficeModelClient } = require("../workers/startup-office/modelClient");
const { runStartupOfficeLoop } = require("../workers/startup-office/loopEngine");
const { createStartupOfficeLoopWorker } = require("../workers/startup-office/loopWorker");

class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const serviceRoleGuards = createServiceRoleAccessGuards({
  createHTTPError: (status, message) => new HTTPError(status, message),
});

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

async function supabaseFetch(path, options = {}) {
  const response = await fetch(supabaseURL(path), {
    method: options.method || "GET",
    headers: serviceHeaders(options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) throw new HTTPError(response.status, text || response.statusText);
  return text ? JSON.parse(text) : null;
}

async function rest(table, options = {}) {
  const tableName = serviceRoleGuards.assertAllowedRestTable(table);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return supabaseFetch(`/rest/v1/${tableName}${query ? `?${query}` : ""}`, {
    headers: options.method && options.method !== "GET"
      ? { Prefer: options.prefer || "return=representation" }
      : undefined,
    method: options.method || "GET",
    body: options.body,
  });
}

async function rpc(name, body = {}) {
  const rpcName = serviceRoleGuards.assertAllowedRPC(name);
  return supabaseFetch(`/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    body,
  });
}

async function authAdminFetch(path) {
  return supabaseFetch(`/auth/v1/${path}`);
}

let repositoryInstance = null;
function repository() {
  if (!repositoryInstance) {
    repositoryInstance = createStartupOfficeRepository({
      HTTPError,
      clamp,
      nowISO,
      rest,
      shortID,
      slugify,
      truncateText,
    });
  }
  return repositoryInstance;
}

async function claimWorkerJob() {
  return rpc("claim_startup_office_worker_job", {
    p_lock_ms: Number(process.env.LAF_LOOP_WORKER_LOCK_MS || 1800000),
    p_worker_id: process.env.LAF_LOOP_WORKER_ID || "startup-office-loop-worker",
  });
}

async function updateWorkerJob(teamID, jobID, patch) {
  if (!jobID) return null;
  const query = new URLSearchParams({
    id: `eq.${jobID}`,
    team_id: `eq.${teamID}`,
  });
  return supabaseFetch(`/rest/v1/startup_office_worker_jobs?${query.toString()}`, {
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
    body: patch,
  });
}

async function loadWorkerJobContext(job) {
  const repo = repository();
  const run = await repo.findRun(job.team_id, job.run_id);
  if (!run) throw new Error(`worker job run not found: ${job.run_id || "missing"}`);
  const membership = await membershipForJob(job);
  const [team, user, settings] = await Promise.all([
    getTeam(job.team_id),
    getAuthUser(membership.user_id),
    workspaceSettings(job.team_id),
  ]);
  const loop = await repo.ensureLoop(
    membership,
    run.loop_id || job.loop_slug || objectValue(run.metadata).loop_slug,
  );
  const profile = await companyProfileSnapshot(job.team_id, team, user, settings);
  const jobMetadata = objectValue(job.metadata);
  return {
    inputs: objectValue(run.inputs),
    loop,
    membership,
    browserResearchClient: createBrowserResearchClient({
      env: process.env,
      fetchImpl: fetch,
      nowISO,
      truncateText,
    }),
    modelClient: createStartupOfficeModelClient({
      env: process.env,
      fetchImpl: fetch,
    }),
    nowISO,
    objective: truncateText(
      run.objective || jobMetadata.objective || loop.objective || "Run this operating loop.",
      2000,
    ),
    approvalPolicy: startupOfficeApprovalPolicy(settings),
    profile,
    repository: repo,
    run,
    skillInvocations: Array.isArray(jobMetadata.skill_invocations)
      ? jobMetadata.skill_invocations
      : [],
    truncateText,
  };
}

async function workspaceSettings(teamID) {
  const rows = await rest("workspace_settings", {
    query: {
      limit: "1",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  return rows?.[0] || null;
}

async function membershipForJob(job) {
  const baseQuery = {
    limit: "1",
    select: "*",
    status: "eq.active",
    team_id: `eq.${job.team_id}`,
  };
  let rows = [];
  if (job.created_by) {
    rows = await rest("memberships", {
      query: {
        ...baseQuery,
        user_id: `eq.${job.created_by}`,
      },
    });
  }
  if (!rows?.length) {
    rows = await rest("memberships", {
      query: {
        ...baseQuery,
        order: "created_at.asc",
      },
    });
  }
  const membership = rows?.[0] || null;
  if (!membership) throw new Error(`active membership not found for worker job ${job.id}`);
  return membership;
}

async function getTeam(teamID) {
  const rows = await rest("teams", {
    query: {
      id: `eq.${teamID}`,
      limit: "1",
      select: "*",
    },
  });
  if (!rows?.[0]) throw new Error(`team not found: ${teamID}`);
  return rows[0];
}

async function getAuthUser(userID) {
  if (!userID) return null;
  try {
    return await authAdminFetch(`admin/users/${encodeURIComponent(userID)}`);
  } catch {
    return { id: userID, email: "", user_metadata: {} };
  }
}

async function companyProfileSnapshot(teamID, team, user, settings) {
  const [profileRows] = await Promise.all([
    rest("company_profiles", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    }),
  ]);
  return publicCompanyProfile({
    row: profileRows?.[0] || null,
    settings: settings || null,
    team,
    user,
  });
}

async function main() {
  const worker = createStartupOfficeLoopWorker({
    claimWorkerJob,
    loadWorkerJobContext,
    nowISO,
    recordUsageEvent,
    runLoop: runStartupOfficeLoop,
    truncateText,
    updateWorkerJob,
  });
  const result = await worker.processBatch({
    limit: Number(process.env.LAF_LOOP_WORKER_BATCH_SIZE || 5),
  });
  console.log(JSON.stringify(redactWorkerResult(result), null, 2));
}

async function recordUsageEvent({ context, result }) {
  await recordStartupOfficeUsageEvent({
    membership: context.membership,
    objectValue,
    result,
    safeStartupOfficeRest: repository().safeRest,
  });
}

function redactWorkerResult(result) {
  return {
    completed: result.completed,
    dead_letter: result.dead_letter,
    failed: result.failed,
    processed: result.processed,
    skipped: result.skipped,
    statuses: result.results.map((item) => ({
      job_id: item.job?.id || "",
      run_id: item.job?.run_id || "",
      status: item.status,
    })),
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function truncateText(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function shortID() {
  return crypto.randomBytes(5).toString("hex");
}

function nowISO() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
