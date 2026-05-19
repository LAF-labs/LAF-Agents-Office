"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const smokeScript = path.join(repoRoot, "scripts", "hosted-bridge-smoke.cjs");

test("hosted Bridge smoke script validates API-mode pairing and execution flow", async (t) => {
  const harness = await startMockHostedAPI(t, {
    browserOrigin: "https://app.laf.test",
  });
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BROWSER_ORIGIN: "https://app.laf.test",
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.deepEqual(harness.state.completedReceipt, {
    artifactURL: "https://github.com/LAF-labs/LAF-Agents-Office/pull/1",
    changedFile: "README.md",
    summary: "Hosted Bridge smoke completed",
    testCommand: "hosted-bridge-smoke",
    visibleToBrowser: true,
  });
  assert.deepEqual(
    harness.state.requests.filter((route) =>
      [
        "GET health",
        "OPTIONS bridge/pairing/start",
        "POST auth/login",
        "GET auth/session",
        "GET commands",
        "POST commands/run",
        "GET bridge/availability",
        "POST bridge/pairing/start",
        "POST bridge/pairing/claim",
        "POST bridge/devices/bridge-device-1/heartbeat",
        "POST projects",
        "POST tasks",
        "POST execution/plans",
        "GET bridge/devices/bridge-device-1/pending-plans",
        "POST execution/plans/plan-1/ack",
        "POST execution/plans/plan-1/start",
        "POST execution/plans/plan-1/events",
        "POST execution/plans/plan-1/complete",
        "GET execution/plans/plan-1",
        "GET execution/plans/plan-1/events",
      ].includes(route),
    ),
    [
      "GET health",
      "OPTIONS bridge/pairing/start",
      "POST auth/login",
      "GET auth/session",
      "GET commands",
      "POST commands/run",
      "POST commands/run",
      "GET bridge/availability",
      "POST bridge/pairing/start",
      "POST bridge/pairing/claim",
      "POST bridge/devices/bridge-device-1/heartbeat",
      "GET bridge/availability",
      "POST projects",
      "POST tasks",
      "POST execution/plans",
      "GET bridge/devices/bridge-device-1/pending-plans",
      "POST execution/plans/plan-1/ack",
      "POST execution/plans/plan-1/start",
      "POST execution/plans/plan-1/events",
      "POST execution/plans/plan-1/complete",
      "GET execution/plans/plan-1",
      "GET execution/plans/plan-1/events",
    ],
  );
});

test("hosted Bridge smoke script validates first-run signup flow", async (t) => {
  const harness = await startMockHostedAPI(t);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_SIGNUP: "1",
    LAF_SMOKE_TEAM_NAME: "First Run Bridge Team",
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(harness.state.authAction, "signup");
  assert.equal(harness.state.signupBody.team_action, "create");
  assert.equal(harness.state.signupBody.team_name, "First Run Bridge Team");
  assert.deepEqual(harness.state.completedReceipt, {
    artifactURL: "https://github.com/LAF-labs/LAF-Agents-Office/pull/1",
    changedFile: "README.md",
    summary: "Hosted Bridge smoke completed",
    testCommand: "hosted-bridge-smoke",
    visibleToBrowser: true,
  });
});

test("hosted Bridge smoke script validates CLI-mode Bridge pairing and execution through the default noninteractive npx latest command", async (t) => {
  const harness = await startMockHostedAPI(t, { expectedProvider: "claude_code" });
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(harness.apiURL, {
    LAF_EXPECT_NPX_PACKAGE: "laf-bridge@latest",
    LAF_FAKE_BRIDGE_RUNTIME: "claude-code",
    LAF_SMOKE_MODE: "cli",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(harness.state.completedReceipt.summary, "Fake Bridge CLI completed plan plan-1");
  assert.equal(harness.state.completedReceipt.visibleToBrowser, true);
  assertSubsequence(harness.state.requests, [
    "POST auth/login",
    "GET auth/session",
    "GET commands",
    "POST commands/run",
    "POST commands/run",
    "GET bridge/availability",
    "POST bridge/pairing/start",
    "GET bridge/devices",
    "POST bridge/pairing/claim",
    "GET bridge/devices",
    "GET bridge/availability",
    "POST projects",
    "POST tasks",
    "POST execution/plans",
    "GET bridge/devices/bridge-device-1/pending-plans",
    "POST execution/plans/plan-1/ack",
    "POST execution/plans/plan-1/start",
    "POST execution/plans/plan-1/events",
    "POST execution/plans/plan-1/complete",
    "GET execution/plans/plan-1",
    "GET execution/plans/plan-1/events",
  ]);
});

test("hosted Bridge smoke script supports deploy workflow npx latest command", async (t) => {
  const harness = await startMockHostedAPI(t);
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx --yes laf-bridge@latest",
    LAF_SMOKE_MODE: "cli",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(harness.state.completedReceipt.summary, "Fake Bridge CLI completed plan plan-1");
  assert.equal(harness.state.completedReceipt.visibleToBrowser, true);
});

test("hosted Bridge smoke script supports deploy workflow exact npx package command", async (t) => {
  const harness = await startMockHostedAPI(t);
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx --yes laf-bridge@1.2.3",
    LAF_SMOKE_MODE: "cli",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(harness.state.completedReceipt.summary, "Fake Bridge CLI completed plan plan-1");
  assert.equal(harness.state.completedReceipt.visibleToBrowser, true);
});

test("hosted Bridge smoke script allows lowercase hyphenated npx package commands", async (t) => {
  const harness = await startMockHostedAPI(t);
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx fake-bridge",
    LAF_SMOKE_MODE: "cli",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
  assert.equal(harness.state.completedReceipt.summary, "Fake Bridge CLI completed plan plan-1");
});

test("hosted Bridge smoke script tolerates malformed timeout overrides", async (t) => {
  const harness = await startMockHostedAPI(t);
  const fakeBridge = await writeFakeBridgeCLI(t);
  const fakeNpx = await writeFakeNpxShim(t, fakeBridge);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx laf-bridge",
    LAF_SMOKE_BRIDGE_TIMEOUT_MS: "not-a-number",
    LAF_SMOKE_MODE: "cli",
    PATH: `${fakeNpx.dir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS hosted Bridge smoke completed/);
});

test("hosted Bridge smoke script rejects command overrides that already include pair", async (t) => {
  const harness = await startMockHostedAPI(t);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx laf-bridge pair",
    LAF_SMOKE_MODE: "cli",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /LAF_SMOKE_BRIDGE_CMD must be a base Bridge command/);
  assert.equal(harness.state.requests.length, 0);
});

test("hosted Bridge smoke script rejects internal Bridge command overrides", async (t) => {
  for (const command of ["doctor", "providers", "bindings", "link-project", "mcp-context"]) {
    const harness = await startMockHostedAPI(t);
    const result = await runSmoke(harness.apiURL, {
      LAF_SMOKE_BRIDGE_CMD: `npx laf-bridge ${command}`,
      LAF_SMOKE_MODE: "cli",
    });

    assert.notEqual(result.code, 0, `${command} should fail`);
    assert.match(result.stderr, /LAF_SMOKE_BRIDGE_CMD must be a base Bridge command/);
    assert.equal(harness.state.requests.length, 0);
  }
});

test("hosted Bridge smoke script rejects setup code command overrides", async (t) => {
  const rawPairingCodeHarness = await startMockHostedAPI(t);
  const rawPairingCode = await runSmoke(rawPairingCodeHarness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx laf-bridge ABCD-1234",
    LAF_SMOKE_MODE: "cli",
  });
  assert.notEqual(rawPairingCode.code, 0);
  assert.match(rawPairingCode.stderr, /must not include setup codes/);
  assert.equal(rawPairingCodeHarness.state.requests.length, 0);

  const encodedSetupCodeHarness = await startMockHostedAPI(t);
  const encodedSetupCode = await runSmoke(encodedSetupCodeHarness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: `npx laf-bridge ${setupCode("https://office.example.com/api", "ABCD-1234")}`,
    LAF_SMOKE_MODE: "cli",
  });
  assert.notEqual(encodedSetupCode.code, 0);
  assert.match(encodedSetupCode.stderr, /must not include setup codes/);
  assert.equal(encodedSetupCodeHarness.state.requests.length, 0);
});

test("hosted Bridge smoke script rejects shell syntax in command overrides", async (t) => {
  for (const command of [
    "npx --yes laf-bridge@latest ; echo hacked",
    "npx --yes laf-bridge@latest && echo hacked",
    "npx --yes laf-bridge@latest $(echo hacked)",
  ]) {
    const harness = await startMockHostedAPI(t);
    const result = await runSmoke(harness.apiURL, {
      LAF_SMOKE_BRIDGE_CMD: command,
      LAF_SMOKE_MODE: "cli",
    });

    assert.notEqual(result.code, 0, `${command} should fail`);
    assert.match(result.stderr, /must not include shell control syntax/);
    assert.equal(harness.state.requests.length, 0);
  }
});

test("hosted Bridge smoke script rejects malformed quoted command overrides", async (t) => {
  const harness = await startMockHostedAPI(t);
  const result = await runSmoke(harness.apiURL, {
    LAF_SMOKE_BRIDGE_CMD: "npx 'laf-bridge",
    LAF_SMOKE_MODE: "cli",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unterminated quote/);
  assert.equal(harness.state.requests.length, 0);
});

test("hosted Bridge smoke script rejects legacy pairing commands", async (t) => {
  const harness = await startMockHostedAPI(t, { legacyPairCommand: true });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /pair command must be exactly|legacy or flagged pairing flow/);
});

test("hosted Bridge smoke script rejects flagged Bridge pairing commands", async (t) => {
  const harness = await startMockHostedAPI(t, { flaggedPairCommand: true });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /pair command must be exactly|legacy or flagged pairing flow/);
});

test("hosted Bridge smoke script rejects raw setup codes and extra commands", async (t) => {
  const rawCodeHarness = await startMockHostedAPI(t, { rawPairingCode: true });
  const rawCode = await runSmoke(rawCodeHarness.apiURL);
  assert.notEqual(rawCode.code, 0);
  assert.match(rawCode.stderr, /raw pairing code/);

  const setupCommandHarness = await startMockHostedAPI(t, { separateSetupCommand: true });
  const setupCommand = await runSmoke(setupCommandHarness.apiURL);
  assert.notEqual(setupCommand.code, 0);
  assert.match(setupCommand.stderr, /expose only commands\.pair/);

  const startCommandHarness = await startMockHostedAPI(t, { separateStartCommand: true });
  const startCommand = await runSmoke(startCommandHarness.apiURL);
  assert.notEqual(startCommand.code, 0);
  assert.match(startCommand.stderr, /expose only commands\.pair/);

  const statusCommandHarness = await startMockHostedAPI(t, { extraStatusCommand: true });
  const statusCommand = await runSmoke(statusCommandHarness.apiURL);
  assert.notEqual(statusCommand.code, 0);
  assert.match(statusCommand.stderr, /expose only commands\.pair/);
});

test("hosted Bridge smoke script rejects non-hosted-safe slash command registries", async (t) => {
  const harness = await startMockHostedAPI(t, { legacyCommandRegistry: true });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unsupported \/deploy-simulation|legacy execution wording/);
});

test("hosted Bridge smoke script rejects slash command endpoints that fake local workflow success", async (t) => {
  const harness = await startMockHostedAPI(t, { commandEndpointFakesSuccess: true });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /commands\/run -> 200, expected 400/);
});

test("hosted Bridge smoke script rejects legacy local execution API routes", async (t) => {
  const harness = await startMockHostedAPI(t, { legacyRunnerRoutes: true });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /runner\/status -> 200, expected 404/);
});

test("hosted Bridge smoke script rejects legacy team_bridge availability", async (t) => {
  const harness = await startMockHostedAPI(t, {
    legacyTeamBridgeAvailability: true,
  });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /legacy team_bridge availability/);
});

test("hosted Bridge smoke script rejects unavailable my_bridge without a reason", async (t) => {
  const harness = await startMockHostedAPI(t, {
    blankInitialUnavailableReason: true,
  });
  const result = await runSmoke(harness.apiURL);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unavailable without a reason/);
});

async function startMockHostedAPI(t, options = {}) {
  const state = {
    completedReceipt: null,
    device: null,
    events: [],
    authAction: "",
    browserOrigin: options.browserOrigin || "",
    commandEndpointFakesSuccess: Boolean(options.commandEndpointFakesSuccess),
    flaggedPairCommand: Boolean(options.flaggedPairCommand),
    legacyPairCommand: Boolean(options.legacyPairCommand),
    legacyCommandRegistry: Boolean(options.legacyCommandRegistry),
    legacyRunnerRoutes: Boolean(options.legacyRunnerRoutes),
    legacyTeamBridgeAvailability: Boolean(options.legacyTeamBridgeAvailability),
    blankInitialUnavailableReason: Boolean(options.blankInitialUnavailableReason),
    extraStatusCommand: Boolean(options.extraStatusCommand),
    rawPairingCode: Boolean(options.rawPairingCode),
    separateSetupCommand: Boolean(options.separateSetupCommand),
    separateStartCommand: Boolean(options.separateStartCommand),
    expectedProvider: options.expectedProvider || "codex",
    pairingCode: "ABCD-1234",
    plan: null,
    requests: [],
    signingKeyPair: crypto.generateKeyPairSync("ed25519"),
    signupBody: null,
    token: "bridge-token-1",
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const route = url.pathname.replace(/^\/api\/?/, "");
      state.requests.push(`${req.method} ${route}`);
      const body = await readJSON(req);

      if (route === "health" && req.method === "GET") {
        return json(res, { service: "laf-hosted-api", ok: true });
      }

      if (route === "bridge/pairing/start" && req.method === "OPTIONS") {
        if (state.browserOrigin) {
          assert.equal(req.headers.origin, state.browserOrigin);
          res.setHeader("Access-Control-Allow-Origin", state.browserOrigin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
        }
        res.statusCode = 204;
        return res.end();
      }

      if (route === "auth/login" && req.method === "POST") {
        assert.equal(body.email, "smoke@example.com");
        assert.equal(body.password, "correct-horse-battery-staple");
        if (state.browserOrigin) {
          assert.equal(req.headers.origin, state.browserOrigin);
          res.setHeader("Access-Control-Allow-Origin", state.browserOrigin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        state.authAction = "login";
        res.setHeader("Set-Cookie", [
          cookieValue("laf_access", "mock-access", state.browserOrigin),
          cookieValue("laf_refresh", "mock-refresh", state.browserOrigin),
        ]);
        return json(res, {
          team: { id: "team-1", name: "Smoke Team" },
          user: { id: "user-1", email: body.email },
        });
      }

      if (route === "auth/signup" && req.method === "POST") {
        assert.equal(body.email, "smoke@example.com");
        assert.equal(body.password, "correct-horse-battery-staple");
        assert.equal(body.team_action, "create");
        if (state.browserOrigin) {
          assert.equal(req.headers.origin, state.browserOrigin);
          res.setHeader("Access-Control-Allow-Origin", state.browserOrigin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        state.authAction = "signup";
        state.signupBody = body;
        res.setHeader("Set-Cookie", [
          cookieValue("laf_access", "mock-access", state.browserOrigin),
          cookieValue("laf_refresh", "mock-refresh", state.browserOrigin),
        ]);
        return json(res, {
          authenticated: true,
          email_confirmation_required: false,
          team: { id: "team-1", name: body.team_name },
          user: { id: "user-1", email: body.email },
        });
      }

      if (route === "auth/session" && req.method === "GET") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        if (state.browserOrigin) {
          assert.equal(req.headers.origin, state.browserOrigin);
          res.setHeader("Access-Control-Allow-Origin", state.browserOrigin);
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        return json(res, {
          authenticated: true,
          team: { id: "team-1", name: "Smoke Team" },
          user: { id: "user-1", email: "smoke@example.com" },
        });
      }

      if (route === "commands" && req.method === "GET") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        if (state.legacyCommandRegistry) {
          return json(res, [
            {
              description: "Ask the workspace AI to help with a task.",
              name: "ask",
              webSupported: true,
            },
            {
              description: "Open or manage hosted workspace tasks.",
              name: "tasks",
              webSupported: true,
            },
            {
              description: "Switch default Bridge provider.",
              name: "provider",
              webSupported: true,
            },
            {
              description: "Unsupported hosted workflow.",
              name: "deploy-simulation",
              webSupported: true,
            },
          ]);
        }
        return json(res, [
          {
            description: "Ask the workspace AI to help with a task.",
            name: "ask",
            webSupported: true,
          },
          {
            description: "Open or manage hosted workspace tasks.",
            name: "tasks",
            webSupported: true,
          },
          {
            description: "Switch default Bridge provider.",
            name: "provider",
            webSupported: true,
          },
        ]);
      }

      if (route === "commands/run" && req.method === "POST") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        if (state.commandEndpointFakesSuccess) {
          return json(res, { ok: true, result: "fake local workflow completed" });
        }
        if (body.input === "/tasks") {
          return json(
            res,
            { error: "slash command is handled directly in the web workspace" },
            400,
          );
        }
        return json(
          res,
          { error: "slash command is not available in the hosted workspace" },
          400,
        );
      }

      if (route.startsWith("runner/")) {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        if (state.legacyRunnerRoutes) {
          return json(res, { ok: true, runner_job: { id: "legacy-job-1" } });
        }
        return json(res, { error: "hosted API route not found" }, 404);
      }

      if (route === "bridge/availability" && req.method === "GET") {
        const online = state.device?.status === "online";
        const runtimes = online ? state.device.capabilities.provider_runtimes || [] : [];
        const body = {
          devices: state.device ? [state.device] : [],
          my_bridge: {
            available: online,
            default_device_id: online ? state.device.id : "",
            reason: online
              ? ""
              : state.blankInitialUnavailableReason
                ? ""
                : "no paired LAF Bridge detected",
            runtimes,
          },
        };
        if (state.legacyTeamBridgeAvailability) {
          body.team_bridge = {
            available: online,
            reason: "legacy workspace bridge state",
          };
        }
        return json(res, body);
      }

      if (route === "bridge/pairing/start" && req.method === "POST") {
        let pair = "npx laf-bridge pair";
        if (state.legacyPairCommand) pair = `${["laf", "runner"].join("-")} pair`;
        if (state.flaggedPairCommand) {
          pair = "npx laf-bridge pair --api-url " + body.api_url + " --code " + state.pairingCode;
        }
        const commands = { pair };
        if (state.separateSetupCommand) commands.setup = "npx laf-bridge pair";
        if (state.separateStartCommand) commands.start = "laf-bridge start";
        if (state.extraStatusCommand) commands.status = "laf-bridge status";
        const pairing = {
          expires_at: "2030-01-01T00:00:00Z",
          setup_code: setupCode(body.api_url, state.pairingCode),
        };
        if (state.rawPairingCode) pairing.code = state.pairingCode;
        return json(res, {
          commands,
          pairing,
        });
      }

      if (route === "bridge/pairing/claim" && req.method === "POST") {
        assert.equal(body.code, state.pairingCode);
        assert.notEqual(body.device_kind, "team_bridge");
        state.device = {
          id: "bridge-device-1",
          capabilities: body.capabilities,
          device_kind: "desktop",
          device_label: body.device_label,
          status: "online",
          team_id: "team-1",
          user_id: "user-1",
        };
        return json(res, {
          bridge_token: state.token,
          device: state.device,
          plan_signing_public_key: state.signingKeyPair.publicKey.export({
            format: "pem",
            type: "spki",
          }),
        });
      }

      if (route === "bridge/devices/bridge-device-1/heartbeat" && req.method === "POST") {
        requireBridgeToken(req, state.token);
        state.device = {
          ...state.device,
          capabilities: body.capabilities,
          status: body.status || "online",
        };
        return json(res, { device: state.device });
      }

      if (route === "bridge/devices" && req.method === "GET") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        const existing = {
          id: "older-bridge-device",
          capabilities: { provider_runtimes: ["codex"] },
          device_kind: "desktop",
          device_label: "Existing Bridge",
          status: "online",
          team_id: "team-1",
          user_id: "user-1",
        };
        return json(res, {
          devices: state.device ? [existing, state.device] : [existing],
        });
      }

      if (route === "projects" && req.method === "POST") {
        assert.equal(body.action, "create");
        assert.match(body.github_repo_url, /^https:\/\/github\.com\//);
        return json(res, {
          project: {
            github_repo_url: body.github_repo_url,
            id: "project-1",
            name: body.name,
          },
        });
      }

      if (route === "tasks" && req.method === "POST") {
        assert.equal(body.action, "create");
        assert.equal(body.model_mode, "my_bridge");
        assert.equal(body.owner, "be");
        return json(res, {
          task: {
            execution_mode: "managed_checkout",
            id: "task-1",
            model_mode: "my_bridge",
            owner: body.owner,
            project_id: body.project_id,
            title: body.title,
          },
        });
      }

      if (route === "execution/plans" && req.method === "POST") {
        assert.equal(body.mode, "my_bridge");
        assert.equal(body.provider, state.expectedProvider);
        assert.equal(body.device_id, "bridge-device-1");
        state.plan = {
          id: "plan-1",
          actor_user_id: "user-1",
          context_refs: [],
          device_id: "bridge-device-1",
          effective_permissions: ["task:execute_agent"],
          executor_user_id: "user-1",
          expires_at: "2030-01-01T00:00:00Z",
          mode: "my_bridge",
          policy: {
            github_repo_url: "https://github.com/LAF-labs/LAF-Agents-Office",
            project_id: "project-1",
            project_name: "Hosted Bridge Smoke",
            project_slug: "project-1",
          },
          project_id: "project-1",
          prompt: body.message,
          provider: body.provider,
          required_permissions: [],
          status: "pending",
          task_id: "task-1",
          team_id: "team-1",
        };
        Object.assign(state.plan, signExecutionPlanForTest(state.plan, state.signingKeyPair.privateKey));
        return json(res, { plan: state.plan });
      }

      if (route === "bridge/devices/bridge-device-1/pending-plans" && req.method === "GET") {
        requireBridgeToken(req, state.token);
        return json(res, { plans: state.plan && state.plan.status === "pending" ? [state.plan] : [] });
      }

      if (route === "execution/plans/plan-1/ack" && req.method === "POST") {
        requireBridgeToken(req, state.token);
        state.plan.status = "acknowledged";
        return json(res, { plan: state.plan });
      }

      if (route === "execution/plans/plan-1/start" && req.method === "POST") {
        requireBridgeToken(req, state.token);
        assert.equal(body.local_approval_status, "approved");
        state.plan.status = "running";
        return json(res, { plan: state.plan });
      }

      if (route === "execution/plans/plan-1/events" && req.method === "POST") {
        requireBridgeToken(req, state.token);
        assert.equal(body.sequence, 1);
        state.events.push(body);
        return json(res, { event: { id: "event-1", ...body } });
      }

      if (route === "execution/plans/plan-1/events" && req.method === "GET") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        return json(res, {
          events: state.events.map((event, index) => ({
            event_type: event.event_type,
            id: `event-${index + 1}`,
            payload: event.payload,
            plan_id: "plan-1",
            sequence: event.sequence,
          })),
        });
      }

      if (route === "execution/plans/plan-1/complete" && req.method === "POST") {
        requireBridgeToken(req, state.token);
        state.plan.status = "completed";
        const receipt = {
          artifacts: body.artifacts,
          changed_files: body.changed_files,
          id: "receipt-1",
          summary: body.summary,
          test_results: body.test_results,
          usage: body.usage,
        };
        state.completedReceipt = {
          artifactURL: body.artifacts?.[0]?.url,
          changedFile: body.changed_files?.[0]?.path,
          summary: body.summary,
          testCommand: body.test_results?.[0]?.command,
          visibleToBrowser: false,
        };
        return json(res, {
          plan: state.plan,
          receipt,
        });
      }

      if (route === "execution/plans/plan-1" && req.method === "GET") {
        assert.match(req.headers.cookie || "", /laf_access=mock-access/);
        state.completedReceipt.visibleToBrowser = true;
        return json(res, {
          plan: state.plan,
          receipt: {
            artifacts: [{ url: state.completedReceipt.artifactURL }],
            changed_files: [{ path: state.completedReceipt.changedFile }],
            id: "receipt-1",
            summary: state.completedReceipt.summary,
            test_results: [{ command: state.completedReceipt.testCommand }],
          },
        });
      }

      json(res, { error: "not found", route }, 404);
    } catch (err) {
      json(res, { error: err.message }, 500);
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  return { apiURL: `http://127.0.0.1:${address.port}/api`, state };
}

async function writeFakeBridgeCLI(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-smoke-test-"));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  const file = path.join(dir, "fake-bridge.cjs");
  await fs.writeFile(file, fakeBridgeSource(), "utf8");
  return file;
}

async function writeFakeNpxShim(t, fakeBridgePath) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-smoke-npx-"));
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
const args = process.argv.slice(2);
if (args[0] === "--yes" || args[0] === "-y") args.shift();
const expectedPackage = process.env.LAF_EXPECT_NPX_PACKAGE || "";
if (expectedPackage && args[0] !== expectedPackage) {
  console.error("fake-npx: expected package " + expectedPackage + ", got " + (args[0] || ""));
  process.exit(1);
}
if (args[0] !== "laf-bridge" && args[0] !== "fake-bridge" && !/^laf-bridge@/.test(args[0] || "")) {
  console.error("fake-npx: unexpected package " + (args[0] || ""));
  process.exit(1);
}
const result = spawnSync(process.execPath, [${JSON.stringify(fakeBridgePath)}, ...args.slice(1)], {
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
  const runtime = process.env.LAF_FAKE_BRIDGE_RUNTIME || "codex";
  const cliName = runtime === "claude_code" ? "claude-code" : runtime;
  const claim = await request(apiURL, "bridge/pairing/claim", {
    method: "POST",
    body: {
      arch: process.arch,
      bridge_version: "fake-cli",
      capabilities: {
        cli_details: { [cliName]: { detected: true, version: "fake-" + cliName } },
        gh_authenticated: true,
        git_available: true,
        provider_runtimes: [cliName],
      },
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
  const runtime = process.env.LAF_FAKE_BRIDGE_RUNTIME || "codex";
  cliName = cliName || (runtime === "claude_code" ? "claude-code" : runtime);
  await request(state.apiURL, "bridge/devices/" + encodeURIComponent(state.deviceID) + "/heartbeat", {
    method: "POST",
    token: state.token,
    body: {
      capabilities: {
        cli_details: { [cliName]: { detected: true, version: "fake-" + cliName } },
        gh_authenticated: true,
        git_available: true,
        provider_runtimes: [cliName],
      },
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

function runSmoke(apiURL, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAF_HOSTED_API_URL: apiURL,
        LAF_SMOKE_EMAIL: "smoke@example.com",
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

function assertSubsequence(actual, expected) {
  let cursor = 0;
  for (const item of actual) {
    if (item === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return;
  }
  assert.fail(
    `request sequence missing subsequence\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`,
  );
}

function requireBridgeToken(req, token) {
  assert.equal(req.headers.authorization, `Bearer ${token}`);
}

function setupCode(apiURL, code) {
  return Buffer.from(
    JSON.stringify({ api_url: apiURL, code, v: 1 }),
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signExecutionPlanForTest(plan, privateKey) {
  const canonical = canonicalExecutionPlanPayload(plan);
  return {
    nonce: JSON.parse(canonical).nonce,
    payload_hash: crypto.createHash("sha256").update(canonical).digest("hex"),
    signature: crypto.sign(null, Buffer.from(canonical), privateKey).toString("base64"),
    signature_alg: "ed25519",
    signature_key_id: "test-smoke-key",
  };
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
  payload.nonce = plan.nonce || "nonce-test-smoke";
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

function cookieValue(name, value, browserOrigin = "") {
  if (browserOrigin) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=None; Max-Age=3600; Secure`;
  }
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`;
}

function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJSON(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}
