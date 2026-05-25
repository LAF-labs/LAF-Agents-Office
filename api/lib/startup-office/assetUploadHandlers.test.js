const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeAssetUploadHandlers,
} = require("./assetUploadHandlers");

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
    },
    publicStartupOfficeAsset(row) {
      return row;
    },
    randomUUID() {
      return "upload-uuid-1";
    },
    async readBody() {
      return {
        content_type: "text/markdown",
        checksum_sha256: "a".repeat(64),
        name: "Founder Memo.md",
        size_bytes: 2048,
      };
    },
    requirePermission(_membership, permission) {
      calls.permissions.push(permission);
    },
    async requireUser() {
      return {
        membership: { team_id: "team-1", user_id: "user-1" },
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [{ id: "asset-1", ...options.body }];
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: { storage_mb_limit: 1 },
        limits: { storage_mb_limit: 1 },
        usage: { storage_bytes: 0 },
      };
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("asset upload intent validates content type, size, storage limit, and returns scoped path", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeAssetUploadHandlers(deps);

  await handlers.assetUploadIntent({ method: "POST" }, {});

  assert.equal(deps.calls.permissions[0], "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_assets");
  assert.equal(deps.calls.rest[0].options.body.content_type, "text/markdown");
  assert.equal(deps.calls.rest[0].options.body.checksum_sha256, "a".repeat(64));
  assert.equal(deps.calls.rest[0].options.body.size_bytes, 2048);
  assert.equal(
    deps.calls.rest[0].options.body.storage_path,
    "team-1/upload-uuid-1-founder-memo.md",
  );
  assert.equal(deps.calls.writes[0].body.upload.bucket, "startup-office-assets");
  assert.equal(deps.calls.audits[0][1], "startup_office.asset_upload_intent.created");
});

test("asset upload intent rejects unsupported content type and oversized uploads", async () => {
  const badType = createStartupOfficeAssetUploadHandlers(baseDeps({
    async readBody() {
      return { content_type: "application/x-msdownload", name: "bad.exe", size_bytes: 1 };
    },
  }));
  await assert.rejects(
    () => badType.assetUploadIntent({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "unsupported asset content type",
  );

  const oversized = createStartupOfficeAssetUploadHandlers(baseDeps({
    async readBody() {
      return { content_type: "application/pdf", name: "deck.pdf", size_bytes: 26 * 1024 * 1024 };
    },
  }));
  await assert.rejects(
    () => oversized.assetUploadIntent({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "asset upload size must be between 1 byte and 25 MB",
  );

  const badChecksum = createStartupOfficeAssetUploadHandlers(baseDeps({
    async readBody() {
      return { checksum_sha256: "not-sha", content_type: "text/plain", name: "memo.txt", size_bytes: 1 };
    },
  }));
  await assert.rejects(
    () => badChecksum.assetUploadIntent({ method: "POST" }, {}),
    (err) =>
      err.status === 400 &&
      err.message === "asset checksum must be a lowercase SHA-256 hex digest",
  );
});
