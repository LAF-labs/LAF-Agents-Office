const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createStartupOfficeProfileHandlers,
} = require("./profileHandlers");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createJSONRecorder() {
  return {
    calls: [],
    writeJSON(res, status, payload) {
      this.calls.push({ payload, status });
      res.status = status;
      res.body = payload;
    },
  };
}

test("company profile handler reads the merged company profile", async () => {
  const json = createJSONRecorder();
  const permissions = [];
  const handlers = createStartupOfficeProfileHandlers({
    companyProfileRowPayload: (profile) => profile,
    createHTTPError,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    objectValue: (value) => value && typeof value === "object" ? value : {},
    publicCompanyProfile({ row, settings, team, user }) {
      return {
        name: row?.name || settings?.company_profile?.name || team.name,
        owner: user.email,
      };
    },
    readBody: async () => ({}),
    requirePermission(membership, permission) {
      permissions.push([membership.team_id, permission]);
    },
    requireUser: async () => ({
      membership: { team_id: "team-1", user_id: "user-1" },
      team: { name: "Acme" },
      user: { email: "founder@example.com" },
    }),
    safeStartupOfficeRest: async (table) => {
      assert.equal(table, "company_profiles");
      return [{ name: "Acme AI" }];
    },
    startupOfficeCompanyProfilePatch: (body) => body,
    startupOfficeRepository: () => ({
      async upsertMemoryPage() {
        throw new Error("GET must not write memory");
      },
    }),
    upsertWorkspaceSettings: async () => ({}),
    workspaceSettings: async () => ({ company_profile: { name: "Settings Name" } }),
    workspaceSettingsPatch: () => ({}),
    writeAuditEvent: async () => {},
    writeJSON: json.writeJSON.bind(json),
  });

  const res = {};
  await handlers.companyProfile({ method: "GET" }, res);

  assert.deepEqual(permissions, [["team-1", "workspace:read"]]);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    profile: {
      name: "Acme AI",
      owner: "founder@example.com",
    },
  });
});

test("company profile handler patches settings, row, and audit event together", async () => {
  const json = createJSONRecorder();
  const restCalls = [];
  const auditCalls = [];
  const memoryWrites = [];
  const handlers = createStartupOfficeProfileHandlers({
    companyProfileRowPayload: (profile) => ({ name: profile.name, stage: profile.stage }),
    createHTTPError,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    objectValue: (value) => value && typeof value === "object" ? value : {},
    publicCompanyProfile({ row, settings }) {
      return {
        name: row?.name,
        settings_stage: settings.company_profile.stage,
      };
    },
    readBody: async () => ({ name: "Acme AI", stage: "paid_beta" }),
    requirePermission() {},
    requireUser: async () => ({
      membership: { team_id: "team-1", user_id: "user-1" },
      team: { name: "Acme" },
      user: { email: "founder@example.com" },
    }),
    safeStartupOfficeRest: async (table, options) => {
      restCalls.push({ options, table });
      return [{ name: options.body.name }];
    },
    startupOfficeCompanyProfilePatch: (body) => ({
      name: body.name,
      stage: body.stage,
    }),
    startupOfficeRepository: () => ({
      async upsertMemoryPage(membership, page) {
        memoryWrites.push({ membership, page });
        return { id: "memory-1", ...page };
      },
    }),
    upsertWorkspaceSettings: async (_teamID, patch) => patch,
    workspaceSettings: async () => ({ company_profile: { name: "Old" } }),
    workspaceSettingsPatch: (_existing, patch) => patch,
    writeAuditEvent: async (...args) => auditCalls.push(args),
    writeJSON: json.writeJSON.bind(json),
  });

  const res = {};
  await handlers.companyProfile({ method: "PATCH" }, res);

  assert.equal(restCalls.length, 1);
  assert.equal(restCalls[0].table, "company_profiles");
  assert.deepEqual(restCalls[0].options.body, {
    name: "Acme AI",
    stage: "paid_beta",
    team_id: "team-1",
    updated_at: "2026-05-25T00:00:00.000Z",
  });
  assert.equal(memoryWrites.length, 1);
  assert.deepEqual(memoryWrites[0].membership, { team_id: "team-1", user_id: "user-1" });
  assert.equal(memoryWrites[0].page.slug, "company-profile");
  assert.equal(memoryWrites[0].page.title, "Company Profile");
  assert.equal(memoryWrites[0].page.status, "approved");
  assert.equal(memoryWrites[0].page.last_verified_at, "2026-05-25T00:00:00.000Z");
  assert.match(memoryWrites[0].page.body, /# Company Profile/);
  assert.match(memoryWrites[0].page.body, /- Name: Acme AI/);
  assert.match(memoryWrites[0].page.body, /- Stage: paid_beta/);
  assert.deepEqual(memoryWrites[0].page.provenance, {
    changed_fields: ["name", "stage"],
    event: "company_profile.updated",
    source: "company_profile",
    updated_at: "2026-05-25T00:00:00.000Z",
    updated_by: "user-1",
  });
  assert.deepEqual(memoryWrites[0].page.sources, [
    {
      actor_user_id: "user-1",
      event: "company_profile.updated",
      fields: ["name", "stage"],
      type: "founder_profile_edit",
      updated_at: "2026-05-25T00:00:00.000Z",
    },
  ]);
  assert.equal(auditCalls[0][1], "company_profile.updated");
  assert.deepEqual(auditCalls[0][4], {
    fields: ["name", "stage"],
    memory_page_slug: "company-profile",
  });
  assert.deepEqual(res.body, {
    profile: {
      name: "Acme AI",
      settings_stage: "paid_beta",
    },
    status: "ok",
  });
});
