const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertStartupOfficePayloadSize,
  payloadByteSize,
} = require("./payloadLimits");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("startup office payload size counts utf8 bytes for strings and json", () => {
  assert.equal(payloadByteSize("abc"), 3);
  assert.equal(payloadByteSize("가"), 3);
  assert.equal(payloadByteSize({ body: "abc" }), 14);
});

test("startup office payload size rejects oversized payloads before writes", () => {
  assert.throws(
    () =>
      assertStartupOfficePayloadSize({
        createHTTPError,
        label: "asset body",
        maxBytes: 3,
        value: "abcd",
      }),
    (err) => err.status === 413 && err.message === "asset body exceeds 3 bytes",
  );
});
