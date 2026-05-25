const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedMemoryHandlers,
} = require("./memoryHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    writes: [],
  };
  const repository = {
    async memoryPages(teamID, options) {
      calls.memoryPages = { options, teamID };
      return [
        {
          body: "Talk to design partners before pricing.",
          id: "memory-1",
          provenance: { key: "pricing", namespace: "human-notes" },
          slug: "human-notes-pricing",
          summary: "Talk to design partners",
        },
      ];
    },
    async upsertMemoryPage(_membership, body) {
      calls.upsertMemoryPage = body;
      return { id: "memory-1", ...body };
    },
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    shortID() {
      return "short";
    },
    slugify(value) {
      return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    },
    startupOfficeRepository() {
      return repository;
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("memory handler reads approved Startup Office memory pages", async () => {
  const deps = baseDeps();
  const handlers = createHostedMemoryHandlers(deps);

  await handlers.memory({ method: "GET", query: { limit: "7" } }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.memoryPages, {
    options: { limit: 7, status: "approved" },
    teamID: "team-1",
  });
  assert.deepEqual(deps.calls.writes[0].body.namespaces, ["human-notes"]);
  assert.equal(
    deps.calls.writes[0].body.memory["human-notes"].pricing,
    "Talk to design partners before pricing.",
  );
});

test("memory handler saves human notes as approved memory pages", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        key: "ICP",
        namespace: "founder-notes",
        value: "Sell to solo B2B founders first.",
      };
    },
  });
  const handlers = createHostedMemoryHandlers(deps);

  await handlers.memory({ method: "POST" }, {});

  assert.equal(deps.calls.permissions[0].permission, "memory:write_draft");
  assert.deepEqual(deps.calls.upsertMemoryPage, {
    body: "Sell to solo B2B founders first.",
    provenance: {
      key: "ICP",
      namespace: "founder-notes",
      source: "hosted_memory_endpoint",
    },
    slug: "founder-notes-icp",
    status: "approved",
    summary: "Sell to solo B2B founders first.",
    title: "founder-notes: ICP",
  });
  assert.equal(deps.calls.audits[0][1], "memory.note_saved");
  assert.equal(deps.calls.writes[0].body.ok, true);
});

test("memory handler validates writes and methods", async () => {
  const handlers = createHostedMemoryHandlers(baseDeps());

  await assert.rejects(
    () => handlers.memory({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "memory value is required",
  );
  await assert.rejects(
    () => handlers.memory({ method: "DELETE" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
