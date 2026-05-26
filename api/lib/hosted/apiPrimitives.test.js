const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HTTPError,
  objectValue,
  requestIDFor,
  startupOfficeHTTPError,
} = require("./apiPrimitives");

test("startupOfficeHTTPError creates typed safe HTTP errors by default", () => {
  const err = startupOfficeHTTPError(404, "missing");

  assert.ok(err instanceof HTTPError);
  assert.ok(err instanceof Error);
  assert.equal(err.status, 404);
  assert.equal(err.message, "missing");
  assert.equal(err.safe, true);
});

test("HTTP errors can mark upstream messages as unsafe", () => {
  const err = startupOfficeHTTPError(502, "upstream leaked detail", { safe: false });

  assert.equal(err.status, 502);
  assert.equal(err.safe, false);
});

test("requestIDFor prefers explicit request ids and falls back to Vercel ids", () => {
  assert.equal(requestIDFor({ headers: { "x-request-id": " req-1 " } }), "req-1");
  assert.equal(requestIDFor({ headers: { "x-vercel-id": "iad1::abc" } }), "iad1::abc");
  assert.equal(requestIDFor({ headers: {} }), "");
  assert.equal(requestIDFor(null), "");
});

test("objectValue accepts only non-array objects", () => {
  const value = { ok: true };

  assert.equal(objectValue(value), value);
  assert.deepEqual(objectValue(["no"]), {});
  assert.deepEqual(objectValue(null), {});
  assert.deepEqual(objectValue("no"), {});
});
