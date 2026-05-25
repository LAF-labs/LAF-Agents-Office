const assert = require("node:assert/strict");
const test = require("node:test");

const {
  redactSensitiveText,
  redactSensitiveValue,
} = require("./redaction");

test("redactSensitiveText masks bearer, LAF, GitHub, and OpenAI-style secrets", () => {
  const text = [
    "Bearer abcDEF123._~+/=-",
    "laf_live_0123456789abcdefABCD",
    "lafr_abcdefghijklmnopqrstuvwxyz",
    "lafb_abcdefghijklmnopqrstuvwxyz",
    "ghp_abcdefghijklmnopqrstuvwxyz",
    "sk-proj-abcdefghijklmnopqrstuvwxyz",
  ].join(" ");

  const redacted = redactSensitiveText(text);

  assert.doesNotMatch(redacted, /abcDEF|012345|abcdefghijklmnopqrstuvwxyz/);
  assert.match(redacted, /Bearer \[REDACTED\]/);
  assert.match(redacted, /laf_\[REDACTED\]/);
  assert.match(redacted, /gh_\[REDACTED\]/);
  assert.match(redacted, /sk-\[REDACTED\]/);
});

test("redactSensitiveValue recursively masks sensitive keys and string values", () => {
  assert.deepEqual(
    redactSensitiveValue({
      api_key: "visible-key",
      nested: {
        message: "use Bearer abcDEF1234567890",
        password: "hunter2",
      },
      safe: ["hello", "sk-abcdefghijklmnopqrstuvwxyz"],
      token: "plain-token",
    }),
    {
      api_key: "[REDACTED]",
      nested: {
        message: "use Bearer [REDACTED]",
        password: "[REDACTED]",
      },
      safe: ["hello", "sk-[REDACTED]"],
      token: "[REDACTED]",
    },
  );
});

test("redactSensitiveValue leaves non-sensitive primitive values intact", () => {
  assert.deepEqual(redactSensitiveValue({ count: 2, ok: true, value: null }), {
    count: 2,
    ok: true,
    value: null,
  });
});
