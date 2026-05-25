const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedConversationHandlers,
} = require("./conversationHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "11111111-1111-4111-8111-111111111111",
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const calls = {
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    createHTTPError,
    isHuman(slug) {
      return slug === "human" || slug === "you";
    },
    normalizeModelMode(value) {
      return value === "laf_model" ? "laf_model" : "record_only";
    },
    nowISO: () => "2026-05-25T12:00:00.000Z",
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    async readBody() {
      return {};
    },
    async requireUser() {
      return { membership };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    async rpc(name, body) {
      calls.rpc = calls.rpc || [];
      calls.rpc.push({ body, name });
      return [];
    },
    shortID: () => "shortid",
    slugify(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    },
    truncateText(value, max) {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text.length > max ? `${text.slice(0, max - 1)}...` : text;
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

test("channels handler returns the hosted general channel and creates custom channels", async () => {
  const deps = baseDeps({
    async readBody() {
      return { description: "Growth room", name: "Growth Ops" };
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const listRes = {};
  await handlers.channels({ method: "GET" }, listRes);
  assert.equal(listRes.body.channels[0].slug, "general");
  assert.equal(listRes.body.channels[0].type, "public");

  const createRes = {};
  await handlers.channels({ method: "POST" }, createRes);
  assert.equal(createRes.body.slug, "growth-ops");
  assert.equal(createRes.body.description, "Growth room");
});

test("generated and direct channels use stable hosted channel shapes", async () => {
  const deps = baseDeps({
    async readBody(req) {
      if (req.kind === "dm") return { members: ["human", "ceo"] };
      return { prompt: "Launch Planning" };
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const generateRes = {};
  await handlers.channelGenerate({ kind: "generate", method: "POST" }, generateRes);
  assert.equal(generateRes.body.slug, "launch-planning");
  assert.equal(generateRes.body.name, "Launch Planning");

  const dmRes = {};
  await handlers.dmChannel({ kind: "dm", method: "POST" }, dmRes);
  assert.equal(dmRes.body.slug, "dm-ceo");
  assert.equal(dmRes.body.type, "direct");
  assert.deepEqual(dmRes.body.members, ["human", "ceo"]);
});

test("messages handler lists, filters, and serializes channel messages", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        { id: "old", channel: "general", content: "old", created_at: "2026-05-25T10:00:00.000Z" },
        {
          id: "msg-1",
          channel: "general",
          content: "keep",
          created_at: "2026-05-25T11:00:00.000Z",
          sender_slug: "human",
          thread_id: "thread-1",
        },
        { id: "deleted", channel: "general", content: "deleted", deleted_at: "now" },
      ];
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const res = {};
  await handlers.messages({
    method: "GET",
    query: { channel: "general", limit: "20", since_id: "old", thread_id: "thread-1" },
  }, res);

  assert.equal(deps.calls.rest[0].table, "channel_messages");
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
  assert.deepEqual(res.body.messages.map((message) => message.id), ["msg-1"]);
  assert.equal(res.body.messages[0].from, "human");
});

test("messages handler creates normalized channel messages", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        audience: [" founder ", ""],
        channel: "ops",
        content: "  Ship it  ",
        from: "human",
        home_session_thread_id: "home-1",
        metadata: { source: "test" },
        model_mode: "laf_model",
        tagged: ["ceo"],
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ ...options.body, id: "msg-1" }];
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const res = {};
  await handlers.messages({ method: "POST" }, res);

  const body = deps.calls.rest[0].options.body;
  assert.equal(body.content, "Ship it");
  assert.deepEqual(body.audience, ["founder"]);
  assert.equal(body.thread_id, "home-1");
  assert.equal(body.model_mode, "laf_model");
  assert.equal(res.body.id, "msg-1");
  assert.equal(res.body.thread_id, "home-1");
});

test("message reaction handler persists a per-user reaction toggle", async () => {
  const deps = baseDeps({
    async readBody() {
      return { channel: "general", emoji: "👍", message_id: "22222222-2222-4222-8222-222222222222" };
    },
    async rpc(name, body) {
      deps.calls.rpc = deps.calls.rpc || [];
      deps.calls.rpc.push({ body, name });
      return [{
        channel: "general",
        content: "React to this",
        id: "22222222-2222-4222-8222-222222222222",
        reactions: { "👍": ["11111111-1111-4111-8111-111111111111", "other-user"] },
        sender_slug: "human",
      }];
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const res = {};
  await handlers.messageReaction({ method: "POST" }, res);

  assert.deepEqual(deps.calls.rpc[0], {
    name: "toggle_channel_message_reaction",
    body: {
      p_channel: "general",
      p_emoji: "👍",
      p_message_id: "22222222-2222-4222-8222-222222222222",
      p_team_id: "team-1",
      p_user_id: "11111111-1111-4111-8111-111111111111",
    },
  });
  assert.deepEqual(res.body.reaction, {
    active: true,
    count: 2,
    emoji: "👍",
  });
  assert.deepEqual(res.body.message.reactions, {
    "👍": ["11111111-1111-4111-8111-111111111111", "other-user"],
  });
});

test("message reaction handler removes an existing reaction and validates input", async () => {
  const deps = baseDeps({
    async readBody(req) {
      if (req.kind === "bad") return { emoji: "", message_id: "" };
      return { channel: "general", emoji: "🚀", message_id: "22222222-2222-4222-8222-222222222222" };
    },
    async rpc(name, body) {
      deps.calls.rpc = deps.calls.rpc || [];
      deps.calls.rpc.push({ body, name });
      return [{
        channel: "general",
        content: "React to this",
        id: "22222222-2222-4222-8222-222222222222",
        reactions: {},
        sender_slug: "human",
      }];
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const res = {};
  await handlers.messageReaction({ method: "POST" }, res);

  assert.deepEqual(res.body.reaction, {
    active: false,
    count: 0,
    emoji: "🚀",
  });
  assert.deepEqual(res.body.message.reactions, {});
  await assert.rejects(
    () => handlers.messageReaction({ kind: "bad", method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "message_id is required",
  );
});

test("home sessions list summaries and delete by thread id", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") return [{ id: "msg-1" }];
      return [
        {
          content: "@ceo validate the launch plan",
          created_at: "2026-05-25T10:00:00.000Z",
          home_session_thread_id: "base:1",
          id: "msg-1",
          sender_slug: "human",
        },
        {
          content: "agent reply",
          created_at: "2026-05-25T11:00:00.000Z",
          home_session_thread_id: "base:1",
          id: "msg-2",
          sender_slug: "ceo",
        },
      ];
    },
  });
  const handlers = createHostedConversationHandlers(deps);

  const listRes = {};
  await handlers.homeSessions({ method: "GET", query: { base_thread_id: "base" } }, listRes);
  assert.equal(listRes.body.sessions[0].id, "base:1");
  assert.equal(listRes.body.sessions[0].message_count, 2);
  assert.equal(listRes.body.sessions[0].title, "validate the launch plan");

  const deleteRes = {};
  await handlers.homeSessions({ method: "DELETE", query: { thread_id: "base:1" } }, deleteRes);
  assert.deepEqual(deleteRes.body, { deleted: true, ok: true });
  const patch = deps.calls.rest.find((call) => call.options.method === "PATCH");
  assert.deepEqual(patch.options.body, {
    deleted_at: "2026-05-25T12:00:00.000Z",
    updated_at: "2026-05-25T12:00:00.000Z",
  });
});

test("message and home session handlers preserve typed validation errors", async () => {
  const handlers = createHostedConversationHandlers(baseDeps());

  await assert.rejects(
    () => handlers.messages({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "content is required",
  );
  await assert.rejects(
    () => handlers.homeSessions({ method: "DELETE", query: {} }, {}),
    (err) => err.status === 400 && err.message === "thread_id is required",
  );
});
