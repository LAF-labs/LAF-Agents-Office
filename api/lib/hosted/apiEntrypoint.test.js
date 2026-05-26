const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HTTPError,
  requestIDFor,
} = require("./apiPrimitives");
const {
  createHostedAPIEntrypoint,
} = require("./apiEntrypoint");
const {
  defaultHostedAPIErrorMessage,
  hostedAPIErrorPayload,
} = require("./errorEnvelope");

test("hosted API entrypoint applies security and short-circuits preflight", async () => {
  const calls = [];
  const handler = createHostedAPIEntrypoint(createDeps(calls));
  const res = response(calls);

  await handler({ method: "OPTIONS", headers: {} }, res);

  assert.deepEqual(callNames(calls), ["baseline", "cors", "status", "end"]);
  assert.equal(res.statusCode, 204);
});

test("hosted API entrypoint dispatches resolved paths after env and rate-limit checks", async () => {
  const calls = [];
  const handler = createHostedAPIEntrypoint(createDeps(calls, { dispatchResult: true }));

  await handler({ method: "GET", headers: {}, path: "health" }, response(calls));

  assert.deepEqual(callNames(calls), [
    "baseline",
    "cors",
    "assertSupabaseEnv",
    "requestPath",
    "rateLimit",
    "dispatch",
  ]);
});

test("hosted API entrypoint writes typed not-found errors", async () => {
  const calls = [];
  const handler = createHostedAPIEntrypoint(createDeps(calls, { dispatchResult: false }));
  const res = response(calls);

  await handler({ method: "GET", headers: { "x-request-id": "req-1" }, path: "missing" }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: {
      code: "hosted_api_route_not_found",
      message: "hosted API route not found",
      request_id: "req-1",
      retryable: false,
      status: 404,
    },
  });
});

test("hosted API entrypoint hides unsafe upstream HTTP errors and logs them", async () => {
  const calls = [];
  const handler = createHostedAPIEntrypoint(createDeps(calls, {
    dispatchError: new HTTPError(502, "provider leaked secret", { safe: false }),
  }));
  const res = response(calls);

  await handler({ method: "POST", headers: {}, path: "auth/login" }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.message, "upstream error");
  assert.equal(callNames(calls).includes("logError"), true);
});

function createDeps(calls, opts = {}) {
  return {
    HTTPError,
    apiRouteDispatcher: {
      dispatch: async (req, res, path) => {
        calls.push(["dispatch", [req, res, path]]);
        if (opts.dispatchError) throw opts.dispatchError;
        return opts.dispatchResult ?? false;
      },
    },
    assertSupabaseEnv: () => calls.push(["assertSupabaseEnv", []]),
    defaultHostedAPIErrorMessage,
    enforceHostedActionRateLimit: async (req, path) => calls.push(["rateLimit", [req, path]]),
    hostedAPIErrorPayload,
    logger: {
      error: (...args) => calls.push(["logError", args]),
    },
    requestIDFor,
    requestPath: (req) => {
      calls.push(["requestPath", [req]]);
      return req.path || "";
    },
    securityHeaders: {
      applyBaselineSecurityHeaders: (res) => calls.push(["baseline", [res]]),
      applyCORSHeaders: (req, res) => calls.push(["cors", [req, res]]),
    },
    writeJSON: (res, status, body) => {
      calls.push(["writeJSON", [res, status, body]]);
      res.statusCode = status;
      res.body = body;
    },
  };
}

function response(calls) {
  return {
    status(code) {
      this.statusCode = code;
      calls.push(["status", [code]]);
      return this;
    },
    end() {
      this.ended = true;
      calls.push(["end", []]);
    },
  };
}

function callNames(calls) {
  return calls.map(([name]) => name);
}
