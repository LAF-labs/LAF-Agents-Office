const assert = require("node:assert/strict");
const test = require("node:test");

const {
  browserFamily,
  cleanClientText,
  clientErrorMetadata,
  createHostedClientTelemetryHandlers,
  safeRoute,
} = require("./clientTelemetryHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    async readBody(req) {
      return req.body || {};
    },
    async requireUser() {
      return { membership };
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
      return { id: "audit-1" };
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("client telemetry handler records sanitized browser errors as audit events", async () => {
  const deps = baseDeps();
  const handlers = createHostedClientTelemetryHandlers(deps);

  await handlers.clientError(
    {
      body: {
        column: 9,
        filename: "https://app.example/assets/index.js?token=secret",
        line: 42,
        message: "boom for founder@example.com at https://app.example/private?token=secret",
        name: "TypeError",
        route: "/startup-office/approvals?token=secret#/invite/abc",
        source: "window.error",
        viewport: { height: 768, width: 1366 },
      },
      headers: {
        "user-agent": "Mozilla/5.0 Chrome/125.0 Safari/537.36",
      },
      method: "POST",
    },
    {},
  );

  const [auditMembership, action, targetType, targetID, metadata, options] = deps.calls.audits[0];
  assert.equal(auditMembership, membership);
  assert.equal(action, "client.error_reported");
  assert.equal(targetType, "client_error");
  assert.equal(targetID, metadata.fingerprint);
  assert.equal(options.required, true);
  assert.equal(metadata.browser, "chromium");
  assert.equal(metadata.filename, "index.js");
  assert.equal(metadata.line, 42);
  assert.equal(metadata.column, 9);
  assert.equal(metadata.message, "boom for [email] at [url]");
  assert.equal(metadata.route, "/startup-office/approvals");
  assert.deepEqual(metadata.viewport, { height: 768, width: 1366 });
  assert.doesNotMatch(JSON.stringify(metadata), /founder@example|token=secret|invite\/abc/);
  assert.equal(deps.calls.writes[0].status, 202);
  assert.equal(deps.calls.writes[0].body.status, "recorded");
});

test("client telemetry handler rejects unsupported methods", async () => {
  const handlers = createHostedClientTelemetryHandlers(baseDeps());

  await assert.rejects(
    () => handlers.clientError({ method: "GET" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});

test("client telemetry metadata clamps and normalizes unsafe fields", () => {
  const metadata = clientErrorMetadata(
    {
      column: -5,
      fingerprint: "not a fingerprint",
      line: 2_000_000,
      message: "password=hunter2 secret=abc",
      route: "/settings/billing/card/4242424242424242?key=value",
      source: "other",
      viewport: { height: 20000, width: Number.NaN },
    },
    { "user-agent": "Firefox/120" },
  );

  assert.equal(metadata.browser, "firefox");
  assert.equal(metadata.column, 0);
  assert.equal(metadata.line, 1_000_000);
  assert.equal(metadata.message, "password=[redacted] secret=[redacted]");
  assert.equal(metadata.route, "/settings/billing/card/_");
  assert.equal(metadata.source, "manual");
  assert.equal(metadata.viewport.height, 10000);
  assert.equal(metadata.viewport.width, 0);
  assert.match(metadata.fingerprint, /^[a-f0-9]{64}$/);
});

test("client telemetry helper keeps only workspace-safe route context", () => {
  assert.equal(safeRoute("/growth?customer=founder@example.com"), "/growth");
  assert.equal(safeRoute("/office#growth/customer-token"), "/office#growth");
  assert.equal(safeRoute("/invite/very-long-secret-token-value"), "/invite/_");
  assert.equal(cleanClientText("email me at founder@example.com", 300), "email me at [email]");
  assert.equal(browserFamily("Version/17.0 Safari/605.1.15"), "safari");
});
