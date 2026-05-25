const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeTermsHandlers,
} = require("./termsHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    termsPatches: [],
    writes: [],
  };
  return {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
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
    async startupOfficeBetaOpsSnapshot() {
      return { terms: { accepted: false } };
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async upsertStartupOfficeTermsAcceptance(_membership, patch) {
      calls.termsPatches.push(patch);
      return { id: "terms-acceptance-1", ...patch };
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("terms handler reads the current terms package and beta ops snapshot", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeTermsHandlers(deps);

  await handlers.terms({ method: "GET" }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.terms.terms_version, "startup-office-beta-terms-2026-05-26");
  assert.deepEqual(deps.calls.writes[0].body.beta_ops, { terms: { accepted: false } });
});

test("terms handler accepts the current package and writes an audit event", async () => {
  const deps = baseDeps({
    async readBody() {
      return { acceptance_note: "accepted by founder" };
    },
  });
  const handlers = createStartupOfficeTermsHandlers(deps);

  await handlers.terms({ method: "POST" }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:manage");
  assert.equal(deps.calls.termsPatches[0].accepted_by, "user-1");
  assert.equal(deps.calls.termsPatches[0].acceptance_note, "accepted by founder");
  assert.equal(deps.calls.audits[0][1], "startup_office.terms_accepted");
  assert.equal(deps.calls.audits[0][4].privacy_version, "startup-office-privacy-2026-05-26");
  assert.equal(deps.calls.writes[0].body.status, "ok");
});

test("terms handler preserves typed 405 errors", async () => {
  const handlers = createStartupOfficeTermsHandlers(baseDeps());
  await assert.rejects(
    () => handlers.terms({ method: "PATCH" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
