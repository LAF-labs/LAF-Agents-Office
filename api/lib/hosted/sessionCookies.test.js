const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSessionCookies,
} = require("./sessionCookies");

function responseStub() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

test("authToken prefers bearer credentials and falls back to laf_access cookie", () => {
  const cookies = createHostedSessionCookies();

  assert.equal(
    cookies.authToken({
      headers: {
        authorization: "Bearer access-token",
        cookie: "laf_access=cookie-token",
      },
    }),
    "access-token",
  );
  assert.equal(
    cookies.authToken({ headers: { cookie: "other=x; laf_access=cookie%20token" } }),
    "cookie token",
  );
  assert.equal(cookies.authToken({ headers: {} }), "");
});

test("cookie parser ignores malformed parts and decodes matching values", () => {
  const cookies = createHostedSessionCookies();

  assert.equal(
    cookies.cookie({ headers: { cookie: "bad; laf_refresh=refresh%2Ftoken" } }, "laf_refresh"),
    "refresh/token",
  );
  assert.equal(cookies.cookie({ headers: { cookie: "laf_access=abc" } }, "missing"), "");
});

test("setAuthCookies uses local Lax cookies outside production", () => {
  const cookies = createHostedSessionCookies({ env: { NODE_ENV: "development" } });
  const res = responseStub();

  cookies.setAuthCookies({ headers: {} }, res, {
    access_token: "access/value",
    expires_in: 120,
    refresh_token: "refresh/value",
  });

  assert.deepEqual(res.headers["set-cookie"], [
    "laf_access=access%2Fvalue; Path=/; HttpOnly; SameSite=Lax; Max-Age=120",
    "laf_refresh=refresh%2Fvalue; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
  ]);
});

test("production trusted browser origins get SameSite=None and Secure cookies", () => {
  const cookies = createHostedSessionCookies({
    env: { NODE_ENV: "production" },
    trustedBrowserOrigin: () => "https://app.example.com",
  });
  const res = responseStub();

  cookies.setAuthCookies({ headers: { origin: "https://app.example.com" } }, res, {
    access_token: "access",
  });

  assert.deepEqual(res.headers["set-cookie"], [
    "laf_access=access; Path=/; HttpOnly; SameSite=None; Max-Age=3600; Secure",
  ]);
});

test("production untrusted browser origins keep SameSite=Lax while using Secure", () => {
  const cookies = createHostedSessionCookies({
    env: { NODE_ENV: "production" },
    trustedBrowserOrigin: () => "",
  });
  const res = responseStub();

  cookies.clearAuthCookies({ headers: { origin: "https://evil.example" } }, res);

  assert.deepEqual(res.headers["set-cookie"], [
    "laf_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    "laf_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
  ]);
});
