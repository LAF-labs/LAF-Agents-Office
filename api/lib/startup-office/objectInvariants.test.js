const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_OBJECT_INVARIANTS,
  startupOfficeAssetStatus,
  startupOfficeCustomerStatus,
  startupOfficeSignalStatus,
  startupOfficeSignalType,
} = require("./objectInvariants");

test("object invariants cover every first-party operating object kind", () => {
  assert.deepEqual(Object.keys(STARTUP_OFFICE_OBJECT_INVARIANTS).sort(), [
    "assets",
    "customers",
    "metrics",
    "signals",
  ]);
});

test("object invariant normalizers preserve allowed values and fallback safely", () => {
  assert.equal(startupOfficeAssetStatus("archived"), "archived");
  assert.equal(startupOfficeAssetStatus("bad"), "active");
  assert.equal(startupOfficeCustomerStatus("qualified"), "qualified");
  assert.equal(startupOfficeCustomerStatus("bad"), "lead");
  assert.equal(startupOfficeSignalStatus("triaged"), "triaged");
  assert.equal(startupOfficeSignalStatus("bad"), "new");
  assert.equal(startupOfficeSignalType("competitor"), "competitor");
  assert.equal(startupOfficeSignalType("bad"), "market");
});
