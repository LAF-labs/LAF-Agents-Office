const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSkillHandlers,
  permissionRequirementList,
  skillRequiredPermissions,
} = require("./skillHandlers");

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
    },
    async readBody() {
      return {};
    },
    requirePermission(_membership, permission) {
      calls.permissions.push(permission);
    },
    async requireUser() {
      return {
        membership: { team_id: "team-1", user_id: "user-1" },
      };
    },
    async rest(table, options = {}) {
      calls.rest.push({ options, table });
      return [];
    },
    async writeAuditEvent(membership, action, targetType, targetID, metadata = {}) {
      calls.audits.push({ action, membership, metadata, targetID, targetType });
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("skill permission helpers normalize direct and JSON manifest requirements", () => {
  assert.deepEqual(permissionRequirementList([" skill:read ", "", "skill:read"]), [
    "skill:read",
  ]);
  assert.deepEqual(
    skillRequiredPermissions({
      content: JSON.stringify({ manifest: { required_permissions: ["customer:write"] } }),
      required_permissions: ["skill:invoke", "skill:invoke"],
      workflow_definition: JSON.stringify({ required_permissions: ["asset:write"] }),
    }),
    ["skill:invoke", "asset:write", "customer:write"],
  );
});

test("skills handler lists active skills with read permission", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ id: "skill-1", name: "research" }];
    },
  });
  const handlers = createHostedSkillHandlers(deps);

  await handlers.skills({ method: "GET" }, {});

  assert.deepEqual(deps.calls.permissions, ["skill:read"]);
  assert.equal(deps.calls.rest[0].table, "skills");
  assert.equal(deps.calls.rest[0].options.query.status, "neq.archived");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.skills[0].name, "research");
});

test("skills handler creates proposed skills and records audit", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        name: "draft-offer",
        required_permissions: [" customer:read ", "customer:read"],
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ id: "skill-2", name: options.body.name, status: options.body.status }];
    },
  });
  const handlers = createHostedSkillHandlers(deps);

  await handlers.skills({ method: "POST" }, {});

  assert.deepEqual(deps.calls.permissions, ["skill:propose"]);
  assert.equal(deps.calls.rest[0].options.body.status, "proposed");
  assert.deepEqual(deps.calls.rest[0].options.body.required_permissions, ["customer:read"]);
  assert.equal(deps.calls.audits[0].action, "skill.created");
});

test("skills handler approval path requires skill approve permission", async () => {
  const deps = baseDeps({
    async readBody() {
      return { name: "draft-offer", status: "active" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (!options.method) return [{ id: "skill-3", name: "draft-offer", status: "proposed" }];
      return [{ id: "skill-3", name: "draft-offer", status: options.body.status }];
    },
  });
  const handlers = createHostedSkillHandlers(deps);

  await handlers.skills({ method: "PUT" }, {});

  assert.deepEqual(deps.calls.permissions, ["skill:approve"]);
  assert.equal(deps.calls.rest[1].options.body.approved_by, "user-1");
  assert.equal(deps.calls.audits[0].action, "skill.updated");
});

test("skill invoke requires declared skill permissions and increments usage", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (!options.method) {
        return [{
          content: JSON.stringify({ required_permissions: ["signal:read"] }),
          id: "skill-4",
          name: "research",
          required_permissions: ["customer:read"],
          usage_count: 2,
        }];
      }
      return [{
        id: "skill-4",
        name: "research",
        usage_count: options.body.usage_count,
      }];
    },
  });
  const handlers = createHostedSkillHandlers(deps);

  await handlers.skillInvoke({ method: "POST" }, {}, "research");

  assert.deepEqual(deps.calls.permissions, [
    "skill:read",
    "skill:invoke",
    "customer:read",
    "signal:read",
  ]);
  assert.equal(deps.calls.rest[1].options.body.usage_count, 3);
  assert.equal(deps.calls.audits[0].action, "skill.invoked");
  assert.equal(deps.calls.writes[0].body.skill.usage_count, 3);
});
