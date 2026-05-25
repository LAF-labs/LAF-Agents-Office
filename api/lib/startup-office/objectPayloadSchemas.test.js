const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS,
  assertStartupOfficeArtifactActionPayload,
  assertStartupOfficeObjectPayloadSchema,
} = require("./objectPayloadSchemas");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("object payload schemas cover all first-party operating objects", () => {
  assert.deepEqual(Object.keys(STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS).sort(), [
    "assets",
    "customers",
    "metrics",
    "signals",
  ]);
});

test("object payload schemas accept documented aliases", () => {
  assert.doesNotThrow(() =>
    assertStartupOfficeObjectPayloadSchema(
      "metrics",
      "create",
      { key: "mrr", value: 1000 },
      { createHTTPError },
    ),
  );
  assert.doesNotThrow(() =>
    assertStartupOfficeObjectPayloadSchema(
      "signals",
      "patch",
      { archive: true, type: "customer" },
      { createHTTPError },
    ),
  );
});

test("object payload schemas reject unknown fields", () => {
  assert.throws(
    () =>
      assertStartupOfficeObjectPayloadSchema(
        "customers",
        "create",
        { email: "buyer@example.com", name: "Buyer" },
        { createHTTPError },
      ),
    (err) => err.status === 400 && err.message === "unsupported payload fields: email",
  );
});

test("artifact action payload schemas reject unsupported fields", () => {
  assert.doesNotThrow(() =>
    assertStartupOfficeArtifactActionPayload(
      "save-as-asset",
      { kind: "research", name: "Research" },
      { createHTTPError },
    ),
  );
  assert.throws(
    () =>
      assertStartupOfficeArtifactActionPayload(
        "record-signal",
        { send_now: true, title: "Signal" },
        { createHTTPError },
      ),
    (err) => err.status === 400 && err.message === "unsupported payload fields: send_now",
  );
});
