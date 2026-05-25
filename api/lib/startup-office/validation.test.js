const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeValidation,
} = require("./validation");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const validation = createStartupOfficeValidation({
  createHTTPError,
  objectValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  },
  truncateText(value, max) {
    return String(value || "").slice(0, max);
  },
});

test("loop create validator normalizes shared loop payload fields", () => {
  assert.deepEqual(validation.loopCreateBody({
    department: "Growth",
    name: "Founder Review",
    objective: "Review growth",
    policy: { approval_required: true },
    slug: "review",
    status: "active",
  }), {
    cadence: undefined,
    department: "Growth",
    name: "Founder Review",
    objective: "Review growth",
    policy: { approval_required: true },
    slugSeed: "review",
    status: "active",
  });
});

test("loop validators reject malformed mutation payloads with typed errors", () => {
  assert.throws(
    () => validation.loopCreateBody({ name: "" }),
    (err) => err.status === 400 && err.message === "name is required",
  );
  assert.throws(
    () => validation.loopCreateBody({ name: "Loop", policy: "yes" }),
    (err) => err.status === 400 && err.message === "policy must be an object",
  );
  assert.throws(
    () => validation.loopRunBody({ defer: "true" }),
    (err) => err.status === 400 && err.message === "defer must be a boolean",
  );
  assert.throws(
    () => validation.loopRunBody({ inputs: ["not", "object"] }),
    (err) => err.status === 400 && err.message === "inputs must be an object",
  );
});
