const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedURLTrust,
  isPrivateHostedHostname,
  looksLikeBareHostedAPIHost,
} = require("./urlTrust");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function helpers(env = {}) {
  return createHostedURLTrust({ createHTTPError, env });
}

test("trusted public origin requires configured production host", () => {
  const trust = helpers({ NODE_ENV: "production" });

  assert.throws(
    () => trust.trustedPublicOrigin({ headers: { host: "attacker.example" } }),
    (err) =>
      err.status === 503 &&
      err.message === "LAF_OFFICE_PUBLIC_HOST is not configured for production",
  );
});

test("trusted public origin normalizes configured HTTPS host and rejects private production hosts", () => {
  assert.equal(
    helpers({ LAF_OFFICE_PUBLIC_HOST: "office.example.com", NODE_ENV: "production" })
      .trustedPublicOrigin({ headers: {} }),
    "https://office.example.com",
  );

  assert.throws(
    () =>
      helpers({ LAF_OFFICE_PUBLIC_HOST: "http://127.0.0.1:3000", NODE_ENV: "production" })
        .trustedPublicOrigin({ headers: {} }),
    /LAF_OFFICE_PUBLIC_HOST must use https/,
  );
});

test("local public origin may fall back to request headers", () => {
  assert.equal(
    helpers({ NODE_ENV: "test" }).trustedPublicOrigin({
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "http",
      },
    }),
    "http://localhost:3000",
  );
});

test("allowed origins are normalized, deduplicated, and production-safe", () => {
  const trust = helpers({ NODE_ENV: "production" });

  assert.deepEqual(
    trust.normalizeAllowedOrigins(
      "app.example.com, https://app.example.com, http://localhost:3000, https://app.example.com/path",
    ),
    ["https://app.example.com"],
  );
});

test("public API base supports configured URL and relative browser path", () => {
  assert.equal(
    helpers({
      LAF_OFFICE_PUBLIC_API_BASE_URL: "api.example.com",
      NODE_ENV: "production",
    }).trustedPublicAPIURL({ headers: {} }),
    "https://api.example.com/api",
  );

  assert.equal(
    helpers({
      LAF_OFFICE_PUBLIC_HOST: "office.example.com",
      NODE_ENV: "production",
      VITE_LAF_API_BASE_URL: "/api",
    }).trustedPublicAPIURL({ headers: {} }),
    "https://office.example.com/api",
  );
});

test("public API base rejects protocol-relative and private production URLs", () => {
  assert.throws(
    () =>
      helpers({
        LAF_OFFICE_PUBLIC_HOST: "office.example.com",
        NODE_ENV: "production",
        VITE_LAF_API_BASE_URL: "//evil.example/api",
      }).trustedPublicAPIURL({ headers: {} }),
    /VITE_LAF_API_BASE_URL must not be a protocol-relative URL/,
  );

  assert.throws(
    () =>
      helpers({
        LAF_OFFICE_PUBLIC_API_BASE_URL: "https://10.0.0.5/api",
        NODE_ENV: "production",
      }).trustedPublicAPIURL({ headers: {} }),
    /LAF_OFFICE_PUBLIC_API_BASE_URL must not point at localhost or a private network address/,
  );
});

test("host classification helpers identify bare and private hosts", () => {
  assert.equal(looksLikeBareHostedAPIHost("api.example.com"), true);
  assert.equal(looksLikeBareHostedAPIHost("/api"), false);
  assert.equal(isPrivateHostedHostname("192.168.1.10"), true);
  assert.equal(isPrivateHostedHostname("api.example.com"), false);
});
