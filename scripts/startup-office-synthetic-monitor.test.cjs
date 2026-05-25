"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  configFromEnv,
  normalizeAPIBaseURL,
  runStartupOfficeSyntheticMonitor,
} = require("./startup-office-synthetic-monitor.cjs");

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    status: init.status || 200,
  });
}

test("synthetic monitor runs the deployed founder flow with cookies and approval", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ body: options.body, headers: options.headers || {}, method: options.method, url });
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (path === "/health") return jsonResponse({ status: "ok" });
    if (path === "/auth/login") {
      return jsonResponse(
        { team: { id: "team-1" }, user: { id: "user-1" } },
        { headers: { "Set-Cookie": "laf_access=access-token; Path=/; HttpOnly" } },
      );
    }
    if (path === "/auth/session") {
      assert.match(options.headers.Cookie || "", /laf_access=access-token/);
      return jsonResponse({ authenticated: true, team: { id: "team-1" }, user: { id: "user-1" } });
    }
    if (path === "/startup-office/growth-summary") {
      return jsonResponse({ company_profile: { name: "Synthetic Co" }, loops: [{ slug: "idea-validation" }] });
    }
    if (path === "/startup-office/loops/idea-validation/run") {
      assert.match(options.headers["Idempotency-Key"], /^synthetic:idea-validation:/);
      return jsonResponse({
        approval: { id: "approval-1", run_id: "run-1", status: "pending" },
        run: { id: "run-1", status: "waiting_approval" },
        status: "waiting_approval",
      });
    }
    if (path === "/startup-office/approvals/approval-1/approve") {
      return jsonResponse({ approval: { id: "approval-1", status: "approved" } });
    }
    if (path === "/startup-office/receipts") {
      return jsonResponse({ receipts: [{ event_type: "approval.approved", id: "receipt-1", run_id: "run-1" }] });
    }
    if (path === "/auth/logout") return jsonResponse({ status: "ok" });
    throw new Error(`unexpected path ${path}`);
  };

  const result = await runStartupOfficeSyntheticMonitor(
    {
      apiBaseURL: "https://app.example/api",
      approvalAction: "approve",
      email: "synthetic@example.com",
      loopID: "idea-validation",
      password: "secret-password",
      timeoutMs: 1000,
    },
    fetchImpl,
  );

  assert.equal(result.ok, true);
  assert.equal(result.run_id, "run-1");
  assert.deepEqual(result.steps.map((step) => step.name), [
    "health",
    "login",
    "session",
    "profile",
    "run",
    "approval",
    "approval_decision",
    "receipt",
    "logout",
  ]);
  assert.equal(calls[1].body, JSON.stringify({ email: "synthetic@example.com", password: "secret-password" }));
});

test("synthetic monitor fails when the live loop path stays queued", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (path === "/health") return jsonResponse({ status: "ok" });
    if (path === "/auth/login") return jsonResponse({});
    if (path === "/auth/session") return jsonResponse({ authenticated: true, team: {}, user: {} });
    if (path === "/startup-office/growth-summary") return jsonResponse({ company_profile: {}, loops: [] });
    if (path === "/startup-office/loops/idea-validation/run") {
      return jsonResponse({ run: { id: "run-1", status: "queued" }, status: "queued" }, { status: 202 });
    }
    throw new Error(`unexpected path ${path}`);
  };

  await assert.rejects(
    () => runStartupOfficeSyntheticMonitor(
      {
        apiBaseURL: "https://app.example/api",
        approvalAction: "read",
        email: "synthetic@example.com",
        loopID: "idea-validation",
        password: "secret-password",
        timeoutMs: 1000,
      },
      fetchImpl,
    ),
    /live worker\/model path was not exercised/,
  );
});

test("synthetic monitor config normalizes hosts and requires external credentials", () => {
  assert.equal(normalizeAPIBaseURL("app.example"), "https://app.example/api");
  assert.equal(normalizeAPIBaseURL("https://app.example/custom"), "https://app.example/custom/api");
  assert.deepEqual(
    configFromEnv({
      LAF_SYNTHETIC_API_BASE_URL: "https://app.example/api",
      LAF_SYNTHETIC_EMAIL: "synthetic@example.com",
      LAF_SYNTHETIC_PASSWORD: "secret",
    }),
    {
      apiBaseURL: "https://app.example/api",
      approvalAction: "approve",
      email: "synthetic@example.com",
      loopID: "idea-validation",
      password: "secret",
      timeoutMs: 60000,
    },
  );
  assert.throws(() => configFromEnv({ LAF_SYNTHETIC_API_BASE_URL: "app.example" }), /missing LAF_SYNTHETIC_EMAIL/);
  assert.throws(
    () => configFromEnv({
      LAF_SYNTHETIC_API_BASE_URL: "app.example",
      LAF_SYNTHETIC_APPROVAL_ACTION: "delete",
      LAF_SYNTHETIC_EMAIL: "synthetic@example.com",
      LAF_SYNTHETIC_PASSWORD: "secret",
    }),
    /LAF_SYNTHETIC_APPROVAL_ACTION must be one of/,
  );
});
