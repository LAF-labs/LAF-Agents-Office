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
  alphaAsset: "30000000-0000-0000-0000-000000000001",
  alphaRun: "40000000-0000-0000-0000-000000000001",
  alphaTeam: "10000000-0000-0000-0000-000000000001",
  alphaTerms: "50000000-0000-0000-0000-000000000001",
  alphaUser: "00000000-0000-0000-0000-00000000a001",
  betaAsset: "30000000-0000-0000-0000-000000000002",
  betaRun: "40000000-0000-0000-0000-000000000002",
  betaTeam: "10000000-0000-0000-0000-000000000002",
  betaTerms: "50000000-0000-0000-0000-000000000002",
  betaUser: "00000000-0000-0000-0000-00000000b001",
});
const TERMS_VERSIONS = Object.freeze({
  ai_use_version: "startup-office-ai-use-2026-05-26",
  deletion_version: "startup-office-deletion-2026-05-26",
  dpa_version: "startup-office-dpa-2026-05-26",
  privacy_version: "startup-office-privacy-2026-05-26",
  retention_version: "startup-office-retention-2026-05-26",
  terms_version: "startup-office-beta-terms-2026-05-26",
});

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

    insert into public.company_profiles (team_id, name, description)
    values
      ('${IDS.alphaTeam}', 'Alpha Inc', 'Alpha private profile'),
      ('${IDS.betaTeam}', 'Beta Inc', 'Beta private profile');

    insert into public.startup_office_runs (id, team_id, title, objective, status, created_by)
    values
      ('${IDS.alphaRun}', '${IDS.alphaTeam}', 'Alpha run', 'Alpha objective', 'queued', '${IDS.alphaUser}'),
      ('${IDS.betaRun}', '${IDS.betaTeam}', 'Beta run', 'Beta objective', 'queued', '${IDS.betaUser}');

    insert into public.startup_office_assets (id, team_id, name, kind, body, status, created_by)
    values
      ('${IDS.alphaAsset}', '${IDS.alphaTeam}', 'Alpha asset', 'document', 'Alpha private asset', 'active', '${IDS.alphaUser}'),
      ('${IDS.betaAsset}', '${IDS.betaTeam}', 'Beta asset', 'document', 'Beta private asset', 'active', '${IDS.betaUser}');

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

  const crossTeamInsert = await rest(baseURL, "/startup_office_assets", {
    body: {
      body: "Cross tenant asset",
      kind: "document",
      name: "Cross tenant asset",
      team_id: IDS.betaTeam,
    },
    method: "POST",
    token: alphaToken,
  });
  if (crossTeamInsert.ok) {
    throw new Error("alpha user inserted a beta-team asset through RLS");
  }

  const betaPatch = await rest(
    baseURL,
    `/startup_office_assets?id=eq.${IDS.betaAsset}&select=id,name,team_id`,
    {
      body: { name: "Mutated by alpha" },
      method: "PATCH",
      token: alphaToken,
    },
  );
  if (!betaPatch.ok) throw new Error(`cross-team update should be filtered, not fail: ${betaPatch.text}`);
  assertRows(betaPatch.body, []);

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
