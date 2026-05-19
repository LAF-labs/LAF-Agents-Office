#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const mode = (process.env.LAF_SMOKE_MODE || "api").trim().toLowerCase();
const apiURL = normalizeAPIURL(
  process.env.LAF_HOSTED_API_URL ||
    process.env.LAF_OFFICE_HOSTED_API_URL ||
    process.env.LAF_SMOKE_API_URL ||
    "",
);
const email = (process.env.LAF_SMOKE_EMAIL || "").trim();
const password = process.env.LAF_SMOKE_PASSWORD || "";
const signup = truthy(process.env.LAF_SMOKE_SIGNUP);
const smokeID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const repoURL =
  process.env.LAF_SMOKE_REPO_URL ||
  "https://github.com/LAF-labs/LAF-Agents-Office";
const bridgeCommand =
  process.env.LAF_SMOKE_BRIDGE_CMD || "npx --yes laf-bridge@latest";
const legacyRunnerPackage = ["laf", "runner"].join("-");
const legacyPairingFlowPattern = new RegExp(
  [
    legacyRunnerPackage,
    "\\b" + "runner" + "\\s+pair\\b",
    "\\b" + "runner" + "\\s+start\\b",
    "--api-url",
    "--code",
  ].join("|"),
  "i",
);
const hostedCommandLegacyCopyPattern = new RegExp(
  "\\b(?:broker|localhost|local-first|" +
    legacyRunnerPackage +
    "|runner)\\b|local deployment\\/simulation",
  "i",
);
const browserOrigin = normalizeOptionalBrowserOrigin(
  process.env.LAF_SMOKE_BROWSER_ORIGIN || "",
);
const internalBridgeCommandTokens = [
  "pair",
  "start",
  "status",
  "doctor",
  "providers",
  "bindings",
  "link-project",
  "unlink-project",
  "mcp-context",
];

const cookies = new Map();
let runtimeHome = "";
let createdRuntimeHome = false;
let bridgeChild = null;
let bridgeChildExit = null;
let bridgeOutput = "";

main().catch((err) => {
  console.error(`[hosted-bridge-smoke] FAIL: ${err.message}`);
  if (err.details) console.error(err.details);
  process.exit(1);
});

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) usage("", 0);
  if (!apiURL) usage("LAF_HOSTED_API_URL is required");
  if (!email || !password) usage("LAF_SMOKE_EMAIL and LAF_SMOKE_PASSWORD are required");
  if (mode !== "api" && mode !== "cli") usage("LAF_SMOKE_MODE must be api or cli");
  if (mode === "cli") validateBridgeCommandBase(bridgeCommand);

  log(`target ${apiURL}`);
  log(`mode ${mode}`);
  const health = await request("health", { useCookies: false });
  assert(
    health.body?.service === "laf-hosted-api",
    `target API did not identify as laf-hosted-api: ${JSON.stringify(health.body)}`,
  );
  await assertBrowserOriginPreflight();
  await authenticate();
  await assertSessionRestored();
  await assertHostedCommandRegistry();
  await assertHostedCommandRunBoundary();
  await assertLegacyRunnerRoutesRemoved();

  const initialAvailability = await request("bridge/availability");
  assertBridgeOnlyAvailability(initialAvailability.body, {
    context: "initial bridge availability",
  });

  const pairing = await request("bridge/pairing/start", {
    method: "POST",
    body: { api_url: apiURL },
  });
  const commandKeys = Object.keys(pairing.body?.commands || {}).sort();
  assert(
    commandKeys.length === 1 && commandKeys[0] === "pair",
    `pairing response must expose only commands.pair: ${commandKeys.join(", ") || "<none>"}`,
  );
  const pairCommand = pairing.body?.commands?.pair || "";
  assert(
    pairCommand === "npx laf-bridge pair",
    `pair command must be exactly "npx laf-bridge pair": ${pairCommand}`,
  );
  assert(
    !legacyPairingFlowPattern.test(pairCommand),
    "pair command exposes legacy or flagged pairing flow",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(pairing.body?.pairing || {}, "code"),
    "pairing response exposed raw pairing code",
  );
  assert(
    pairing.body?.commands?.setup === undefined,
    "pairing response exposed a duplicate Bridge command alias",
  );
  assert(
    pairing.body?.commands?.start === undefined,
    "pairing response exposed a separate Bridge start command",
  );
  const setupCode = pairing.body?.pairing?.setup_code;
  assert(setupCode, "pairing response did not include a setup code");
  const setup = decodeSetupCode(setupCode);
  assert(setup.code, "setup code did not include a pairing code");
  assert(
    normalizeAPIURL(setup.apiURL) === apiURL,
    `setup code API URL mismatch: ${setup.apiURL}`,
  );

  let token = "";
  let device = null;
  let provider = "codex";
  let planSigningPublicKey = "";
  if (mode === "cli") {
    ({ token, device, provider } = await pairWithRealBridge(setupCode));
  } else {
    ({ token, device, planSigningPublicKey } = await pairWithSimulatedBridge(setup.code));
  }

  const availability = await request("bridge/availability");
  assertBridgeOnlyAvailability(availability.body, {
    context: "post-pair bridge availability",
    requireAvailable: true,
  });
  const runtimes = availability.body.my_bridge.runtimes || [];
  if (mode === "api") {
    assert(runtimes.includes("codex"), `simulated Bridge runtimes missing codex: ${runtimes.join(", ")}`);
  }

  const project = await request("projects", {
    method: "POST",
    body: {
      action: "create",
      github_repo_url: repoURL,
      name: `Hosted Bridge Smoke ${smokeID}`,
    },
  });
  const projectID = project.body?.project?.id;
  assert(projectID, "project creation did not return project.id");

  const task = await request("tasks", {
    method: "POST",
    body: {
      action: "create",
      model_mode: "my_bridge",
      owner: "be",
      project_id: projectID,
      title: `Hosted Bridge smoke ${smokeID}`,
    },
  });
  const taskID = task.body?.task?.id;
  assert(taskID, "task creation did not return task.id");
  assert(
    task.body?.task?.execution_mode === "managed_checkout",
    `task response did not use managed_checkout for the smoke repo project: ${task.body?.task?.execution_mode || "<missing>"}`,
  );
  assert(
    !Object.prototype.hasOwnProperty.call(task.body?.task || {}, "worktree_path"),
    "task response exposed local worktree_path",
  );
  assert(!Object.prototype.hasOwnProperty.call(task.body, "runner_job"), "task response exposed runner_job");

  const plan = await request("execution/plans", {
    method: "POST",
    body: {
      device_id: device.id,
      message:
        mode === "cli"
          ? "This is a LAF Bridge live smoke test. Do not change files. Reply with a concise success receipt."
          : "Simulate a LAF Bridge smoke execution and return a concise receipt.",
      mode: "my_bridge",
      provider,
      task_id: taskID,
    },
  });
  const planID = plan.body?.plan?.id;
  assert(planID, "execution plan creation did not return plan.id");
  assert(plan.body.plan.device_id === device.id, "execution plan did not target the paired Bridge device");
  assert(
    !Object.prototype.hasOwnProperty.call(plan.body.plan, "binding_id"),
    "execution plan response exposed legacy binding_id",
  );
  const signedRepoURL = plan.body.plan.policy?.github_repo_url || "";
  assert(
    normalizeRepoForCompare(signedRepoURL) === normalizeRepoForCompare(repoURL),
    `execution plan did not include the signed project GitHub repo URL: ${signedRepoURL || "<missing>"}`,
  );
  assert(
    plan.body.plan.policy?.project_slug,
    "execution plan did not include the hosted project slug",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(plan.body.plan.policy || {}, "project_local_id"),
    "execution plan policy exposed legacy project_local_id",
  );

  if (mode === "cli") {
    const fetched = await waitForCompletedCLIPlan(planID);
    assert(
      fetched.body?.plan?.status === "completed",
      `CLI Bridge execution did not complete: ${fetched.body?.plan?.status || "unknown"}`,
    );
    assertCLIReceiptVisible(fetched.body?.receipt);
    await assertExecutionEventsVisible(planID);
    stopBridgeChild();
  } else {
    await completePlanThroughAPI({ device, planID, planSigningPublicKey, token });
  }

  log("PASS hosted Bridge smoke completed");
}

function assertBridgeOnlyAvailability(
  body,
  { context, requireAvailable = false } = {},
) {
  const label = context || "bridge availability";
  assert(body?.my_bridge, `${label} missing my_bridge`);
  assert(
    !Object.prototype.hasOwnProperty.call(body, "team_bridge"),
    `${label} exposed legacy team_bridge availability`,
  );
  const available = body.my_bridge.available === true;
  if (requireAvailable) {
    assert(
      available,
      `${label} unavailable: ${body.my_bridge.reason || "unknown"}`,
    );
  } else if (!available) {
    assert(
      String(body.my_bridge.reason || "").trim(),
      `${label} unavailable without a reason`,
    );
  }
  assert(
    Array.isArray(body.my_bridge.runtimes),
    `${label} my_bridge.runtimes must be an array`,
  );
}

async function authenticate() {
  if (signup) {
    log("signing up smoke user");
    const response = await request("auth/signup", {
      method: "POST",
      body: {
        email,
        name: process.env.LAF_SMOKE_NAME || "Hosted Bridge Smoke",
        password,
        team_action: "create",
        team_name: process.env.LAF_SMOKE_TEAM_NAME || `Bridge Smoke ${smokeID}`,
      },
      headers: browserOrigin ? { Origin: browserOrigin } : {},
      useCookies: false,
    });
    assertBrowserAuthCookies(response.headers);
    return;
  }
  log("logging in smoke user");
  const response = await request("auth/login", {
    method: "POST",
    body: { email, password },
    headers: browserOrigin ? { Origin: browserOrigin } : {},
    useCookies: false,
  });
  assertBrowserAuthCookies(response.headers);
}

async function assertSessionRestored() {
  log("verifying hosted auth session cookie");
  const session = await request("auth/session", {
    headers: browserOrigin ? { Origin: browserOrigin } : {},
  });
  assertBrowserCredentialedResponse(session.headers);
  assert(session.body?.authenticated === true, "auth session was not restored from hosted cookies");
  assert(
    String(session.body?.user?.email || "").toLowerCase() === email.toLowerCase(),
    `auth session restored the wrong user: ${session.body?.user?.email || "<missing>"}`,
  );
}

async function assertHostedCommandRegistry() {
  log("verifying hosted slash command registry");
  const response = await request("commands");
  const commands = Array.isArray(response.body) ? response.body : [];
  assert(commands.length > 0, "hosted /commands returned no slash commands");
  const names = commands.map((command) => String(command?.name || "").trim()).filter(Boolean);
  for (const required of ["ask", "tasks", "provider"]) {
    assert(names.includes(required), `hosted /commands missing /${required}`);
  }
  for (const hidden of [
    "deploy-simulation",
    "fix-bug",
    "focus",
    "collab",
    "pause",
    "resume",
    "reset",
  ]) {
    assert(!names.includes(hidden), `hosted /commands exposed unsupported /${hidden}`);
  }
  for (const command of commands) {
    assert(command.webSupported === true, `hosted /${command.name || "<unknown>"} is not web-supported`);
    assert(
      !hostedCommandLegacyCopyPattern.test(`${command.name || ""} ${command.description || ""}`),
      `hosted /${command.name || "<unknown>"} exposed local or legacy execution wording`,
    );
  }
}

async function assertHostedCommandRunBoundary() {
  log("verifying hosted slash command execution boundary");
  const unsupported = await request("commands/run", {
    method: "POST",
    body: {
      channel: "general",
      input: "/deploy-simulation --provider codex",
    },
    expectStatus: 400,
  });
  assert(
    unsupported.body?.error === "slash command is not available in the hosted workspace",
    `unsupported hosted slash command returned unexpected error: ${unsupported.body?.error || "<missing>"}`,
  );
  const handledByWeb = await request("commands/run", {
    method: "POST",
    body: {
      channel: "general",
      input: "/tasks",
    },
    expectStatus: 400,
  });
  assert(
    handledByWeb.body?.error === "slash command is handled directly in the web workspace",
    `web-handled slash command returned unexpected error: ${handledByWeb.body?.error || "<missing>"}`,
  );
}

async function assertLegacyRunnerRoutesRemoved() {
  log("verifying legacy local execution API routes are removed");
  for (const probe of [
    { method: "GET", route: "runner/status" },
    { method: "POST", route: "runner/pairing/start" },
    { method: "POST", route: "runner/register" },
    { method: "POST", route: "runner/jobs/lease" },
  ]) {
    const response = await request(probe.route, {
      method: probe.method,
      expectStatus: 404,
    });
    assert(
      /not found/i.test(String(response.body?.error || "")),
      `legacy local execution route ${probe.method} /${probe.route} returned unexpected body: ${JSON.stringify(response.body)}`,
    );
  }
}

async function assertBrowserOriginPreflight() {
  if (!browserOrigin) return;
  log(`verifying credentialed browser preflight for ${browserOrigin}`);
  const response = await request("bridge/pairing/start", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Headers": "Content-Type",
      "Access-Control-Request-Method": "POST",
      Origin: browserOrigin,
    },
    useCookies: false,
  });
  assert(response.status === 204, `browser preflight returned ${response.status}`);
  assert(
    response.headers.get("access-control-allow-origin") === browserOrigin,
    `browser preflight did not allow origin ${browserOrigin}`,
  );
  assert(
    response.headers.get("access-control-allow-credentials") === "true",
    "browser preflight did not allow credentials",
  );
  assert(
    /\bPOST\b/i.test(response.headers.get("access-control-allow-methods") || ""),
    "browser preflight did not allow POST",
  );
  assert(
    /(^|,\s*)Content-Type(\s*,|$)/i.test(response.headers.get("access-control-allow-headers") || ""),
    "browser preflight did not allow Content-Type",
  );
}

async function pairWithSimulatedBridge(code) {
  log("claiming setup code with simulated Bridge");
  const claim = await request("bridge/pairing/claim", {
    method: "POST",
    useCookies: false,
    body: {
      arch: process.arch,
      bridge_version: "smoke-api",
      capabilities: {
        cli_details: {
          codex: { detected: true, version: "smoke-codex" },
          "claude-code": { detected: true, version: "smoke-claude" },
        },
        provider_runtimes: ["codex", "claude-code"],
      },
      code,
      device_label: `Smoke API Bridge ${smokeID}`,
      platform: process.platform,
      public_key: crypto.randomBytes(32).toString("base64"),
    },
  });
  const token = claim.body?.bridge_token;
  const device = claim.body?.device;
  const planSigningPublicKey = claim.body?.plan_signing_public_key;
  assert(token, "pairing claim did not return bridge_token");
  assert(device?.id, "pairing claim did not return device.id");
  assert(planSigningPublicKey, "pairing claim did not return plan_signing_public_key");
  await request(`bridge/devices/${encodeURIComponent(device.id)}/heartbeat`, {
    method: "POST",
    token,
    useCookies: false,
    body: {
      capabilities: {
        cli_details: {
          codex: { detected: true, version: "smoke-codex" },
          "claude-code": { detected: true, version: "smoke-claude" },
        },
        gh_authenticated: true,
        git_available: true,
        provider_runtimes: ["codex", "claude-code"],
      },
      status: "online",
    },
  });
  return { token, device, planSigningPublicKey, provider: "codex" };
}

async function pairWithRealBridge(setupCode) {
  log(`pairing with real Bridge command: ${bridgeCommand}`);
  const timeoutMS = bridgeCommandTimeoutMS();
  runtimeHome =
    process.env.LAF_OFFICE_RUNTIME_HOME ||
    fs.mkdtempSync(path.join(os.tmpdir(), "laf-bridge-smoke-"));
  createdRuntimeHome = !process.env.LAF_OFFICE_RUNTIME_HOME;
  const beforeDevices = await request("bridge/devices");
  const beforeIDs = new Set((beforeDevices.body?.devices || []).map((device) => device.id));
  spawnBridge(["pair"], `${setupCode}\n`);
  const device = await waitForCondition(
    "new real Bridge device to appear online",
    async () => {
      const devices = await request("bridge/devices");
      return (devices.body?.devices || []).find(
        (candidate) =>
          candidate?.id &&
          !beforeIDs.has(candidate.id) &&
          candidate.status === "online",
      );
    },
    timeoutMS,
  );
  const deviceRuntimes = bridgeDeviceProviderRuntimes(device);
  const provider = providerFromRuntimes(deviceRuntimes);
  assert(
    provider,
    `paired Bridge did not report Codex or Claude CLI: ${deviceRuntimes.join(", ")}`,
  );
  await waitForCondition(
    `my_bridge availability to include paired Bridge provider ${provider}`,
    async () => {
      const availability = await request("bridge/availability");
      const availableRuntimes = availability.body?.my_bridge?.runtimes || [];
      return availableRuntimes.some(
        (runtime) => normalizeProviderRuntime(runtime) === normalizeProviderRuntime(provider),
      )
        ? availability
        : null;
    },
    timeoutMS,
  );
  return { token: "", device, provider };
}

async function waitForCompletedCLIPlan(planID) {
  return waitForCondition(
    `CLI Bridge to complete execution plan ${planID}`,
    async () => {
      const fetched = await request(`execution/plans/${encodeURIComponent(planID)}`);
      const status = fetched.body?.plan?.status;
      if (status === "completed" && fetched.body?.receipt) return fetched;
      return null;
    },
    bridgeCommandTimeoutMS(),
  );
}

function bridgeCommandTimeoutMS() {
  const value = Number(process.env.LAF_SMOKE_BRIDGE_TIMEOUT_MS || 180000);
  return Number.isFinite(value) && value > 0 ? value : 180000;
}

async function completePlanThroughAPI({ device, planID, planSigningPublicKey, token }) {
  const changedFiles = [{ path: "README.md", status: "M" }];
  const artifacts = [
    {
      title: "Hosted Bridge smoke PR",
      type: "pull_request",
      url: "https://github.com/LAF-labs/LAF-Agents-Office/pull/1",
    },
  ];
  const testResults = [{ command: "hosted-bridge-smoke", status: "passed" }];
  const pending = await request(`bridge/devices/${encodeURIComponent(device.id)}/pending-plans`, {
    token,
    useCookies: false,
  });
  const pendingPlan = (pending.body?.plans || []).find((candidate) => candidate.id === planID);
  assert(pendingPlan, "paired Bridge did not receive the pending execution plan");
  assertExecutionPlanSignature(pendingPlan, planSigningPublicKey);
  await request(`execution/plans/${encodeURIComponent(planID)}/ack`, {
    method: "POST",
    token,
    useCookies: false,
    body: { lease_seconds: 120 },
  });
  await request(`execution/plans/${encodeURIComponent(planID)}/start`, {
    method: "POST",
    token,
    useCookies: false,
    body: { lease_seconds: 120, local_approval_status: "approved" },
  });
  await request(`execution/plans/${encodeURIComponent(planID)}/events`, {
    method: "POST",
    token,
    useCookies: false,
    body: {
      event_type: "stdout",
      payload: { line: "hosted Bridge smoke event" },
      sequence: 1,
    },
  });
  const completed = await request(`execution/plans/${encodeURIComponent(planID)}/complete`, {
    method: "POST",
    token,
    useCookies: false,
    body: {
      artifacts,
      changed_files: changedFiles,
      provider_version: "smoke",
      status: "completed",
      summary: "Hosted Bridge smoke completed",
      test_results: testResults,
      usage: { output_tokens: 7 },
    },
  });
  assert(completed.body?.plan?.status === "completed", "plan did not complete");
  assert(completed.body?.receipt?.summary === "Hosted Bridge smoke completed", "receipt summary mismatch");
  assertReceiptArtifacts(completed.body?.receipt);
  const fetched = await request(`execution/plans/${encodeURIComponent(planID)}`);
  assert(fetched.body?.plan?.status === "completed", "completed plan was not visible to browser API");
  assert(fetched.body?.receipt?.summary === "Hosted Bridge smoke completed", "receipt was not visible to browser API");
  await assertExecutionEventsVisible(planID);
  assertReceiptArtifacts(fetched.body?.receipt);
}

async function assertExecutionEventsVisible(planID) {
  const events = await request(`execution/plans/${encodeURIComponent(planID)}/events`);
  const visibleEvents = events.body?.events || [];
  assert(Array.isArray(visibleEvents), "execution events response was not an array");
  assert(visibleEvents.length > 0, "execution logs were not visible through the browser API");
  assert(
    visibleEvents.some((event) => String(event?.event_type || "").trim()),
    "execution logs did not include event types",
  );
}

function assertCLIReceiptVisible(receipt) {
  assert(receipt, "completed CLI Bridge plan did not return a receipt");
  assert(String(receipt.summary || "").trim(), "completed CLI Bridge receipt did not include a summary");
}

function assertExecutionPlanSignature(plan, publicKeyPEM) {
  assert(publicKeyPEM, "pairing claim did not provide a plan signing public key");
  assert(plan.signature_alg === "ed25519", "execution plan signature algorithm was not ed25519");
  assert(plan.signature_key_id, "execution plan did not include signature_key_id");
  assert(plan.nonce, "execution plan did not include nonce");
  assert(plan.signature, "execution plan did not include signature");
  const canonical = canonicalExecutionPlanPayload(plan);
  const expectedHash = crypto.createHash("sha256").update(canonical).digest("hex");
  assert(plan.payload_hash === expectedHash, "execution plan payload hash mismatch");
  assert(
    crypto.verify(
      null,
      Buffer.from(canonical),
      crypto.createPublicKey(publicKeyPEM),
      Buffer.from(plan.signature, "base64"),
    ),
    "execution plan signature failed verification",
  );
}

function canonicalExecutionPlanPayload(plan) {
  const fields = [
    "id",
    "team_id",
    "project_id",
    "task_id",
    "actor_user_id",
    "executor_user_id",
    "device_id",
    "mode",
    "provider",
    "required_permissions",
    "effective_permissions",
    "context_refs",
    "prompt",
    "policy",
    "expires_at",
  ];
  const payload = {};
  for (const field of fields) payload[field] = canonicalPlanValue(plan[field] ?? null);
  payload.nonce = plan.nonce;
  return JSON.stringify(payload);
}

function canonicalPlanValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => canonicalPlanValue(entry) ?? null);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const entry = canonicalPlanValue(value[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  return value;
}

function assertReceiptArtifacts(receipt) {
  assert(
    Array.isArray(receipt?.changed_files) &&
      receipt.changed_files.some((item) => item?.path === "README.md"),
    "receipt did not expose changed file summary",
  );
  assert(
    Array.isArray(receipt?.artifacts) &&
      receipt.artifacts.some((item) => /github\.com\/LAF-labs\/LAF-Agents-Office\/pull\/1/.test(item?.url || "")),
    "receipt did not expose PR artifact",
  );
  assert(
    Array.isArray(receipt?.test_results) &&
      receipt.test_results.some((item) => item?.command === "hosted-bridge-smoke"),
    "receipt did not expose test results",
  );
}

function assertBrowserAuthCookies(headers) {
  if (!browserOrigin) return;
  const values = setCookieHeaders(headers);
  const joined = values.join("\n");
  assertBrowserCredentialedResponse(headers);
  assert(/laf_access=.*SameSite=None/i.test(joined), "laf_access cookie is not SameSite=None for split-origin auth");
  assert(/laf_access=.*Secure/i.test(joined), "laf_access cookie is not Secure for split-origin auth");
  assert(/laf_refresh=.*SameSite=None/i.test(joined), "laf_refresh cookie is not SameSite=None for split-origin auth");
}

function assertBrowserCredentialedResponse(headers) {
  if (!browserOrigin) return;
  assert(
    headers.get("access-control-allow-origin") === browserOrigin,
    "credentialed response did not allow the configured browser origin",
  );
  assert(
    headers.get("access-control-allow-credentials") === "true",
    "credentialed response did not allow browser cookies",
  );
}

async function request(route, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.useCookies !== false && cookies.size) {
    headers.Cookie = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  const url = `${apiURL}/${route.replace(/^\/+/, "")}`;
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  rememberCookies(response.headers);
  const text = await response.text();
  const body = text ? parseJSON(text, url) : {};
  if (options.expectStatus !== undefined) {
    const expected = new Set(
      Array.isArray(options.expectStatus) ? options.expectStatus : [options.expectStatus],
    );
    if (!expected.has(response.status)) {
      const err = new Error(
        `${method} ${url} -> ${response.status}, expected ${[...expected].join(" or ")}: ${body.error || text}`,
      );
      err.details = text;
      throw err;
    }
    return { body, headers: response.headers, status: response.status };
  }
  if (!response.ok) {
    const err = new Error(`${method} ${url} -> ${response.status}: ${body.error || text}`);
    err.details = text;
    throw err;
  }
  return { body, headers: response.headers, status: response.status };
}

function rememberCookies(headers) {
  const values = setCookieHeaders(headers);
  for (const value of values) {
    const first = value.split(";")[0];
    const index = first.indexOf("=");
    if (index <= 0) continue;
    const name = first.slice(0, index).trim();
    const cookieValue = first.slice(index + 1).trim();
    if (!cookieValue) cookies.delete(name);
    else cookies.set(name, cookieValue);
  }
}

function setCookieHeaders(headers) {
  return typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : splitSetCookie(headers.get("set-cookie") || "");
}

function splitSetCookie(raw) {
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function spawnBridge(args, stdinData = "") {
  if (!runtimeHome) {
    runtimeHome =
      process.env.LAF_OFFICE_RUNTIME_HOME ||
      fs.mkdtempSync(path.join(os.tmpdir(), "laf-bridge-smoke-"));
    createdRuntimeHome = !process.env.LAF_OFFICE_RUNTIME_HOME;
  }
  const invocation = bridgeCommandInvocation(args);
  bridgeChildExit = null;
  bridgeOutput = "";
  bridgeChild = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    encoding: "utf8",
    env: bridgeEnv(),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  bridgeChild.stdin.end(stdinData);
  bridgeChild.stdout.on("data", (chunk) => {
    const text = String(chunk);
    bridgeOutput += text;
    process.stdout.write(text);
  });
  bridgeChild.stderr.on("data", (chunk) => {
    const text = String(chunk);
    bridgeOutput += text;
    process.stderr.write(text);
  });
  bridgeChild.on("exit", (code, signal) => {
    bridgeChildExit = { code, signal };
  });
  bridgeChild.on("error", (err) => {
    bridgeChildExit = { code: null, error: err, signal: null };
  });
  return bridgeChild;
}

function validateBridgeCommandBase(command) {
  const tokens = shellishTokens(command);
  if (tokens.length === 0) {
    throw new Error("LAF_SMOKE_BRIDGE_CMD must not be empty");
  }
  if (tokens.some(hasShellControlSyntax)) {
    throw new Error(
      "LAF_SMOKE_BRIDGE_CMD must be a base command and must not include shell control syntax",
    );
  }
  const lowered = tokens.map((token) => token.toLowerCase());
  if (lowered.some((token) => token.includes(legacyRunnerPackage))) {
    throw new Error("LAF_SMOKE_BRIDGE_CMD must use the LAF Bridge package, not a legacy package");
  }
  if (tokens.some(looksLikeSetupCodeToken)) {
    throw new Error(
      "LAF_SMOKE_BRIDGE_CMD must be a base Bridge command and must not include setup codes",
    );
  }
  const forbiddenSubcommand = lowered.find((token) =>
    internalBridgeCommandTokens.includes(token),
  );
  if (forbiddenSubcommand) {
    throw new Error(
      `LAF_SMOKE_BRIDGE_CMD must be a base Bridge command without '${forbiddenSubcommand}'; the smoke appends 'pair' after verifying the hosted API exposes exactly 'npx laf-bridge pair'.`,
    );
  }
  const forbiddenFlag = lowered.find(
    (token) =>
      token === "--api-url" ||
      token.startsWith("--api-url=") ||
      token === "--code" ||
      token.startsWith("--code="),
  );
  if (forbiddenFlag) {
    throw new Error(
      `LAF_SMOKE_BRIDGE_CMD must not include internal pairing flag ${forbiddenFlag}`,
    );
  }
}

function bridgeCommandInvocation(args) {
  const tokens = shellishTokens(bridgeCommand);
  if (tokens.length === 0) {
    throw new Error("LAF_SMOKE_BRIDGE_CMD must not be empty");
  }
  return {
    args: [...tokens.slice(1), ...args],
    command: executableForCommand(tokens[0]),
  };
}

function executableForCommand(command, platform = process.platform) {
  if (platform === "win32" && (command === "npm" || command === "npx")) {
    return `${command}.cmd`;
  }
  return command;
}

function hasShellControlSyntax(token) {
  const value = String(token || "");
  return /[;&|<>`]/.test(value) || /\$\(|\$\{/.test(value);
}

function looksLikeSetupCodeToken(token) {
  const value = String(token || "").trim();
  if (!value) return false;
  if (/^[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+$/.test(value)) return true;
  if (value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value)) return true;
  return false;
}

function stopBridgeChild() {
  if (!bridgeChild) return;
  const child = bridgeChild;
  bridgeChild = null;
  if (!bridgeChildExit) {
    try {
      if (process.platform === "win32") {
        child.kill("SIGTERM");
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      // Best-effort shutdown only.
    }
  }
  child.stdout?.destroy?.();
  child.stderr?.destroy?.();
}

async function waitForCondition(label, fn, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (bridgeChildExit) {
      throw new Error(
        `Bridge command exited before ${label}: ${bridgeChildExit.error?.message || bridgeChildExit.signal || bridgeChildExit.code}\n${bridgeOutput}`,
      );
    }
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ""}`);
}

function bridgeEnv() {
  const env = {
    ...process.env,
    LAF_OFFICE_RUNTIME_HOME: runtimeHome,
  };
  delete env.LAF_BRIDGE_ALLOW_INTERNAL_ARGS;
  if (process.env.LAF_SMOKE_BRIDGE_PROVIDER && !env.LAF_BRIDGE_EXECUTION_PROVIDER) {
    env.LAF_BRIDGE_EXECUTION_PROVIDER = process.env.LAF_SMOKE_BRIDGE_PROVIDER;
  }
  if (/^\s*npx(\s|$)/.test(bridgeCommand) && !("npm_config_yes" in env)) {
    env.npm_config_yes = "true";
  }
  return env;
}

function bridgeDeviceProviderRuntimes(device) {
  const capabilities = device?.capabilities && typeof device.capabilities === "object"
    ? device.capabilities
    : {};
  const runtimes = Array.isArray(capabilities.provider_runtimes)
    ? capabilities.provider_runtimes
    : [];
  const cliDetails = capabilities.cli_details && typeof capabilities.cli_details === "object"
    ? capabilities.cli_details
    : {};
  const detailRuntimes = Object.entries(cliDetails)
    .filter(([, detail]) => cliDetailDetected(detail))
    .map(([name]) => name);
  return [...new Set([...runtimes, ...detailRuntimes].map(normalizeProviderRuntime).filter(Boolean))];
}

function cliDetailDetected(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(detail, "detected")) return true;
  const detected = detail.detected;
  if (typeof detected === "boolean") return detected;
  return !["", "0", "false", "no", "off"].includes(String(detected).trim().toLowerCase());
}

function normalizeProviderRuntime(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "claude") return "claude-code";
  if (normalized === "claude-code" || normalized === "codex") return normalized;
  return normalized;
}

function providerFromRuntimes(runtimes) {
  const normalized = new Set((runtimes || []).map(normalizeProviderRuntime));
  if (normalized.has("codex")) return "codex";
  if (normalized.has("claude-code")) return "claude_code";
  return "";
}

function decodeSetupCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  return {
    apiURL: String(payload.api_url || "").trim(),
    code: String(payload.code || "").trim(),
  };
}

function normalizeAPIURL(raw) {
  raw = String(raw || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/api")) {
    url.pathname = `${url.pathname}/api`.replace(/\/+/g, "/");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeOptionalBrowserOrigin(raw) {
  raw = String(raw || "").trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LAF_SMOKE_BROWSER_ORIGIN must be an origin without a path, query, or hash");
  }
  return `${url.protocol}//${url.host}`;
}

function normalizeRepoForCompare(raw) {
  return String(raw || "").trim().replace(/\.git$/, "").replace(/\/+$/, "").toLowerCase();
}

function parseJSON(text, url) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 300)}`);
  }
}

function shellishTokens(command) {
  const tokens = [];
  let token = "";
  let quote = "";
  for (const char of String(command || "")) {
    if (quote) {
      if (char === quote) quote = "";
      else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    token += char;
  }
  if (quote) {
    throw new Error("LAF_SMOKE_BRIDGE_CMD has an unterminated quote");
  }
  if (token) tokens.push(token);
  return tokens;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.log(`[hosted-bridge-smoke] ${message}`);
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function usage(message, code = 2) {
  if (message) {
    console.error(`[hosted-bridge-smoke] ${message}`);
    console.error("");
  }
  console.error("Required:");
  console.error("  LAF_HOSTED_API_URL=https://<your-vercel-app>/api");
  console.error("  LAF_SMOKE_EMAIL=<smoke-user-email>");
  console.error("  LAF_SMOKE_PASSWORD=<smoke-user-password>");
  console.error("");
  console.error("Optional:");
  console.error("  LAF_SMOKE_SIGNUP=1                 create the smoke user/team first");
  console.error("  LAF_SMOKE_MODE=api|cli             api is fast; cli runs the real Bridge command");
  console.error("  LAF_SMOKE_BROWSER_ORIGIN=https://app.example.com  verify credentialed browser CORS preflight");
  console.error("  LAF_SMOKE_BRIDGE_CMD='npx --yes laf-bridge@latest'  override the base Bridge command; do not include pair");
  console.error("  LAF_SMOKE_KEEP_RUNTIME=1           keep temporary Bridge config after cli mode");
  console.error("  LAF_SMOKE_REPO_URL=https://github.com/LAF-labs/LAF-Agents-Office");
  process.exit(code);
}

process.on("exit", () => {
  stopBridgeChild();
  if (createdRuntimeHome && runtimeHome && !truthy(process.env.LAF_SMOKE_KEEP_RUNTIME)) {
    try {
      fs.rmSync(runtimeHome, { force: true, recursive: true });
    } catch {
      // Best-effort cleanup only. A failed smoke should preserve the original error.
    }
  }
});
