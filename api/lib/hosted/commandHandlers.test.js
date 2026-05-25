const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedCommandHandlers,
  hostedSlashCommandName,
} = require("./commandHandlers");

function baseDeps(overrides = {}) {
  const calls = {
    requireUser: 0,
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    async readBody() {
      return {};
    },
    async requireUser() {
      calls.requireUser += 1;
      return { membership: { team_id: "team-1", user_id: "user-1" } };
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("hosted slash command parser extracts a normalized command token", () => {
  assert.equal(hostedSlashCommandName("/Ask revenue"), "ask");
  assert.equal(hostedSlashCommandName(" /growth "), "growth");
  assert.equal(hostedSlashCommandName("ask"), "");
  assert.equal(hostedSlashCommandName(""), "");
});

test("commands handler returns the hosted web command registry without auth", () => {
  const deps = baseDeps();
  const handlers = createHostedCommandHandlers(deps);

  handlers.commands({ method: "GET" }, {});

  assert.equal(deps.calls.requireUser, 0);
  assert.equal(deps.calls.writes[0].status, 200);
  assert.ok(deps.calls.writes[0].body.some((command) => command.name === "growth"));
  assert.ok(deps.calls.writes[0].body.every((command) => command.webSupported === true));
});

test("command run rejects commands handled directly in the web workspace", async () => {
  const deps = baseDeps({
    async readBody() {
      return { input: "/growth" };
    },
  });
  const handlers = createHostedCommandHandlers(deps);

  await assert.rejects(
    () => handlers.commandRun({ method: "POST" }, {}),
    (err) =>
      err.status === 400 &&
      err.message === "slash command is handled directly in the web workspace",
  );
  assert.equal(deps.calls.requireUser, 1);
});

test("command run rejects missing or unsupported hosted slash commands", async () => {
  const missing = createHostedCommandHandlers(baseDeps());
  await assert.rejects(
    () => missing.commandRun({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "slash command input is required",
  );

  const unsupported = createHostedCommandHandlers(baseDeps({
    async readBody() {
      return { input: "/deploy" };
    },
  }));
  await assert.rejects(
    () => unsupported.commandRun({ method: "POST" }, {}),
    (err) =>
      err.status === 400 &&
      err.message === "slash command is not available in the hosted workspace",
  );
});
