#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-api-performance.json";

function fail(message) {
  console.error(`startup-office api performance check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippet, label) {
  if (!read(relativePath).includes(snippet)) {
    fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

function percentile(sortedValues, p) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * p))] || 0;
}

function assertUnder(name, value, budget) {
  if (value > budget) {
    fail(`${name} ${value.toFixed(3)} exceeded budget ${budget}`);
  }
}

function coldRequireMs() {
  const result = spawnSync(process.execPath, ["-e", `
    const { performance } = require("node:perf_hooks");
    const t0 = performance.now();
    require("./api/[...path].js");
    process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
  `], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    fail("hosted facade cold require benchmark failed");
  }
  try {
    return Number(JSON.parse(result.stdout).ms);
  } catch {
    fail("hosted facade cold require benchmark returned invalid JSON");
  }
}

function createNoopHostedDispatcher() {
  const { createHostedAPIRouteDispatcher } = require("../api/lib/hosted/apiRouteDispatcher");
  const noop = async () => {};
  return createHostedAPIRouteDispatcher({
    activityHandlers: { actions: noop, decisions: noop, signals: noop, watchdogs: noop },
    agentLogHandlers: { agentLogs: noop },
    auditHandlers: { auditEvents: noop },
    authHandlers: { login: noop, me: noop, password: noop, session: noop },
    authorizeStartupOfficeAccess: async () => {},
    clearAuthCookies: () => {},
    clientTelemetryHandlers: { clientError: noop },
    commandHandlers: { commandRun: noop, commands: noop },
    conversationHandlers: {
      channelGenerate: noop,
      channels: noop,
      dmChannel: noop,
      homeSessions: noop,
      messageReaction: noop,
      messages: noop,
    },
    dispatchStartupOfficeRoute: async ({ path: routePath }) => String(routePath || "").startsWith("startup-office/"),
    healthHandlers: { dependencies: noop, health: noop },
    inviteHandlers: { inviteAccept: noop, inviteLookup: noop, invites: noop },
    memberHandlers: { authUsers: noop, permissions: noop },
    memoryHandlers: { memory: noop },
    modelAccess: { availability: noop },
    orchestrationHandlers: { orchestrationConfirm: noop, orchestrationIntent: noop },
    requireAdminRole: () => {},
    requirePermission: () => {},
    requireUser: async () => {},
    requestHandlers: { requestAnswer: noop, requests: noop },
    rosterHandlers: {
      channelMembers: noop,
      humans: noop,
      officeMemberGenerate: noop,
      officeMembers: noop,
      teams: noop,
    },
    schedulerHandlers: { scheduler: noop },
    signupHandlers: { signup: noop },
    skillHandlers: { skillInvoke: noop, skills: noop },
    startupOfficeRouteHandlers: {},
    usageHandlers: { usage: noop },
    workspaceConfigHandlers: { config: noop, onboardingComplete: noop, onboardingState: noop },
    writeJSON: () => {},
  });
}

async function hostedDispatchP95Us(paths) {
  const dispatcher = createNoopHostedDispatcher();
  const samples = [];
  for (let index = 0; index < 2500; index += 1) {
    for (const routePath of paths) {
      const req = { method: routePath.includes("invoke") ? "POST" : "GET" };
      const t0 = performance.now();
      await dispatcher.dispatch(req, {}, routePath);
      samples.push((performance.now() - t0) * 1000);
    }
  }
  samples.sort((a, b) => a - b);
  return percentile(samples, 0.95);
}

function startupOfficeRouteMatchP95Us() {
  const {
    matchStartupOfficeRoute,
  } = require("../api/lib/startup-office/dispatcher");
  const {
    STARTUP_OFFICE_ROUTE_CONTRACTS,
  } = require("../api/lib/startup-office/routes");
  const samples = [];
  const cases = [
    ["startup-office/loops", "GET"],
    ["startup-office/runs/run-1", "GET"],
    ["startup-office/approvals/approval-1/approve", "POST"],
    ["startup-office/admin/support-timeline", "GET"],
    ["startup-office/missing", "GET"],
  ];
  for (let index = 0; index < 5000; index += 1) {
    for (const [routePath, method] of cases) {
      const t0 = performance.now();
      matchStartupOfficeRoute(routePath, method);
      samples.push((performance.now() - t0) * 1000);
    }
  }
  samples.sort((a, b) => a - b);
  return {
    contractCount: STARTUP_OFFICE_ROUTE_CONTRACTS.length,
    p95us: percentile(samples, 0.95),
  };
}

async function main() {
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read(manifestPath));
  if (
    pkg.scripts?.["startup-office:api-performance"] !==
    "node scripts/check-startup-office-api-performance.cjs"
  ) {
    fail("package.json must expose startup-office:api-performance");
  }
  if (manifest.version !== "startup-office-api-performance.v1") {
    fail(`unexpected api performance manifest version ${manifest.version || "<missing>"}`);
  }
  const budgets = manifest.budgets || {};
  const coldMs = coldRequireMs();
  const hostedP95Us = await hostedDispatchP95Us(manifest.measured_paths || []);
  const startupMatch = startupOfficeRouteMatchP95Us();

  assertUnder("hosted facade cold require ms", coldMs, budgets.hosted_facade_cold_require_ms);
  assertUnder("hosted dispatch p95 us", hostedP95Us, budgets.hosted_dispatch_p95_us);
  assertUnder("startup office route match p95 us", startupMatch.p95us, budgets.startup_office_route_match_p95_us);
  assertUnder("startup office route contract count", startupMatch.contractCount, budgets.startup_office_route_contract_max);

  for (const [relativePath, snippet, label] of [
    ["api/[...path].js", "createHostedAPIEntrypoint", "hosted API facade"],
    ["api/lib/hosted/apiRouteDispatcher.js", "dispatchStartupOfficeRoute({", "hosted dispatcher Startup Office delegation"],
    ["api/lib/startup-office/dispatcher.js", "matchStartupOfficeRoute", "Startup Office route matcher"],
    ["scripts/startup-office-beta-release-gate.cjs", "\"startup-office:api-performance\"", "release gate"],
    ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
  ]) {
    assertContains(relativePath, snippet, label);
  }

  console.log(
    "startup-office api performance check passed: " +
      `cold=${coldMs.toFixed(3)}ms hostedDispatchP95=${hostedP95Us.toFixed(3)}us ` +
      `startupRouteP95=${startupMatch.p95us.toFixed(3)}us contracts=${startupMatch.contractCount}`,
  );
}

main().catch((err) => fail(err?.message || String(err)));
