const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertStartupOfficeSeatLimit,
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
} = require("./planLimits");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("seat limit counts active seats and pending invites before accepting more invites", async () => {
  await assert.rejects(
    () =>
      assertStartupOfficeSeatLimit({
        createHTTPError,
        membership,
        async startupOfficeBetaOpsSnapshot() {
          return {
            limits: { seat_limit: 3 },
            usage: { pending_invites: 1, seats: 2 },
          };
        },
      }),
    (err) => err.status === 402 && err.message === "closed beta seat limit reached",
  );
});

test("storage limit blocks writes that would exceed workspace storage", async () => {
  await assert.rejects(
    () =>
      assertStartupOfficeStorageLimit({
        additionalBytes: startupOfficeStorageBytes({ body: "abcd" }),
        createHTTPError,
        membership,
        async startupOfficeBetaOpsSnapshot() {
          return {
            limits: { storage_mb_limit: 0.00001 },
            usage: { storage_bytes: 8 },
          };
        },
      }),
    (err) => err.status === 402 && err.message === "closed beta storage limit reached",
  );
});

test("storage byte estimator is utf8-aware and deterministic", () => {
  assert.equal(startupOfficeStorageBytes("hello"), 5);
  assert.equal(startupOfficeStorageBytes({ body: "안녕" }), 17);
});
