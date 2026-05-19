"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.SUPABASE_ANON_KEY = "anon";

const repoRoot = path.resolve(__dirname, "..");
const handler = require(path.join(repoRoot, "api", "index.js"));
const smokeScript = path.join(repoRoot, "scripts", "hosted-bridge-smoke.cjs");

test("hosted Bridge smoke runs against the real hosted API handler", async (t) => {
  const oldFetch = global.fetch;
  const db = createSmokeDB();
  global.fetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
  });

  const server = await startRealHostedAPI(t);
  const result = await runSmoke(server.apiURL, {
    LAF_SMOKE_SIGNUP: "1",
    LAF_SMOKE_TEAM_NAME: "Real Handler Smoke Team",
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(db.teams.length, 1);
  assert.equal(db.memberships.length, 1);
  assert.equal(db.bridge_devices.length, 1);
  assert.equal(db.bridge_devices[0].device_kind, "desktop");
  assert.equal(db.bridge_devices[0].status, "online");
  assert.deepEqual(db.bridge_devices[0].capabilities.provider_runtimes.sort(), [
    "claude-code",
    "codex",
  ]);
  assert.equal(db.tasks.length, 1);
  assert.equal(db.tasks[0].model_mode, "my_bridge");
  assert.equal(db.execution_plans.length, 1);
  assert.equal(db.execution_plans[0].device_id, db.bridge_devices[0].id);
  assert.equal(db.execution_plans[0].status, "completed");
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(db.execution_receipts[0].summary, "Hosted Bridge smoke completed");
  assert.equal(db.delivery_receipts.length, 1);
  assert.equal(db.execution_events.at(-1).event_type, "receipt.appended");
});

test("hosted Bridge CLI-mode smoke runs fake npx Bridge against the real hosted API handler", async (t) => {
  const oldFetch = global.fetch;
  const db = createSmokeDB();
  global.fetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
  });

  const server = await startRealHostedAPI(t);
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(server.apiURL, {
    LAF_FAKE_BRIDGE_RUNTIME: "claude-code",
    LAF_SMOKE_BRIDGE_CMD: "npx fake-bridge",
    LAF_SMOKE_MODE: "cli",
    LAF_SMOKE_SIGNUP: "1",
    LAF_SMOKE_TEAM_NAME: "Real Handler CLI Bridge Team",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(db.bridge_devices.length, 1);
  assert.equal(db.bridge_devices[0].device_kind, "desktop");
  assert.deepEqual(db.bridge_devices[0].capabilities.provider_runtimes, ["claude-code"]);
  assert.equal(db.execution_plans.length, 1);
  assert.equal(db.execution_plans[0].provider, "claude_code");
  assert.equal(db.execution_plans[0].status, "completed");
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(
    db.execution_receipts[0].summary,
    `Fake Bridge CLI completed plan ${db.execution_plans[0].id}`,
  );
});

test("hosted Bridge CLI-mode smoke runs packed npx laf-bridge with the real binary", async (t) => {
  const oldFetch = global.fetch;
  const db = createSmokeDB();
  global.fetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
  });

  const server = await startRealHostedAPI(t);
  const bridgeBinary = await buildLAFBridgeBinary(t);
  const bridgePackage = await packLAFBridgePackage(t);
  await assertPackedBridgeNpxSurface(bridgePackage, bridgeBinary);
  const providerPath = await writeFakeProviderPATH(t);
  const result = await runSmoke(server.apiURL, {
    LAF_BRIDGE_BINARY: bridgeBinary,
    LAF_BRIDGE_SKIP_POSTINSTALL: "1",
    LAF_SMOKE_BRIDGE_CMD: `npx --yes --package ${shellQuote(bridgePackage)} laf-bridge`,
    LAF_SMOKE_BRIDGE_PROVIDER: "fake",
    LAF_SMOKE_MODE: "cli",
    LAF_SMOKE_SIGNUP: "1",
    LAF_SMOKE_TEAM_NAME: "Packed Npx Bridge Team",
    PATH: `${providerPath}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(db.bridge_devices.length, 1);
  assert.equal(db.bridge_devices[0].device_kind, "desktop");
  assert.deepEqual(db.bridge_devices[0].capabilities.provider_runtimes, ["codex"]);
  assert.match(db.bridge_devices[0].capabilities.cli_details.codex.version, /codex smoke/);
  assert.equal(db.execution_plans.length, 1);
  assert.equal(db.execution_plans[0].provider, "codex");
  assert.equal(db.execution_plans[0].status, "completed");
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(
    db.execution_receipts[0].summary,
    "laf-bridge fake executor validated the plan without provider side effects",
  );
});

async function startRealHostedAPI(t) {
  const server = http.createServer(async (req, res) => {
    const requestURL = new URL(req.url || "/", "http://127.0.0.1");
    req.query = Object.fromEntries(requestURL.searchParams.entries());
    req.query.path = requestURL.pathname.replace(/^\/api\/?/, "");
    res.status = (statusCode) => {
      res.statusCode = statusCode;
      return res;
    };
    try {
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: err.message || "hosted API test error" }));
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  return { apiURL: `http://127.0.0.1:${address.port}/api` };
}

function createSmokeDB() {
  return {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    delivery_receipts: [],
    execution_events: [],
    execution_plans: [],
    execution_receipts: [],
    memberships: [],
    projects: [],
    tasks: [],
    teams: [],
    workspace_billing: [],
  };
}

function hostedFetch(db) {
  let authUser = null;
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;

    if (url.pathname === "/auth/v1/admin/users") {
      authUser = {
        id: "user-smoke",
        email: body.email,
        email_confirmed_at: "2026-05-19T00:00:00Z",
        user_metadata: body.user_metadata || {},
      };
      return jsonResponse(authUser);
    }
    if (url.pathname === "/auth/v1/token") {
      authUser ||= {
        id: "user-smoke",
        email: body.email,
        user_metadata: { name: "Smoke User" },
      };
      return jsonResponse({
        access_token: "smoke-access-token",
        expires_in: 3600,
        refresh_token: "smoke-refresh-token",
        token_type: "bearer",
        user: authUser,
      });
    }
    if (url.pathname === "/auth/v1/user") {
      return jsonResponse(authUser || {
        id: "user-smoke",
        email: "smoke@example.com",
        user_metadata: { name: "Smoke User" },
      });
    }
    if (url.pathname === "/realtime/v1/api/broadcast") {
      return jsonResponse({ ok: true });
    }

    const table = url.pathname.replace("/rest/v1/", "");
    if (!Object.hasOwn(db, table)) return jsonResponse([]);
    const method = init.method || "GET";
    if (method === "GET") {
      return jsonResponse(filterRows(db[table], url.searchParams));
    }
    if (method === "POST") {
      const row = {
        id: body.id || `${table}-${db[table].length + 1}`,
        ...body,
      };
      const conflict = url.searchParams.get("on_conflict");
      if (conflict) {
        const keys = conflict.split(",").map((key) => key.trim()).filter(Boolean);
        const existing = db[table].find((candidate) =>
          keys.every((key) => candidate[key] === row[key]),
        );
        if (existing) {
          Object.assign(existing, row);
          return jsonResponse([existing]);
        }
      }
      db[table].push(row);
      return jsonResponse([row]);
    }
    if (method === "PATCH") {
      const rows = filterRows(db[table], url.searchParams);
      for (const row of rows) Object.assign(row, body);
      return jsonResponse(rows);
    }
    if (method === "DELETE") {
      const rows = filterRows(db[table], url.searchParams);
      const selected = new Set(rows);
      db[table] = db[table].filter((row) => !selected.has(row));
      return jsonResponse(rows);
    }
    return jsonResponse([]);
  };
}

function filterRows(rows, params) {
  let result = rows.filter((row) => {
    for (const [key, raw] of params.entries()) {
      if (["limit", "on_conflict", "order", "select"].includes(key)) continue;
      if (raw.startsWith("eq.") && String(row[key]) !== raw.slice(3)) return false;
      if (raw.startsWith("in.(")) {
        const allowed = raw.slice(4, -1).split(",").map((value) => value.trim());
        if (!allowed.includes(String(row[key]))) return false;
      }
      if (raw.startsWith("not.in.(")) {
        const denied = raw.slice(8, -1).split(",").map((value) => value.trim());
        if (denied.includes(String(row[key]))) return false;
      }
    }
    return true;
  });
  const order = params.get("order") || "";
  if (order) {
    const [key, direction = "asc"] = order.split(".").map((part) => part.trim());
    result = [...result].sort((a, b) => {
      const left = String(a[key] || "");
      const right = String(b[key] || "");
      return direction === "desc" ? right.localeCompare(left) : left.localeCompare(right);
    });
  }
  const limit = Number(params.get("limit") || 0);
  return limit > 0 ? result.slice(0, limit) : result;
}

function runSmoke(apiURL, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAF_HOSTED_API_URL: apiURL,
        LAF_SMOKE_EMAIL: `smoke-${crypto.randomUUID()}@example.com`,
        LAF_SMOKE_MODE: "api",
        LAF_SMOKE_PASSWORD: "correct-horse-battery-staple",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

async function assertPackedBridgeNpxSurface(bridgePackage, bridgeBinary) {
  const env = {
    ...process.env,
    LAF_BRIDGE_BINARY: bridgeBinary,
    LAF_BRIDGE_SKIP_POSTINSTALL: "1",
  };
  const rootHelp = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
    "--help",
  ], { env });
  assert.equal(rootHelp.code, 0, rootHelp.stderr);
  assert.match(rootHelp.stdout, /usage:\s+laf-bridge\s+pair/i);
  assert.doesNotMatch(
    rootHelp.stdout,
    /(^|[\s|])(status|doctor|providers|bindings|start|mcp-context|link-project|unlink-project)([\s|]|$)/i,
  );

  const noArgsHelp = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
  ], { env });
  assert.equal(noArgsHelp.code, 0, noArgsHelp.stderr);
  assert.match(noArgsHelp.stdout, /usage:\s+laf-bridge\s+pair/i);
  assert.doesNotMatch(
    noArgsHelp.stdout,
    /(^|[\s|])(status|doctor|providers|bindings|start|mcp-context|link-project|unlink-project)([\s|]|$)/i,
  );

  const version = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
    "--version",
  ], { env });
  assert.equal(version.code, 0, version.stderr);
  assert.match(version.stdout, /\blaf-bridge v[0-9A-Za-z.+-]+\b/);

  const pairHelp = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
    "pair",
    "--help",
  ], { env });
  assert.equal(pairHelp.code, 0, pairHelp.stderr);
  assert.match(pairHelp.stdout, /setup code/i);
  assert.doesNotMatch(pairHelp.stdout, /-(api-url|code|start|once|public-key|identity-path)([=\s]|$)/i);

  const start = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
    "start",
  ], { env });
  assert.notEqual(start.code, 0);
  assert.match(`${start.stdout}\n${start.stderr}`, /npx exposes only `laf-bridge pair`/i);

  const pairFlags = await runCommand(npxCommand(), [
    "--yes",
    "--package",
    bridgePackage,
    "laf-bridge",
    "pair",
    "--api-url",
    "https://office.example.com/api",
    "--code",
    "TEST-CODE",
  ], { env });
  assert.notEqual(pairFlags.code, 0);
  assert.match(`${pairFlags.stdout}\n${pairFlags.stderr}`, /without pairing flags/i);
}

function runCommand(command, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function writeFakeBridgeCLI(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-real-api-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const file = path.join(dir, "fake-bridge.cjs");
  await fs.writeFile(file, fakeBridgeSource(), "utf8");
  return file;
}

async function buildLAFBridgeBinary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-real-bin-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const binaryPath = path.join(dir, process.platform === "win32" ? "laf-bridge.exe" : "laf-bridge");
  execFileSync("go", ["build", "-o", binaryPath, "./cmd/laf-bridge"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return binaryPath;
}

async function packLAFBridgePackage(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-real-pack-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const output = execFileSync("npm", ["pack", "--pack-destination", dir, "--ignore-scripts"], {
    cwd: path.join(repoRoot, "npm-bridge"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const filename = output.trim().split(/\r?\n/).at(-1);
  return path.join(dir, filename);
}

async function writeFakeProviderPATH(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-provider-path-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const name = process.platform === "win32" ? "codex.cmd" : "codex";
  const file = path.join(dir, name);
  if (process.platform === "win32") {
    await fs.writeFile(file, "@echo codex smoke 1.2.3\r\n", "utf8");
  } else {
    await fs.writeFile(file, "#!/bin/sh\necho 'codex smoke 1.2.3'\n", "utf8");
    await fs.chmod(file, 0o755);
  }
  return dir;
}

async function writeFakeNpxShim(t, fakeBridgePath) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-real-api-npx-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const file = path.join(dir, "npx");
  await fs.writeFile(file, fakeNpxSource(fakeBridgePath), "utf8");
  await fs.chmod(file, 0o755);
  return { dir, file };
}

function fakeNpxSource(fakeBridgePath) {
  return `#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

if (process.env.npm_config_yes !== "true") {
  console.error("fake-npx: npm_config_yes was not set for noninteractive smoke");
  process.exit(1);
}
if (process.argv[2] !== "fake-bridge") {
  console.error("fake-npx: unexpected package " + (process.argv[2] || ""));
  process.exit(1);
}
const result = spawnSync(process.execPath, [${JSON.stringify(fakeBridgePath)}, ...process.argv.slice(3)], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  console.error("fake-npx: " + result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
`;
}

function fakeBridgeSource() {
  return `#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const runtimeHome = process.env.LAF_OFFICE_RUNTIME_HOME;
if (!runtimeHome) fail("LAF_OFFICE_RUNTIME_HOME is required");
fs.mkdirSync(runtimeHome, { recursive: true });
const statePath = path.join(runtimeHome, "fake-bridge-state.json");

main().catch((err) => fail(err.message));

async function main() {
  const command = args[0];
  if (command === "pair") return pair();
  if (command === "start") fail("start must not be used by hosted Bridge smoke");
  fail("unsupported fake bridge command: " + command);
}

async function pair() {
  const decoded = decodeSetupCode(fs.readFileSync(0, "utf8").trim());
  const apiURL = decoded.apiURL;
  const code = decoded.code;
  if (args.length !== 1) fail("fake bridge expected exactly: laf-bridge pair");
  if (process.env.LAF_BRIDGE_ALLOW_INTERNAL_ARGS) {
    fail("hosted Bridge smoke must not enable internal npx args");
  }
  const deviceLabel = "Fake Smoke Bridge";
  const cliName = normalizeRuntime(process.env.LAF_FAKE_BRIDGE_RUNTIME || "codex");
  const claim = await request(apiURL, "bridge/pairing/claim", {
    method: "POST",
    body: {
      arch: process.arch,
      bridge_version: "fake-cli",
      capabilities: capabilities(cliName),
      code,
      device_label: deviceLabel,
      platform: process.platform,
      public_key: "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
    },
  });
  const state = {
    apiURL,
    deviceID: claim.device.id,
    token: claim.bridge_token,
  };
  fs.writeFileSync(statePath, JSON.stringify(state));
  console.log("paired device " + claim.device.id);
  await heartbeatAndRunPlans(state, cliName);
  while (true) {
    await sleep(100);
    await heartbeatAndRunPlans(state, cliName);
  }
}

async function heartbeatAndRunPlans(state, cliName) {
  cliName = cliName || normalizeRuntime(process.env.LAF_FAKE_BRIDGE_RUNTIME || "codex");
  await request(state.apiURL, "bridge/devices/" + encodeURIComponent(state.deviceID) + "/heartbeat", {
    method: "POST",
    token: state.token,
    body: {
      capabilities: capabilities(cliName),
      status: "online",
    },
  });
  const pending = await request(
    state.apiURL,
    "bridge/devices/" + encodeURIComponent(state.deviceID) + "/pending-plans",
    { token: state.token },
  );
  for (const plan of pending.plans || []) {
    await request(state.apiURL, "execution/plans/" + encodeURIComponent(plan.id) + "/ack", {
      method: "POST",
      token: state.token,
      body: { lease_seconds: 120 },
    });
    await request(state.apiURL, "execution/plans/" + encodeURIComponent(plan.id) + "/start", {
      method: "POST",
      token: state.token,
      body: { lease_seconds: 120, local_approval_status: "approved" },
    });
    await request(state.apiURL, "execution/plans/" + encodeURIComponent(plan.id) + "/events", {
      method: "POST",
      token: state.token,
      body: { event_type: "stdout", payload: { line: "fake cli event" }, sequence: 1 },
    });
    await request(state.apiURL, "execution/plans/" + encodeURIComponent(plan.id) + "/complete", {
      method: "POST",
      token: state.token,
      body: {
        changed_files: [],
        provider_version: "fake-cli",
        status: "completed",
        summary: "Fake Bridge CLI completed plan " + plan.id,
        test_results: [{ command: "fake-bridge-cli", status: "passed" }],
      },
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(apiURL, route, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = "Bearer " + options.token;
  const response = await fetch(apiURL.replace(/\\/+$/, "") + "/" + route, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) fail((options.method || "GET") + " " + route + " -> " + response.status + ": " + text);
  return body;
}

function capabilities(cliName) {
  return {
    cli_details: { [cliName]: { detected: true, version: "fake-" + cliName } },
    gh_authenticated: true,
    git_available: true,
    provider_runtimes: [cliName],
  };
}

function normalizeRuntime(value) {
  return String(value || "").replace(/_/g, "-") === "claude-code" ? "claude-code" : "codex";
}

function flag(name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) fail(name + " is required");
  return args[index + 1];
}

function decodeSetupCode(value) {
  if (!value) fail("setup code is required");
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  if (!payload.api_url || !payload.code) fail("invalid setup code");
  return { apiURL: payload.api_url, code: payload.code };
}

function fail(message) {
  console.error("fake-bridge:", message);
  process.exit(1);
}
`;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
