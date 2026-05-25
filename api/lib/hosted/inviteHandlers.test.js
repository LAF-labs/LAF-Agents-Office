const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  createHostedInviteHandlers,
  inviteEmail,
} = require("./inviteHandlers");
const { normalizeRole } = require("./permissions");

const membership = Object.freeze({
  created_at: "2026-05-25T00:00:00.000Z",
  role: "admin",
  team_id: "team-1",
  user_id: "admin-1",
});
const team = Object.freeze({ id: "team-1", name: "Acme", slug: "acme" });
const user = Object.freeze({
  email: "founder@example.com",
  id: "user-1",
  user_metadata: { name: "Founder" },
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
}

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError,
    normalizeRole,
    nowISO: () => "2026-05-25T12:00:00.000Z",
    originFor: () => "https://office.example.com",
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership, team, user };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        limits: { seat_limit: 5 },
        usage: { pending_invites: 0, seats: 1 },
      };
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
      _res.status = status;
      _res.body = body;
    },
    ...overrides,
  };
  return deps;
}

test("invite list returns pending invites without exposing plaintext tokens", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        {
          created_by: "admin-1",
          email: "member@example.com",
          id: "invite-1",
          role: "member",
          status: "pending",
        },
      ];
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.invites({ method: "GET" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.invites[0].invite_url, "");
  assert.equal(res.body.invites[0].token, undefined);
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
});

test("invite creation stores only a token hash and returns a one-time URL", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        channel: "email",
        email: " New.Member@Example.com ",
        name: "New Member",
        role: "owner",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        {
          ...options.body,
          created_at: "2026-05-25T12:00:00.000Z",
          id: "invite-1",
        },
      ];
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.invites({ method: "POST" }, res);

  const inserted = deps.calls.rest[0].options.body;
  assert.equal(deps.calls.permissions[0].permission, "member:invite");
  assert.equal(inserted.email, "new.member@example.com");
  assert.equal(inserted.role, "member");
  assert.match(inserted.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(res.body.invite.token, undefined);
  assert.match(res.body.invite.mailto_url, /^mailto:new\.member%40example\.com/);
  assert.match(res.body.one_time_invite_url, /^https:\/\/office\.example\.com\/invite\/laf_invite_/);
  const token = decodeURIComponent(res.body.one_time_invite_url.split("/invite/")[1]);
  assert.equal(inserted.token_hash, hashToken(token));
  assert.equal(deps.calls.audits[0][1], "invite.created");
});

test("invite creation sends transactional email when provider is configured", async () => {
  const emails = [];
  const deps = baseDeps({
    async readBody() {
      return {
        email: "member@example.com",
        name: "Member",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") return [{ id: "invite-1", ...options.body }];
      return [
        {
          ...options.body,
          created_at: "2026-05-25T12:00:00.000Z",
          id: "invite-1",
        },
      ];
    },
    async sendInviteEmail(email) {
      emails.push(email);
      return { message_id: "email-1", provider: "fake-email" };
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.invites({ method: "POST" }, res);

  assert.equal(res.body.email_sent, true);
  assert.deepEqual(res.body.email_delivery, { message_id: "email-1", provider: "fake-email" });
  assert.equal(emails[0].to, "member@example.com");
  assert.match(emails[0].text, /https:\/\/office\.example\.com\/invite\/laf_invite_/);
  const patch = deps.calls.rest.find((call) => call.options.method === "PATCH");
  assert.deepEqual(patch.options.body, {
    send_error: "",
    send_status: "sent",
    sent_at: "2026-05-25T12:00:00.000Z",
  });
});

test("invite creation records email failure without losing the one-time link", async () => {
  const deps = baseDeps({
    async readBody() {
      return { email: "member@example.com" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") return [{ id: "invite-1", ...options.body }];
      return [
        {
          ...options.body,
          created_at: "2026-05-25T12:00:00.000Z",
          id: "invite-1",
        },
      ];
    },
    async sendInviteEmail() {
      throw new Error("provider rejected sender");
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.invites({ method: "POST" }, res);

  assert.equal(res.body.email_sent, false);
  assert.equal(res.body.email_error, "provider rejected sender");
  assert.match(res.body.one_time_invite_url, /^https:\/\/office\.example\.com\/invite\/laf_invite_/);
  const patch = deps.calls.rest.find((call) => call.options.method === "PATCH");
  assert.deepEqual(patch.options.body, {
    send_error: "provider rejected sender",
    send_status: "failed",
  });
});

test("invite creation enforces the closed beta seat limit before persistence", async () => {
  const deps = baseDeps({
    async readBody() {
      return { email: "blocked@example.com" };
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        limits: { seat_limit: 2 },
        usage: { pending_invites: 1, seats: 1 },
      };
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  await assert.rejects(
    () => handlers.invites({ method: "POST" }, {}),
    (err) => err.status === 402 && err.message === "closed beta seat limit reached",
  );
  assert.equal(deps.calls.rest.length, 0);
  assert.equal(deps.calls.audits.length, 0);
});

test("invite lookup requires a pending invite", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        {
          email: "member@example.com",
          id: "invite-1",
          role: "member",
          status: "pending",
        },
      ];
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.inviteLookup({ method: "GET", query: { token: "laf_invite_known" } }, res);

  assert.equal(deps.calls.rest[0].options.query.token_hash, `eq.${hashToken("laf_invite_known")}`);
  assert.equal(res.body.invite.id, "invite-1");
});

test("invite accept validates team membership and records acceptance", async () => {
  const deps = baseDeps({
    async readBody() {
      return { name: "Accepted Founder", token: "laf_invite_known" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") return [{ id: "invite-1" }];
      return [
        {
          email: "founder@example.com",
          id: "invite-1",
          role: "member",
          status: "pending",
          team_id: "team-1",
        },
      ];
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  const res = {};
  await handlers.inviteAccept({ method: "POST" }, res);

  const patch = deps.calls.rest.find((call) => call.options.method === "PATCH");
  assert.deepEqual(patch.options.body, {
    accepted_at: "2026-05-25T12:00:00.000Z",
    accepted_by: "user-1",
    status: "accepted",
  });
  assert.equal(res.body.member.name, "Accepted Founder");
  assert.equal(res.body.member.team_id, "team-1");
  assert.equal(res.body.invite.status, "accepted");
});

test("invite accept rejects a token from another workspace", async () => {
  const deps = baseDeps({
    async readBody() {
      return { token: "laf_invite_other" };
    },
    async rest() {
      return [
        {
          id: "invite-1",
          status: "pending",
          team_id: "team-other",
        },
      ];
    },
  });
  const handlers = createHostedInviteHandlers(deps);

  await assert.rejects(
    () => handlers.inviteAccept({ method: "POST" }, {}),
    (err) => err.status === 403 && err.message === "active session is for a different team",
  );
});

test("invite email escapes html", () => {
  const email = inviteEmail({
    invite: { email: "member@example.com", name: "<Member>" },
    invite_url: "https://office.example.com/invite/abc<script>",
    team_name: "<Acme>",
  });
  assert.equal(email.subject, "You're invited to <Acme>");
  assert.match(email.html, /&lt;Member&gt;/);
  assert.match(email.html, /abc&lt;script&gt;/);
});
