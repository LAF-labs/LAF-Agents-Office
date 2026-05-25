const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSecurityHeaders,
} = require("./securityHeaders");

function responseStub() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
  };
}

test("baseline security headers are conservative for hosted API responses", () => {
  const res = responseStub();
  const headers = createHostedSecurityHeaders();

  headers.applyBaselineSecurityHeaders(res);

  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(
    res.headers["strict-transport-security"],
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(res.headers["cross-origin-opener-policy"], "same-origin");
});

test("CORS headers are emitted only for configured browser origins", () => {
  const headers = createHostedSecurityHeaders({
    allowedOrigins: ["https://app.example.com"],
  });
  const allowed = responseStub();
  headers.applyCORSHeaders({ headers: { origin: "https://app.example.com" } }, allowed);

  assert.equal(allowed.headers["access-control-allow-origin"], "https://app.example.com");
  assert.equal(allowed.headers.vary, "Origin");
  assert.equal(allowed.headers["access-control-allow-credentials"], "true");
  assert.equal(
    allowed.headers["access-control-allow-headers"],
    "Authorization, Content-Type, X-Requested-With",
  );
  assert.equal(
    allowed.headers["access-control-allow-methods"],
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  assert.equal(allowed.headers["access-control-max-age"], "600");

  const blocked = responseStub();
  headers.applyCORSHeaders({ headers: { origin: "https://evil.example" } }, blocked);
  assert.deepEqual(blocked.headers, {});
});

test("trustedBrowserOrigin reuses the CORS allowlist", () => {
  const headers = createHostedSecurityHeaders({
    allowedOrigins: ["https://app.example.com"],
  });

  assert.equal(
    headers.trustedBrowserOrigin({ headers: { origin: "https://app.example.com" } }),
    "https://app.example.com",
  );
  assert.equal(headers.trustedBrowserOrigin({ headers: { origin: "https://evil.example" } }), "");
  assert.equal(headers.trustedBrowserOrigin({ headers: {} }), "");
});
