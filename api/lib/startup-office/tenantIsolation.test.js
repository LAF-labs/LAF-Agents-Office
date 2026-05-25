const assert = require("node:assert/strict");
const test = require("node:test");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.LAF_OFFICE_ALLOWED_ORIGINS = "app.laf.test";
process.env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER = "fake";

const handler = require("../../[...path].js");

const TEAM_ALPHA = "team-alpha";
const TEAM_BETA = "team-beta";
const USER_ALPHA = "user-alpha";

test.beforeEach(() => {
  handler.__test.resetRateLimits();
});

test("hosted API reads only caller workspace records when IDs collide", async () => {
  await withTenantAPI(async ({ tables }) => {
    const runDetail = await invoke("startup-office/runs/shared-run", "GET", {});

    assert.equal(runDetail.status, 200);
    assert.equal(runDetail.body.run.title, "Alpha run");
    assert.deepEqual(runDetail.body.artifacts.map((row) => row.title), [
      "Alpha artifact",
    ]);
    assert.deepEqual(runDetail.body.approvals.map((row) => row.title), [
      "Alpha approval",
    ]);
    assert.deepEqual(runDetail.body.receipts.map((row) => row.summary), [
      "Alpha receipt",
    ]);
    assertNoBetaData(runDetail.body);

    const exportResponse = await invoke("startup-office/export", "GET", {});

    assert.equal(exportResponse.status, 200);
    assert.deepEqual(exportResponse.body.export.assets.map((row) => row.name), [
      "Alpha asset",
    ]);
    assert.deepEqual(exportResponse.body.export.customers.map((row) => row.name), [
      "Alpha customer",
    ]);
    assert.deepEqual(exportResponse.body.export.runs.map((row) => row.title), [
      "Alpha run",
    ]);
    assert.deepEqual(exportResponse.body.export.memory_pages.map((row) => row.title), [
      "Alpha memory",
    ]);
    assertNoBetaData(exportResponse.body);

    const profileResponse = await invoke("company/profile", "GET", {});

    assert.equal(profileResponse.status, 200);
    assert.equal(profileResponse.body.profile.name, "Alpha Inc");
    assert.equal(profileResponse.body.profile.team_id, TEAM_ALPHA);
    assertNoBetaData(profileResponse.body);
    assert.equal(tables.company_profiles.find((row) => row.team_id === TEAM_BETA).name, "Beta Inc");
  });
});

test("hosted API writes caller workspace only when request carries another team id", async () => {
  await withTenantAPI(async ({ calls, tables }) => {
    const createResponse = await invoke("startup-office/assets", "POST", {
      body: "Do not cross tenant boundaries.",
      kind: "document",
      metadata: { requested_team_id: TEAM_BETA },
      name: "Injected asset",
      team_id: TEAM_BETA,
    });

    assert.equal(createResponse.status, 200);
    assert.equal(createResponse.body.asset.name, "Injected asset");
    const created = tables.startup_office_assets.find(
      (row) => row.name === "Injected asset",
    );
    assert.equal(created.team_id, TEAM_ALPHA);
    assert.equal(
      tables.startup_office_assets.some(
        (row) => row.name === "Injected asset" && row.team_id === TEAM_BETA,
      ),
      false,
    );

    const patchResponse = await invoke("startup-office/assets/shared-asset", "PATCH", {
      name: "Alpha asset patched",
      team_id: TEAM_BETA,
    });

    assert.equal(patchResponse.status, 200);
    assert.equal(
      tables.startup_office_assets.find(
        (row) => row.id === "shared-asset" && row.team_id === TEAM_ALPHA,
      ).name,
      "Alpha asset patched",
    );
    assert.equal(
      tables.startup_office_assets.find(
        (row) => row.id === "shared-asset" && row.team_id === TEAM_BETA,
      ).name,
      "Beta asset",
    );
    assert.equal(
      calls.find(
        (call) =>
          call.table === "startup_office_assets" &&
          call.options.method === "PATCH",
      ).options.query.team_id,
      `eq.${TEAM_ALPHA}`,
    );
  });
});

test("workflow mutations cannot update another workspace record with the same ID", async () => {
  await withTenantAPI(async ({ tables }) => {
    const cancelResponse = await invoke(
      "startup-office/runs/shared-run/cancel",
      "POST",
      {},
    );

    assert.equal(cancelResponse.status, 200);
    assert.equal(cancelResponse.body.status, "canceled");
    assert.equal(
      tables.startup_office_runs.find(
        (row) => row.id === "shared-run" && row.team_id === TEAM_ALPHA,
      ).status,
      "canceled",
    );
    assert.equal(
      tables.startup_office_runs.find(
        (row) => row.id === "shared-run" && row.team_id === TEAM_BETA,
      ).status,
      "queued",
    );
    assert.equal(
      tables.startup_office_approvals.find(
        (row) => row.id === "shared-approval" && row.team_id === TEAM_ALPHA,
      ).status,
      "rejected",
    );
    assert.equal(
      tables.startup_office_approvals.find(
        (row) => row.id === "shared-approval" && row.team_id === TEAM_BETA,
      ).status,
      "pending",
    );
  });
});

async function withTenantAPI(callback) {
  const originalFetch = global.fetch;
  const tables = tenantTables();
  const calls = [];
  global.fetch = async (url, options = {}) =>
    fakeSupabaseFetch({ calls, options, tables, url });
  try {
    return await callback({ calls, tables });
  } finally {
    global.fetch = originalFetch;
  }
}

async function invoke(routePath, method, body) {
  const headers = {};
  const req = {
    body,
    headers: {
      authorization: "Bearer user-token",
      host: "office.test",
    },
    method,
    query: { path: routePath },
  };
  const chunks = [];
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
    },
  };
  await handler(req, res);
  const text = Buffer.concat(chunks).toString("utf8");
  return {
    body: text ? JSON.parse(text) : null,
    headers,
    status: res.statusCode,
  };
}

async function fakeSupabaseFetch({ calls, options, tables, url }) {
  const parsed = new URL(String(url));
  const method = String(options.method || "GET").toUpperCase();

  if (parsed.pathname === "/auth/v1/user") {
    return jsonResponse(200, {
      created_at: "2026-05-25T00:00:00.000Z",
      email: "founder@alpha.test",
      id: USER_ALPHA,
      user_metadata: { name: "Alpha Founder" },
    });
  }

  const restMatch = parsed.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (!restMatch) return jsonResponse(404, { message: "not found" });

  const table = decodeURIComponent(restMatch[1]);
  const query = Object.fromEntries(parsed.searchParams.entries());
  const body = options.body ? JSON.parse(options.body) : undefined;
  const restOptions = { body, method, query };
  calls.push({ options: restOptions, table });
  const rows = tables[table] || (tables[table] = []);

  if (method === "GET") {
    return jsonResponse(200, selectRows(rows, query));
  }
  if (method === "POST") {
    const row = {
      id: body?.id || `${table}-${rows.length + 1}`,
      created_at: "2026-05-25T00:00:00.000Z",
      ...body,
    };
    const conflictKeys = String(query.on_conflict || "").split(",").filter(Boolean);
    if (conflictKeys.length) {
      const index = rows.findIndex((candidate) =>
        conflictKeys.every((key) => candidate[key] === row[key]),
      );
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
        return jsonResponse(200, [rows[index]]);
      }
    }
    rows.push(row);
    return jsonResponse(200, [row]);
  }
  if (method === "PATCH") {
    const matched = selectRows(rows, query);
    for (const row of matched) Object.assign(row, body);
    return jsonResponse(200, matched);
  }
  if (method === "DELETE") {
    const matched = selectRows(rows, query);
    for (const row of matched) {
      const index = rows.indexOf(row);
      if (index >= 0) rows.splice(index, 1);
    }
    return jsonResponse(200, matched);
  }
  return jsonResponse(405, { message: "method not allowed" });
}

function selectRows(rows, query) {
  const selected = rows.filter((row) => rowMatches(row, query));
  const limit = Number(query.limit || 0);
  return limit > 0 ? selected.slice(0, limit) : selected;
}

function rowMatches(row, query) {
  for (const [key, filter] of Object.entries(query)) {
    if (["limit", "on_conflict", "order", "select"].includes(key)) continue;
    if (!filterMatches(row[key], filter)) return false;
  }
  return true;
}

function filterMatches(value, filter) {
  const raw = String(filter || "");
  if (raw.startsWith("eq.")) return String(value ?? "") === raw.slice(3);
  if (raw.startsWith("neq.")) return String(value ?? "") !== raw.slice(4);
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    return raw.slice(4, -1).split(",").includes(String(value ?? ""));
  }
  return true;
}

function jsonResponse(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    async text() {
      return JSON.stringify(value);
    },
  };
}

function assertNoBetaData(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /Beta/);
  assert.doesNotMatch(text, new RegExp(TEAM_BETA));
}

function tenantTables() {
  return {
    audit_events: [],
    company_profiles: [
      {
        description: "Alpha company profile",
        name: "Alpha Inc",
        team_id: TEAM_ALPHA,
        updated_at: "2026-05-25T00:00:00.000Z",
      },
      {
        description: "Beta company profile",
        name: "Beta Inc",
        team_id: TEAM_BETA,
        updated_at: "2026-05-25T00:00:00.000Z",
      },
    ],
    memberships: [
      {
        id: "membership-alpha",
        permissions: {},
        role: "owner",
        status: "active",
        team_id: TEAM_ALPHA,
        user_id: USER_ALPHA,
      },
    ],
    startup_office_approvals: [
      {
        action: "approve_loop_draft",
        artifact_id: "shared-artifact",
        id: "shared-approval",
        metadata: {},
        requested_by: USER_ALPHA,
        risk_level: "medium",
        run_id: "shared-run",
        status: "pending",
        team_id: TEAM_ALPHA,
        title: "Alpha approval",
      },
      {
        action: "approve_loop_draft",
        artifact_id: "shared-artifact",
        id: "shared-approval",
        metadata: {},
        requested_by: "user-beta",
        risk_level: "medium",
        run_id: "shared-run",
        status: "pending",
        team_id: TEAM_BETA,
        title: "Beta approval",
      },
    ],
    startup_office_artifacts: [
      {
        content: "Alpha artifact body",
        id: "shared-artifact",
        kind: "draft",
        metadata: {},
        run_id: "shared-run",
        team_id: TEAM_ALPHA,
        title: "Alpha artifact",
      },
      {
        content: "Beta artifact body",
        id: "shared-artifact",
        kind: "draft",
        metadata: {},
        run_id: "shared-run",
        team_id: TEAM_BETA,
        title: "Beta artifact",
      },
    ],
    startup_office_assets: [
      {
        body: "Alpha asset body",
        id: "shared-asset",
        kind: "document",
        metadata: {},
        name: "Alpha asset",
        status: "active",
        team_id: TEAM_ALPHA,
      },
      {
        body: "Beta asset body",
        id: "shared-asset",
        kind: "document",
        metadata: {},
        name: "Beta asset",
        status: "active",
        team_id: TEAM_BETA,
      },
    ],
    startup_office_customers: [
      {
        id: "shared-customer",
        name: "Alpha customer",
        status: "qualified",
        team_id: TEAM_ALPHA,
      },
      {
        id: "shared-customer",
        name: "Beta customer",
        status: "qualified",
        team_id: TEAM_BETA,
      },
    ],
    startup_office_memory_pages: [
      {
        body: "Alpha memory body",
        id: "shared-memory",
        slug: "shared-memory",
        status: "approved",
        team_id: TEAM_ALPHA,
        title: "Alpha memory",
      },
      {
        body: "Beta memory body",
        id: "shared-memory",
        slug: "shared-memory",
        status: "approved",
        team_id: TEAM_BETA,
        title: "Beta memory",
      },
    ],
    startup_office_metrics: [
      {
        id: "shared-metric",
        metric_key: "mrr",
        metric_value: 1000,
        team_id: TEAM_ALPHA,
        unit: "usd",
      },
      {
        id: "shared-metric",
        metric_key: "mrr",
        metric_value: 9000,
        team_id: TEAM_BETA,
        unit: "usd",
      },
    ],
    startup_office_receipts: [
      {
        actor_slug: "agent",
        id: "shared-receipt",
        run_id: "shared-run",
        summary: "Alpha receipt",
        team_id: TEAM_ALPHA,
        trace: {},
      },
      {
        actor_slug: "agent",
        id: "shared-receipt",
        run_id: "shared-run",
        summary: "Beta receipt",
        team_id: TEAM_BETA,
        trace: {},
      },
    ],
    startup_office_runs: [
      {
        id: "shared-run",
        inputs: {},
        loop_id: "shared-loop",
        metadata: {},
        objective: "Alpha objective",
        status: "queued",
        summary: "",
        team_id: TEAM_ALPHA,
        title: "Alpha run",
      },
      {
        id: "shared-run",
        inputs: {},
        loop_id: "shared-loop",
        metadata: {},
        objective: "Beta objective",
        status: "queued",
        summary: "",
        team_id: TEAM_BETA,
        title: "Beta run",
      },
    ],
    startup_office_signals: [
      {
        body: "Alpha signal body",
        id: "shared-signal",
        signal_type: "market",
        status: "new",
        team_id: TEAM_ALPHA,
        title: "Alpha signal",
      },
      {
        body: "Beta signal body",
        id: "shared-signal",
        signal_type: "market",
        status: "new",
        team_id: TEAM_BETA,
        title: "Beta signal",
      },
    ],
    teams: [
      {
        id: TEAM_ALPHA,
        name: "Alpha Office",
        slug: "alpha-office",
      },
    ],
    workspace_settings: [
      {
        company_profile: {
          name: "Alpha Settings",
        },
        preferences: {},
        team_id: TEAM_ALPHA,
      },
      {
        company_profile: {
          name: "Beta Settings",
        },
        preferences: {},
        team_id: TEAM_BETA,
      },
    ],
  };
}
