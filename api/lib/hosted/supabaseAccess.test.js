const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSupabaseAccess,
  responseErrorMessage,
} = require("./supabaseAccess");

function createHTTPError(status, message, opts = {}) {
  const error = new Error(message);
  error.status = status;
  error.safe = opts.safe !== false;
  return error;
}

function access(fetchImpl = async () => jsonResponse({ ok: true })) {
  return createHostedSupabaseAccess({
    createHTTPError,
    env: {
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_URL: "https://supabase.test/",
    },
    fetch: fetchImpl,
    serviceRoleAccessGuards: {
      assertAllowedRestTable(table) {
        if (table !== "memberships") throw createHTTPError(403, "blocked table");
        return table;
      },
      assertAllowedRPC(name) {
        if (name !== "claim_hosted_rate_limit") throw createHTTPError(403, "blocked rpc");
        return name;
      },
    },
  });
}

function jsonResponse(body, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => (body === "" ? "" : JSON.stringify(body)),
  };
}

test("assertSupabaseEnv rejects missing hosted Supabase credentials", () => {
  const missing = createHostedSupabaseAccess({
    createHTTPError,
    env: { SUPABASE_URL: "https://supabase.test" },
  });

  assert.throws(
    () => missing.assertSupabaseEnv(),
    /supabase environment is not configured/,
  );
});

test("URL and header helpers preserve service-role and anon auth contracts", () => {
  const supabase = access();

  assert.equal(supabase.supabaseURL("/rest/v1/memberships"), "https://supabase.test/rest/v1/memberships");
  assert.deepEqual(supabase.serviceHeaders({ Prefer: "return=minimal" }), {
    Authorization: "Bearer service-key",
    "Content-Type": "application/json",
    Prefer: "return=minimal",
    apikey: "service-key",
  });
  assert.deepEqual(supabase.anonHeaders(), {
    Authorization: "Bearer anon-key",
    "Content-Type": "application/json",
    apikey: "anon-key",
  });
});

test("rest filters empty query values and applies write Prefer headers", async () => {
  const calls = [];
  const supabase = access(async (url, options) => {
    calls.push({ options, url: String(url) });
    return jsonResponse([{ id: "member-1" }]);
  });

  const rows = await supabase.rest("memberships", {
    body: { role: "owner" },
    method: "POST",
    query: { empty: "", select: "*", team_id: "eq.team-1", unset: undefined },
  });

  assert.deepEqual(rows, [{ id: "member-1" }]);
  assert.equal(calls[0].url, "https://supabase.test/rest/v1/memberships?select=*&team_id=eq.team-1");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Prefer, "return=representation");
  assert.equal(calls[0].options.body, JSON.stringify({ role: "owner" }));
});

test("rpc and auth fetchers route through the intended Supabase APIs", async () => {
  const calls = [];
  const supabase = access(async (url, options) => {
    calls.push({ options, url: String(url) });
    return jsonResponse("");
  });

  assert.equal(await supabase.rpc("claim_hosted_rate_limit", { key: "bucket" }), null);
  await supabase.authFetch("token", { body: { email: "a@test.dev" }, method: "POST" });
  await supabase.authAdminFetch("admin/users", { headers: { "X-Test": "1" } });

  assert.equal(calls[0].url, "https://supabase.test/rest/v1/rpc/claim_hosted_rate_limit");
  assert.equal(calls[0].options.headers.Authorization, "Bearer service-key");
  assert.equal(calls[1].url, "https://supabase.test/auth/v1/token");
  assert.equal(calls[1].options.headers.Authorization, "Bearer anon-key");
  assert.equal(calls[2].url, "https://supabase.test/auth/v1/admin/users");
  assert.equal(calls[2].options.headers.Authorization, "Bearer service-key");
  assert.equal(calls[2].options.headers["X-Test"], "1");
});

test("upstream Supabase errors remain unsafe for browser forwarding", async () => {
  const supabase = access(async () => jsonResponse({ message: "RLS denied" }, 403, "Forbidden"));

  await assert.rejects(
    () => supabase.rest("memberships"),
    (err) => err.status === 403 && err.message === "RLS denied" && err.safe === false,
  );
});

test("responseErrorMessage extracts known Supabase/Auth error fields", () => {
  assert.equal(responseErrorMessage(JSON.stringify({ msg: "bad jwt" }), "fallback"), "bad jwt");
  assert.equal(
    responseErrorMessage(JSON.stringify({ error_description: "expired" }), "fallback"),
    "expired",
  );
  assert.equal(responseErrorMessage("plain failure", "fallback"), "plain failure");
  assert.equal(responseErrorMessage("", "fallback"), "fallback");
});
