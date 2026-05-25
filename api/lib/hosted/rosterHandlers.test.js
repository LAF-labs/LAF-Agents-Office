const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedRosterHandlers,
  hostedOfficeMember,
  hostedOfficeMembers,
} = require("./rosterHandlers");

const user = Object.freeze({
  email: "founder@example.com",
  user_metadata: { name: "Founder" },
});

function baseDeps(overrides = {}) {
  const calls = {
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    publicTeam(row) {
      return { id: row.id, name: row.name, slug: row.slug };
    },
    async readBody() {
      return {};
    },
    async requireUser() {
      return {
        membership: { team_id: "team-1", user_id: "user-1" },
        team: { id: "team-1", name: "Acme", slug: "acme" },
        user,
      };
    },
    shortID() {
      return "short";
    },
    slugify(value) {
      return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("roster helpers serialize built-in office members", () => {
  assert.equal(hostedOfficeMember({ name: "Growth", slug: "growth" }).status, "idle");
  const members = hostedOfficeMembers(user);
  assert.equal(members[0].slug, "human");
  assert.ok(members.some((member) => member.slug === "ceo"));
});

test("humans and teams handlers return current workspace identities", async () => {
  const deps = baseDeps();
  const handlers = createHostedRosterHandlers(deps);

  await handlers.humans({ method: "GET" }, {});
  await handlers.teams({ method: "GET" }, {});

  assert.equal(deps.calls.writes[0].body.humans[0].email, "founder@example.com");
  assert.equal(deps.calls.writes[0].body.humans[0].team_id, "team-1");
  assert.deepEqual(deps.calls.writes[1].body.teams, [
    { id: "team-1", name: "Acme", slug: "acme" },
  ]);
});

test("office member handlers list, create, and generate hosted agents", async () => {
  const deps = baseDeps({
    async readBody() {
      return { name: "Growth Lead", prompt: "Customer research", role: "Growth" };
    },
  });
  const handlers = createHostedRosterHandlers(deps);

  await handlers.officeMembers({ method: "GET" }, {});
  await handlers.officeMembers({ method: "POST" }, {});
  await handlers.officeMemberGenerate({ method: "POST" }, {});
  await handlers.channelMembers({ method: "GET" }, {});

  assert.equal(deps.calls.writes[0].body.members[0].slug, "human");
  assert.deepEqual(deps.calls.writes[1].body.member, {
    activity: "",
    built_in: false,
    detail: "",
    name: "Growth Lead",
    provider: { kind: "claude-code" },
    role: "Growth",
    slug: "growth-lead",
    status: "idle",
  });
  assert.equal(deps.calls.writes[2].body.slug, "customer-research");
  assert.equal(deps.calls.writes[3].body.members[0].slug, "human");
});

test("office member handler rejects unsupported methods", async () => {
  const handlers = createHostedRosterHandlers(baseDeps());

  await assert.rejects(
    () => handlers.officeMembers({ method: "PATCH" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
