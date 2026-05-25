#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const JWT_SECRET = "laf-office-startup-office-rls-test-secret-2026";
const IDS = Object.freeze({
  alphaActivationEvent: "70000000-0000-0000-0000-000000000001",
  alphaAsset: "30000000-0000-0000-0000-000000000001",
  alphaAuditEvent: "60000000-0000-0000-0000-000000000001",
  alphaBillingDocument: "6f000000-0000-0000-0000-000000000001",
  alphaCustomer: "65000000-0000-0000-0000-000000000001",
  alphaDeletionRequest: "6e000000-0000-0000-0000-000000000001",
  alphaArtifact: "62000000-0000-0000-0000-000000000001",
  alphaApproval: "63000000-0000-0000-0000-000000000001",
  alphaLoop: "61000000-0000-0000-0000-000000000001",
  alphaMemoryPage: "68000000-0000-0000-0000-000000000001",
  alphaMetric: "66000000-0000-0000-0000-000000000001",
  alphaNotification: "6b000000-0000-0000-0000-000000000001",
  alphaOutboxEvent: "6c000000-0000-0000-0000-000000000001",
  alphaReceipt: "64000000-0000-0000-0000-000000000001",
  alphaRun: "40000000-0000-0000-0000-000000000001",
  alphaSignal: "67000000-0000-0000-0000-000000000001",
  alphaSupportAccess: "6d000000-0000-0000-0000-000000000001",
  alphaTeam: "10000000-0000-0000-0000-000000000001",
  alphaTerms: "50000000-0000-0000-0000-000000000001",
  alphaUsageEvent: "6a000000-0000-0000-0000-000000000001",
  alphaUser: "00000000-0000-0000-0000-00000000a001",
  alphaWorkerJob: "69000000-0000-0000-0000-000000000001",
  betaActivationEvent: "70000000-0000-0000-0000-000000000002",
  betaAsset: "30000000-0000-0000-0000-000000000002",
  betaAuditEvent: "60000000-0000-0000-0000-000000000002",
  betaBillingDocument: "6f000000-0000-0000-0000-000000000002",
  betaCustomer: "65000000-0000-0000-0000-000000000002",
  betaDeletionRequest: "6e000000-0000-0000-0000-000000000002",
  betaArtifact: "62000000-0000-0000-0000-000000000002",
  betaApproval: "63000000-0000-0000-0000-000000000002",
  betaLoop: "61000000-0000-0000-0000-000000000002",
  betaMemoryPage: "68000000-0000-0000-0000-000000000002",
  betaMetric: "66000000-0000-0000-0000-000000000002",
  betaNotification: "6b000000-0000-0000-0000-000000000002",
  betaOutboxEvent: "6c000000-0000-0000-0000-000000000002",
  betaReceipt: "64000000-0000-0000-0000-000000000002",
  betaRun: "40000000-0000-0000-0000-000000000002",
  betaSignal: "67000000-0000-0000-0000-000000000002",
  betaSupportAccess: "6d000000-0000-0000-0000-000000000002",
  betaTeam: "10000000-0000-0000-0000-000000000002",
  betaTerms: "50000000-0000-0000-0000-000000000002",
  betaUsageEvent: "6a000000-0000-0000-0000-000000000002",
  betaUser: "00000000-0000-0000-0000-00000000b001",
  betaWorkerJob: "69000000-0000-0000-0000-000000000002",
});
const TERMS_VERSIONS = Object.freeze({
  ai_use_version: "startup-office-ai-use-2026-05-26",
  deletion_version: "startup-office-deletion-2026-05-26",
  dpa_version: "startup-office-dpa-2026-05-26",
  privacy_version: "startup-office-privacy-2026-05-26",
  retention_version: "startup-office-retention-2026-05-26",
  terms_version: "startup-office-beta-terms-2026-05-26",
});
const RLS_TEAM_TABLE_FIXTURES = Object.freeze([
  { alphaKey: IDS.alphaAuditEvent, betaKey: IDS.betaAuditEvent, keyColumn: "id", table: "audit_events" },
  { alphaKey: IDS.alphaTeam, betaKey: IDS.betaTeam, keyColumn: "team_id", table: "company_profiles" },
  { alphaKey: IDS.alphaTeam, betaKey: IDS.betaTeam, keyColumn: "team_id", table: "workspace_billing" },
  { alphaKey: IDS.alphaTeam, betaKey: IDS.betaTeam, keyColumn: "team_id", table: "workspace_settings" },
  { alphaKey: IDS.alphaActivationEvent, betaKey: IDS.betaActivationEvent, keyColumn: "id", table: "startup_office_activation_events" },
  { alphaKey: IDS.alphaApproval, betaKey: IDS.betaApproval, keyColumn: "id", table: "startup_office_approvals" },
  { alphaKey: IDS.alphaArtifact, betaKey: IDS.betaArtifact, keyColumn: "id", table: "startup_office_artifacts" },
  { alphaKey: IDS.alphaAsset, betaKey: IDS.betaAsset, keyColumn: "id", table: "startup_office_assets" },
  { alphaKey: IDS.alphaBillingDocument, betaKey: IDS.betaBillingDocument, keyColumn: "id", table: "startup_office_billing_documents" },
  { alphaKey: IDS.alphaCustomer, betaKey: IDS.betaCustomer, keyColumn: "id", table: "startup_office_customers" },
  { alphaKey: IDS.alphaDeletionRequest, betaKey: IDS.betaDeletionRequest, keyColumn: "id", table: "startup_office_deletion_requests" },
  { alphaKey: IDS.alphaLoop, betaKey: IDS.betaLoop, keyColumn: "id", table: "startup_office_loops" },
  { alphaKey: IDS.alphaMemoryPage, betaKey: IDS.betaMemoryPage, keyColumn: "id", table: "startup_office_memory_pages" },
  { alphaKey: IDS.alphaMetric, betaKey: IDS.betaMetric, keyColumn: "id", table: "startup_office_metrics" },
  { alphaKey: IDS.alphaNotification, betaKey: IDS.betaNotification, keyColumn: "id", table: "startup_office_notifications" },
  { alphaKey: IDS.alphaOutboxEvent, betaKey: IDS.betaOutboxEvent, keyColumn: "id", table: "startup_office_outbox_events" },
  { alphaKey: IDS.alphaReceipt, betaKey: IDS.betaReceipt, keyColumn: "id", table: "startup_office_receipts" },
  { alphaKey: IDS.alphaRun, betaKey: IDS.betaRun, keyColumn: "id", table: "startup_office_runs" },
  { alphaKey: IDS.alphaSignal, betaKey: IDS.betaSignal, keyColumn: "id", table: "startup_office_signals" },
  { alphaKey: IDS.alphaSupportAccess, betaKey: IDS.betaSupportAccess, keyColumn: "id", table: "startup_office_support_access_events" },
  { alphaKey: IDS.alphaTerms, betaKey: IDS.betaTerms, keyColumn: "id", table: "startup_office_terms_acceptances" },
  { alphaKey: IDS.alphaUsageEvent, betaKey: IDS.betaUsageEvent, keyColumn: "id", table: "startup_office_usage_events" },
  { alphaKey: IDS.alphaWorkerJob, betaKey: IDS.betaWorkerJob, keyColumn: "id", table: "startup_office_worker_jobs" },
]);
const RLS_CROSS_TENANT_INSERT_FIXTURES = Object.freeze([
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      name: "Cross tenant loop",
      slug: `cross-loop-${crypto.randomUUID()}`,
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_loops",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      objective: "Cross tenant run",
      team_id: IDS.betaTeam,
      title: "Cross tenant run",
    }),
    table: "startup_office_runs",
  },
  {
    body: () => ({
      content: "Cross tenant artifact",
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      run_id: IDS.betaRun,
      team_id: IDS.betaTeam,
      title: "Cross tenant artifact",
    }),
    table: "startup_office_artifacts",
  },
  {
    body: () => ({
      action: "approve_cross_tenant",
      artifact_id: IDS.betaArtifact,
      id: crypto.randomUUID(),
      requested_by: IDS.alphaUser,
      run_id: IDS.betaRun,
      team_id: IDS.betaTeam,
      title: "Cross tenant approval",
    }),
    table: "startup_office_approvals",
  },
  {
    body: () => ({
      approval_id: IDS.betaApproval,
      created_by: IDS.alphaUser,
      event_type: "cross_tenant_receipt",
      id: crypto.randomUUID(),
      run_id: IDS.betaRun,
      summary: "Cross tenant receipt",
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_receipts",
  },
  {
    body: () => ({
      body: "Cross tenant asset",
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      kind: "document",
      name: "Cross tenant asset",
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_assets",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      name: "Cross tenant customer",
      status: "lead",
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_customers",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      metric_key: `cross_metric_${crypto.randomUUID()}`,
      metric_value: 1,
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_metrics",
  },
  {
    body: () => ({
      body: "Cross tenant signal",
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      loop_id: IDS.betaLoop,
      run_id: IDS.betaRun,
      signal_type: "market",
      source: "cross_tenant_source",
      team_id: IDS.betaTeam,
      title: "Cross tenant signal",
    }),
    table: "startup_office_signals",
  },
  {
    body: () => ({
      body: "Cross tenant memory",
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      slug: `cross-memory-${crypto.randomUUID()}`,
      team_id: IDS.betaTeam,
      title: "Cross tenant memory",
    }),
    table: "startup_office_memory_pages",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      loop_slug: "beta-loop",
      run_id: IDS.betaRun,
      status: "queued",
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_worker_jobs",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      event_type: "granted",
      id: crypto.randomUUID(),
      reason: "Cross tenant support access",
      support_user_id: IDS.alphaUser,
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_support_access_events",
  },
  {
    body: () => ({
      id: crypto.randomUUID(),
      reason: "Cross tenant deletion request",
      requested_by: IDS.alphaUser,
      status: "queued",
      team_id: IDS.betaTeam,
    }),
    table: "startup_office_deletion_requests",
  },
]);
const RLS_CROSS_TENANT_UPDATE_FIXTURES = Object.freeze([
  { body: { name: "Mutated by alpha" }, key: IDS.betaTeam, keyColumn: "team_id", select: "team_id,name", table: "company_profiles" },
  { body: { team_lead_slug: "mutated-by-alpha" }, key: IDS.betaTeam, keyColumn: "team_id", select: "team_id,team_lead_slug", table: "workspace_settings" },
  { body: { name: "Mutated by alpha" }, key: IDS.betaLoop, keyColumn: "id", select: "id,team_id,name", table: "startup_office_loops" },
  { body: { title: "Mutated by alpha" }, key: IDS.betaRun, keyColumn: "id", select: "id,team_id,title", table: "startup_office_runs" },
  { body: { status: "approved" }, key: IDS.betaApproval, keyColumn: "id", select: "id,team_id,status", table: "startup_office_approvals" },
  { body: { name: "Mutated by alpha" }, key: IDS.betaAsset, keyColumn: "id", select: "id,team_id,name", table: "startup_office_assets" },
  { body: { name: "Mutated by alpha" }, key: IDS.betaCustomer, keyColumn: "id", select: "id,team_id,name", table: "startup_office_customers" },
  { body: { title: "Mutated by alpha" }, key: IDS.betaSignal, keyColumn: "id", select: "id,team_id,title", table: "startup_office_signals" },
  { body: { title: "Mutated by alpha" }, key: IDS.betaMemoryPage, keyColumn: "id", select: "id,team_id,title", table: "startup_office_memory_pages" },
  { body: { status: "failed" }, key: IDS.betaWorkerJob, keyColumn: "id", select: "id,team_id,status", table: "startup_office_worker_jobs" },
]);
const RLS_DIRECT_WRITE_BLOCK_FIXTURES = Object.freeze([
  {
    body: () => ({
      action: "client.audit",
      actor_user_id: IDS.alphaUser,
      id: crypto.randomUUID(),
      target_id: IDS.alphaTeam,
      target_type: "rls_fixture",
      team_id: IDS.alphaTeam,
    }),
    table: "audit_events",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      provider: "fake",
      model: "client-model",
      run_id: IDS.alphaRun,
      team_id: IDS.alphaTeam,
    }),
    table: "startup_office_usage_events",
  },
  {
    body: () => ({
      event_type: "client.notification",
      id: crypto.randomUUID(),
      recipient_user_id: IDS.alphaUser,
      team_id: IDS.alphaTeam,
    }),
    table: "startup_office_notifications",
  },
  {
    body: () => ({
      event_type: "client.outbox",
      id: crypto.randomUUID(),
      source_id: IDS.alphaReceipt,
      source_table: "startup_office_receipts",
      team_id: IDS.alphaTeam,
    }),
    table: "startup_office_outbox_events",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      document_type: "agreement",
      id: crypto.randomUUID(),
      provider: "manual",
      status: "signed",
      team_id: IDS.alphaTeam,
    }),
    table: "startup_office_billing_documents",
  },
  {
    body: () => ({
      created_by: IDS.alphaUser,
      id: crypto.randomUUID(),
      milestone: "second_loop_run",
      source_id: IDS.alphaRun,
      source_table: "startup_office_runs",
      team_id: IDS.alphaTeam,
    }),
    table: "startup_office_activation_events",
  },
]);

main().catch((err) => {
  console.error(`startup-office RLS live verification failed: ${err.message}`);
  process.exit(1);
});

async function main() {
  for (const command of ["initdb", "pg_ctl", "psql", "postgrest"]) {
    assertCommand(command);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "laf-rls-"));
  const dataDir = path.join(workDir, "pgdata");
  const pgPort = await freePort();
  const restPort = await freePort();
  let postgrestProcess = null;
  let postgresStarted = false;

  try {
    log("initializing temporary PostgreSQL cluster");
    run("initdb", ["-D", dataDir, "-A", "trust", "--username", "postgres"]);
    run("pg_ctl", [
      "-D",
      dataDir,
      "-o",
      `-p ${pgPort} -k ${workDir}`,
      "-w",
      "start",
    ], { stdio: "ignore" });
    postgresStarted = true;
    const adminURL = `postgres://postgres@127.0.0.1:${pgPort}/postgres`;
    log("bootstrapping Supabase-compatible auth roles");
    applyBootstrap(adminURL);
    log("applying Supabase migrations");
    applyMigrations(adminURL);
    log("granting PostgREST role privileges");
    applyPostMigrationGrants(adminURL);
    log("seeding cross-tenant RLS fixtures");
    seedTenantFixtures(adminURL);

    const postgrestConfig = path.join(workDir, "postgrest.conf");
    const postgrestDBURI = [
      "postgres",
      "://",
      "authenticator",
      ":",
      "authenticator",
      "@127.0.0.1:",
      String(pgPort),
      "/postgres",
    ].join("");
    fs.writeFileSync(
      postgrestConfig,
      [
        `db-uri = "${postgrestDBURI}"`,
        'db-schemas = "public"',
        'db-anon-role = "anon"',
        'server-host = "127.0.0.1"',
        `server-port = ${restPort}`,
        `jwt-secret = "${JWT_SECRET}"`,
      ].join("\n"),
    );
    postgrestProcess = spawn("postgrest", [postgrestConfig], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const postgrestLog = captureProcessOutput(postgrestProcess);
    postgrestProcess.on("error", (err) => {
      throw err;
    });
    log(`starting PostgREST on port ${restPort}`);
    await waitForPostgrest(restPort, postgrestLog);
    log("exercising anon, authenticated, and service_role RLS paths");
    await verifyRLS(`http://127.0.0.1:${restPort}`);
    console.log("startup-office RLS live verification passed");
  } finally {
    if (postgrestProcess) postgrestProcess.kill("SIGTERM");
    if (postgresStarted) {
      spawnSync("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"], {
        encoding: "utf8",
      });
    }
    fs.rmSync(workDir, { force: true, recursive: true });
  }
}

function assertCommand(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} is required for live RLS verification`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    stdio: "pipe",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return result.stdout || "";
}

function psql(databaseURL, sql) {
  run("psql", [databaseURL, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql]);
}

function psqlFile(databaseURL, filePath) {
  run("psql", [databaseURL, "-v", "ON_ERROR_STOP=1", "-q", "-f", filePath]);
}

function applyBootstrap(databaseURL) {
  psql(databaseURL, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator noinherit login password 'authenticator';
    grant anon, authenticated, service_role to authenticator;
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
        nullif(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
          ''
        )::uuid
      );
    $$;
  `);
}

function applyMigrations(databaseURL) {
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    log(`migration ${file}`);
    psqlFile(databaseURL, path.join(migrationsDir, file));
  }
}

function applyPostMigrationGrants(databaseURL) {
  psql(databaseURL, `
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
    grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
}

function seedTenantFixtures(databaseURL) {
  psql(databaseURL, `
    insert into auth.users (id, email)
    values
      ('${IDS.alphaUser}', 'alpha@example.test'),
      ('${IDS.betaUser}', 'beta@example.test');

    insert into public.teams (id, name, slug, created_by)
    values
      ('${IDS.alphaTeam}', 'Alpha Office', 'alpha-office', '${IDS.alphaUser}'),
      ('${IDS.betaTeam}', 'Beta Office', 'beta-office', '${IDS.betaUser}');

    insert into public.memberships (team_id, user_id, role, status)
    values
      ('${IDS.alphaTeam}', '${IDS.alphaUser}', 'owner', 'active'),
      ('${IDS.betaTeam}', '${IDS.betaUser}', 'owner', 'active');

    insert into public.workspace_billing (team_id, plan)
    values
      ('${IDS.alphaTeam}', 'closed_beta'),
      ('${IDS.betaTeam}', 'closed_beta');

    insert into public.workspace_settings (team_id, team_lead_slug)
    values
      ('${IDS.alphaTeam}', 'alpha-founder'),
      ('${IDS.betaTeam}', 'beta-founder');

    insert into public.audit_events (id, team_id, actor_user_id, action, target_type, target_id)
    values
      ('${IDS.alphaAuditEvent}', '${IDS.alphaTeam}', '${IDS.alphaUser}', 'alpha.audit', 'rls_fixture', '${IDS.alphaTeam}'),
      ('${IDS.betaAuditEvent}', '${IDS.betaTeam}', '${IDS.betaUser}', 'beta.audit', 'rls_fixture', '${IDS.betaTeam}');

    insert into public.company_profiles (team_id, name, description)
    values
      ('${IDS.alphaTeam}', 'Alpha Inc', 'Alpha private profile'),
      ('${IDS.betaTeam}', 'Beta Inc', 'Beta private profile');

    insert into public.startup_office_loops (id, team_id, slug, name, department, objective, created_by)
    values
      ('${IDS.alphaLoop}', '${IDS.alphaTeam}', 'alpha-loop', 'Alpha loop', 'Growth', 'Alpha objective', '${IDS.alphaUser}'),
      ('${IDS.betaLoop}', '${IDS.betaTeam}', 'beta-loop', 'Beta loop', 'Growth', 'Beta objective', '${IDS.betaUser}');

    insert into public.startup_office_runs (id, team_id, title, objective, status, created_by)
    values
      ('${IDS.alphaRun}', '${IDS.alphaTeam}', 'Alpha run', 'Alpha objective', 'queued', '${IDS.alphaUser}'),
      ('${IDS.betaRun}', '${IDS.betaTeam}', 'Beta run', 'Beta objective', 'queued', '${IDS.betaUser}');

    insert into public.startup_office_artifacts (id, team_id, run_id, kind, title, content, created_by)
    values
      ('${IDS.alphaArtifact}', '${IDS.alphaTeam}', '${IDS.alphaRun}', 'draft', 'Alpha artifact', 'Alpha private artifact', '${IDS.alphaUser}'),
      ('${IDS.betaArtifact}', '${IDS.betaTeam}', '${IDS.betaRun}', 'draft', 'Beta artifact', 'Beta private artifact', '${IDS.betaUser}');

    insert into public.startup_office_approvals (id, team_id, run_id, artifact_id, title, action, requested_by)
    values
      ('${IDS.alphaApproval}', '${IDS.alphaTeam}', '${IDS.alphaRun}', '${IDS.alphaArtifact}', 'Alpha approval', 'approve_alpha', '${IDS.alphaUser}'),
      ('${IDS.betaApproval}', '${IDS.betaTeam}', '${IDS.betaRun}', '${IDS.betaArtifact}', 'Beta approval', 'approve_beta', '${IDS.betaUser}');

    insert into public.startup_office_receipts (id, team_id, run_id, approval_id, event_type, summary, created_by)
    values
      ('${IDS.alphaReceipt}', '${IDS.alphaTeam}', '${IDS.alphaRun}', '${IDS.alphaApproval}', 'alpha_event', 'Alpha receipt', '${IDS.alphaUser}'),
      ('${IDS.betaReceipt}', '${IDS.betaTeam}', '${IDS.betaRun}', '${IDS.betaApproval}', 'beta_event', 'Beta receipt', '${IDS.betaUser}');

    insert into public.startup_office_assets (id, team_id, name, kind, body, status, created_by)
    values
      ('${IDS.alphaAsset}', '${IDS.alphaTeam}', 'Alpha asset', 'document', 'Alpha private asset', 'active', '${IDS.alphaUser}'),
      ('${IDS.betaAsset}', '${IDS.betaTeam}', 'Beta asset', 'document', 'Beta private asset', 'active', '${IDS.betaUser}');

    insert into public.startup_office_customers (id, team_id, name, status, notes, created_by)
    values
      ('${IDS.alphaCustomer}', '${IDS.alphaTeam}', 'Alpha customer', 'lead', 'Alpha customer note', '${IDS.alphaUser}'),
      ('${IDS.betaCustomer}', '${IDS.betaTeam}', 'Beta customer', 'lead', 'Beta customer note', '${IDS.betaUser}');

    insert into public.startup_office_metrics (id, team_id, metric_key, metric_value, unit, created_by)
    values
      ('${IDS.alphaMetric}', '${IDS.alphaTeam}', 'alpha_metric', 1, 'count', '${IDS.alphaUser}'),
      ('${IDS.betaMetric}', '${IDS.betaTeam}', 'beta_metric', 2, 'count', '${IDS.betaUser}');

    insert into public.startup_office_signals (id, team_id, loop_id, run_id, signal_type, source, title, body, created_by)
    values
      ('${IDS.alphaSignal}', '${IDS.alphaTeam}', '${IDS.alphaLoop}', '${IDS.alphaRun}', 'market', 'alpha_source', 'Alpha signal', 'Alpha private signal', '${IDS.alphaUser}'),
      ('${IDS.betaSignal}', '${IDS.betaTeam}', '${IDS.betaLoop}', '${IDS.betaRun}', 'market', 'beta_source', 'Beta signal', 'Beta private signal', '${IDS.betaUser}');

    insert into public.startup_office_memory_pages (id, team_id, slug, title, body, created_by)
    values
      ('${IDS.alphaMemoryPage}', '${IDS.alphaTeam}', 'alpha-memory', 'Alpha memory', 'Alpha private memory', '${IDS.alphaUser}'),
      ('${IDS.betaMemoryPage}', '${IDS.betaTeam}', 'beta-memory', 'Beta memory', 'Beta private memory', '${IDS.betaUser}');

    insert into public.startup_office_worker_jobs (id, team_id, run_id, loop_slug, status, created_by)
    values
      ('${IDS.alphaWorkerJob}', '${IDS.alphaTeam}', '${IDS.alphaRun}', 'alpha-loop', 'queued', '${IDS.alphaUser}'),
      ('${IDS.betaWorkerJob}', '${IDS.betaTeam}', '${IDS.betaRun}', 'beta-loop', 'queued', '${IDS.betaUser}');

    insert into public.startup_office_usage_events (
      id,
      team_id,
      run_id,
      event_type,
      provider,
      model,
      total_tokens,
      cost_cents,
      created_by
    )
    values
      ('${IDS.alphaUsageEvent}', '${IDS.alphaTeam}', '${IDS.alphaRun}', 'model_run', 'fake', 'alpha-model', 10, 1, '${IDS.alphaUser}'),
      ('${IDS.betaUsageEvent}', '${IDS.betaTeam}', '${IDS.betaRun}', 'model_run', 'fake', 'beta-model', 20, 2, '${IDS.betaUser}');

    insert into public.startup_office_notifications (id, team_id, recipient_user_id, event_type, status)
    values
      ('${IDS.alphaNotification}', '${IDS.alphaTeam}', '${IDS.alphaUser}', 'alpha.notification', 'pending'),
      ('${IDS.betaNotification}', '${IDS.betaTeam}', '${IDS.betaUser}', 'beta.notification', 'pending');

    insert into public.startup_office_outbox_events (
      id,
      team_id,
      source_table,
      source_id,
      event_type,
      status,
      created_by
    )
    values
      ('${IDS.alphaOutboxEvent}', '${IDS.alphaTeam}', 'startup_office_receipts', '${IDS.alphaReceipt}', 'alpha.outbox', 'queued', '${IDS.alphaUser}'),
      ('${IDS.betaOutboxEvent}', '${IDS.betaTeam}', 'startup_office_receipts', '${IDS.betaReceipt}', 'beta.outbox', 'queued', '${IDS.betaUser}');

    insert into public.startup_office_support_access_events (id, team_id, support_user_id, event_type, reason, created_by)
    values
      ('${IDS.alphaSupportAccess}', '${IDS.alphaTeam}', '${IDS.alphaUser}', 'granted', 'Alpha support reason', '${IDS.alphaUser}'),
      ('${IDS.betaSupportAccess}', '${IDS.betaTeam}', '${IDS.betaUser}', 'granted', 'Beta support reason', '${IDS.betaUser}');

    insert into public.startup_office_deletion_requests (id, team_id, requested_by, status, reason)
    values
      ('${IDS.alphaDeletionRequest}', '${IDS.alphaTeam}', '${IDS.alphaUser}', 'queued', 'Alpha deletion drill'),
      ('${IDS.betaDeletionRequest}', '${IDS.betaTeam}', '${IDS.betaUser}', 'queued', 'Beta deletion drill');

    insert into public.startup_office_billing_documents (id, team_id, document_type, status, provider, created_by)
    values
      ('${IDS.alphaBillingDocument}', '${IDS.alphaTeam}', 'agreement', 'signed', 'manual', '${IDS.alphaUser}'),
      ('${IDS.betaBillingDocument}', '${IDS.betaTeam}', 'agreement', 'signed', 'manual', '${IDS.betaUser}');

    insert into public.startup_office_activation_events (
      id,
      team_id,
      milestone,
      source_table,
      source_id,
      created_by
    )
    values
      ('${IDS.alphaActivationEvent}', '${IDS.alphaTeam}', 'first_loop_run', 'startup_office_runs', '${IDS.alphaRun}', '${IDS.alphaUser}'),
      ('${IDS.betaActivationEvent}', '${IDS.betaTeam}', 'first_loop_run', 'startup_office_runs', '${IDS.betaRun}', '${IDS.betaUser}');

    insert into public.startup_office_terms_acceptances (
      id,
      team_id,
      accepted_by,
      terms_version,
      privacy_version,
      dpa_version,
      ai_use_version,
      retention_version,
      deletion_version
    )
    values
      (
        '${IDS.alphaTerms}',
        '${IDS.alphaTeam}',
        '${IDS.alphaUser}',
        '${TERMS_VERSIONS.terms_version}',
        '${TERMS_VERSIONS.privacy_version}',
        '${TERMS_VERSIONS.dpa_version}',
        '${TERMS_VERSIONS.ai_use_version}',
        '${TERMS_VERSIONS.retention_version}',
        '${TERMS_VERSIONS.deletion_version}'
      ),
      (
        '${IDS.betaTerms}',
        '${IDS.betaTeam}',
        '${IDS.betaUser}',
        '${TERMS_VERSIONS.terms_version}',
        '${TERMS_VERSIONS.privacy_version}',
        '${TERMS_VERSIONS.dpa_version}',
        '${TERMS_VERSIONS.ai_use_version}',
        '${TERMS_VERSIONS.retention_version}',
        '${TERMS_VERSIONS.deletion_version}'
      );
  `);
}

async function verifyRLS(baseURL) {
  const alphaToken = jwt({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    sub: IDS.alphaUser,
  });
  const betaToken = jwt({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    sub: IDS.betaUser,
  });
  const serviceToken = jwt({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "service_role",
    sub: "00000000-0000-0000-0000-00000000ffff",
  });

  await verifyTeamTableReadIsolation(baseURL, {
    alphaToken,
    betaToken,
    serviceToken,
  });
  await verifyCrossTenantInsertIsolation(baseURL, { alphaToken });
  await verifyCrossTenantUpdateIsolation(baseURL, { alphaToken });
  await verifyDirectWritePolicyBlocks(baseURL, { alphaToken });

  const anonAssets = await rest(baseURL, "/startup_office_assets?select=id,name,team_id");
  assertRows(anonAssets, []);

  const anonTerms = await rest(baseURL, "/startup_office_terms_acceptances?select=id,team_id,terms_version");
  assertRows(anonTerms, []);

  const alphaAssets = await rest(baseURL, "/startup_office_assets?select=id,name,team_id", {
    token: alphaToken,
  });
  assertRows(alphaAssets, [{ id: IDS.alphaAsset, name: "Alpha asset", team_id: IDS.alphaTeam }]);

  const betaAssets = await rest(baseURL, "/startup_office_assets?select=id,name,team_id", {
    token: betaToken,
  });
  assertRows(betaAssets, [{ id: IDS.betaAsset, name: "Beta asset", team_id: IDS.betaTeam }]);

  const alphaProfiles = await rest(baseURL, "/company_profiles?select=team_id,name", {
    token: alphaToken,
  });
  assertRows(alphaProfiles, [{ name: "Alpha Inc", team_id: IDS.alphaTeam }]);

  const alphaTerms = await rest(
    baseURL,
    "/startup_office_terms_acceptances?select=id,team_id,terms_version",
    { token: alphaToken },
  );
  assertRows(alphaTerms, [
    { id: IDS.alphaTerms, team_id: IDS.alphaTeam, terms_version: TERMS_VERSIONS.terms_version },
  ]);

  const betaTerms = await rest(
    baseURL,
    "/startup_office_terms_acceptances?select=id,team_id,terms_version",
    { token: betaToken },
  );
  assertRows(betaTerms, [
    { id: IDS.betaTerms, team_id: IDS.betaTeam, terms_version: TERMS_VERSIONS.terms_version },
  ]);

  const directTermsInsert = await rest(baseURL, "/startup_office_terms_acceptances", {
    body: {
      ...TERMS_VERSIONS,
      accepted_by: IDS.alphaUser,
      team_id: IDS.alphaTeam,
      terms_version: "startup-office-beta-terms-direct-insert-test",
    },
    method: "POST",
    token: alphaToken,
  });
  if (directTermsInsert.ok) {
    throw new Error("authenticated user inserted terms acceptance directly despite RLS");
  }

  const inserted = await rest(baseURL, "/startup_office_assets?select=id,name,team_id", {
    body: {
      body: "Alpha user-created asset",
      kind: "document",
      name: "Alpha user asset",
      team_id: IDS.alphaTeam,
    },
    method: "POST",
    token: alphaToken,
  });
  if (!inserted.ok) throw new Error(`alpha same-team insert failed: ${inserted.text}`);
  assertRows(inserted.body, [{ name: "Alpha user asset", team_id: IDS.alphaTeam }], {
    ignoreID: true,
  });

  const serviceAssets = await rest(baseURL, "/startup_office_assets?select=id,name,team_id", {
    token: serviceToken,
  });
  if (!Array.isArray(serviceAssets)) {
    throw new Error(`service-role asset read failed: ${JSON.stringify(serviceAssets)}`);
  }
  const betaAsset = serviceAssets.find((row) => row.id === IDS.betaAsset);
  if (betaAsset?.name !== "Beta asset") {
    throw new Error("beta asset was modified by alpha user despite RLS");
  }
  if (serviceAssets.length < 3) {
    throw new Error("service_role did not bypass RLS to see all seeded and inserted assets");
  }

  const serviceTerms = await rest(baseURL, "/startup_office_terms_acceptances?select=id,team_id", {
    token: serviceToken,
  });
  if (!Array.isArray(serviceTerms) || serviceTerms.length < 2) {
    throw new Error("service_role did not bypass RLS to see all terms acceptances");
  }

  const alphaRuns = await rest(baseURL, "/startup_office_runs?select=id,title,team_id", {
    token: alphaToken,
  });
  assertRows(alphaRuns, [{ id: IDS.alphaRun, team_id: IDS.alphaTeam, title: "Alpha run" }]);
}

async function verifyTeamTableReadIsolation(baseURL, tokens) {
  for (const fixture of RLS_TEAM_TABLE_FIXTURES) {
    const select = fixture.keyColumn === "team_id"
      ? "team_id"
      : `${fixture.keyColumn},team_id`;
    const route = `/${fixture.table}?select=${select}`;
    const anonRows = await rest(baseURL, route);
    assertRows(anonRows, []);

    const alphaRows = await rest(baseURL, route, { token: tokens.alphaToken });
    assertTenantRows({
      expectedKey: fixture.alphaKey,
      expectedTeam: IDS.alphaTeam,
      fixture,
      label: "alpha",
      rows: alphaRows,
    });

    const betaRows = await rest(baseURL, route, { token: tokens.betaToken });
    assertTenantRows({
      expectedKey: fixture.betaKey,
      expectedTeam: IDS.betaTeam,
      fixture,
      label: "beta",
      rows: betaRows,
    });

    const serviceRows = await rest(baseURL, route, { token: tokens.serviceToken });
    assertTenantRows({
      allowOtherTeams: true,
      expectedKey: fixture.alphaKey,
      expectedTeam: IDS.alphaTeam,
      fixture,
      label: "service alpha",
      rows: serviceRows,
    });
    assertTenantRows({
      allowOtherTeams: true,
      expectedKey: fixture.betaKey,
      expectedTeam: IDS.betaTeam,
      fixture,
      label: "service beta",
      rows: serviceRows,
    });
  }
}

async function verifyCrossTenantInsertIsolation(baseURL, tokens) {
  for (const fixture of RLS_CROSS_TENANT_INSERT_FIXTURES) {
    const attempted = await rest(baseURL, `/${fixture.table}`, {
      body: fixture.body(),
      method: "POST",
      token: tokens.alphaToken,
    });
    if (attempted.ok) {
      throw new Error(`alpha user inserted a beta-team row into ${fixture.table} through RLS`);
    }
  }
}

async function verifyCrossTenantUpdateIsolation(baseURL, tokens) {
  for (const fixture of RLS_CROSS_TENANT_UPDATE_FIXTURES) {
    const patched = await rest(
      baseURL,
      `/${fixture.table}?${fixture.keyColumn}=eq.${fixture.key}&select=${fixture.select}`,
      {
        body: fixture.body,
        method: "PATCH",
        token: tokens.alphaToken,
      },
    );
    if (!patched.ok) {
      throw new Error(`cross-team update on ${fixture.table} should be filtered, not fail: ${patched.text}`);
    }
    assertRows(patched.body, []);
  }
}

async function verifyDirectWritePolicyBlocks(baseURL, tokens) {
  for (const fixture of RLS_DIRECT_WRITE_BLOCK_FIXTURES) {
    const attempted = await rest(baseURL, `/${fixture.table}`, {
      body: fixture.body(),
      method: "POST",
      token: tokens.alphaToken,
    });
    if (attempted.ok) {
      throw new Error(`authenticated user wrote directly to service-owned table ${fixture.table} despite RLS`);
    }
  }
}

function assertTenantRows({ allowOtherTeams = false, expectedKey, expectedTeam, fixture, label, rows }) {
  if (!Array.isArray(rows)) {
    throw new Error(`${label} ${fixture.table} expected rows, got ${JSON.stringify(rows)}`);
  }
  const seededRow = rows.find((row) => row[fixture.keyColumn] === expectedKey);
  if (!seededRow) {
    throw new Error(`${label} ${fixture.table} did not include seeded ${fixture.keyColumn} ${expectedKey}`);
  }
  if (!allowOtherTeams) {
    for (const row of rows) {
      if (row.team_id !== expectedTeam) {
        throw new Error(`${label} ${fixture.table} leaked row for team ${row.team_id}`);
      }
    }
  }
}

async function rest(baseURL, route, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseURL}${route}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method || "GET",
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.ok && options.method !== "POST" && options.method !== "PATCH") {
    return body;
  }
  return { body, ok: response.ok, status: response.status, text };
}

function assertRows(actual, expected, options = {}) {
  const rows = Array.isArray(actual?.body) ? actual.body : actual;
  if (!Array.isArray(rows)) throw new Error(`expected rows array, got ${JSON.stringify(actual)}`);
  if (rows.length !== expected.length) {
    throw new Error(`expected ${expected.length} rows, got ${rows.length}: ${JSON.stringify(rows)}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    for (const [key, value] of Object.entries(expected[index])) {
      if (options.ignoreID && key === "id") continue;
      if (rows[index][key] !== value) {
        throw new Error(`row ${index}.${key} expected ${value}, got ${rows[index][key]}`);
      }
    }
  }
}

function jwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function captureProcessOutput(child) {
  const chunks = [];
  const append = (chunk) => {
    chunks.push(Buffer.from(chunk));
    while (Buffer.concat(chunks).length > 12000) chunks.shift();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return () => Buffer.concat(chunks).toString("utf8");
}

async function waitForPostgrest(port, log) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 500).catch(() => null);
    if (response?.ok) return;
    if (log().includes("Fatal")) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`PostgREST did not become ready\n${log()}`);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function log(message) {
  console.error(`[startup-office rls] ${message}`);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
