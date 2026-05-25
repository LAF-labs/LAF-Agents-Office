const assert = require("node:assert/strict");
const test = require("node:test");

const {
  defaultHostedAPIErrorMessage,
  hostedAPIErrorCode,
  hostedAPIErrorPayload,
} = require("./errorEnvelope");

test("hosted API error payload uses a typed client envelope", () => {
  assert.deepEqual(
    hostedAPIErrorPayload({
      message: "rate limit exceeded",
      requestID: "req-1",
      status: 429,
    }),
    {
      error: {
        code: "rate_limit_exceeded",
        message: "rate limit exceeded",
        request_id: "req-1",
        retryable: true,
        status: 429,
      },
    },
  );
});

test("hosted API error payload marks client validation errors as non-retryable", () => {
  assert.deepEqual(
    hostedAPIErrorPayload({ message: "invalid json body", status: 400 }),
    {
      error: {
        code: "invalid_json_body",
        message: "invalid json body",
        retryable: false,
        status: 400,
      },
    },
  );
});

test("hosted API error codes and messages fall back by status", () => {
  assert.equal(defaultHostedAPIErrorMessage(503), "upstream error");
  assert.equal(hostedAPIErrorCode(500, ""), "upstream_error");
});
