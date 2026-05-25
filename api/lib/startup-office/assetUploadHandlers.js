const {
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
} = require("./planLimits");

const ASSET_UPLOAD_BUCKET = "startup-office-assets";
const MAX_ASSET_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/json",
  "application/pdf",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

function createStartupOfficeAssetUploadHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    publicStartupOfficeAsset,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeBetaOpsSnapshot,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleAssetUploadIntent(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const body = await readBody(req);
    const sizeBytes = Number(body.size_bytes || body.sizeBytes || 0);
    const contentType = String(body.content_type || body.contentType || "").trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw createHTTPError(400, "unsupported asset content type");
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ASSET_UPLOAD_BYTES) {
      throw createHTTPError(400, "asset upload size must be between 1 byte and 25 MB");
    }
    const uploadPath = [
      membership.team_id,
      `${Date.now()}-${sanitizeName(body.name || "startup-office-asset")}`,
    ].join("/");
    await assertStartupOfficeStorageLimit({
      additionalBytes: Math.max(sizeBytes, startupOfficeStorageBytes(body.metadata)),
      createHTTPError,
      membership,
      startupOfficeBetaOpsSnapshot,
    });
    const [asset] = await safeStartupOfficeRest("startup_office_assets", {
      method: "POST",
      body: {
        body: "",
        checksum_sha256: truncateText(body.checksum_sha256 || body.sha256 || "", 80),
        content_type: contentType,
        created_by: membership.user_id,
        kind: truncateText(body.kind || "uploaded_material", 80),
        metadata: {
          ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
          upload_bucket: ASSET_UPLOAD_BUCKET,
        },
        name: truncateText(body.name || "Startup Office asset", 180),
        size_bytes: sizeBytes,
        status: "active",
        storage_path: uploadPath,
        team_id: membership.team_id,
        updated_at: nowISO(),
        upload_status: "pending",
      },
    });
    await writeAuditEvent(membership, "startup_office.asset_upload_intent.created", "asset", asset?.id || "");
    writeJSON(res, 200, {
      asset: publicStartupOfficeAsset(asset),
      upload: {
        bucket: ASSET_UPLOAD_BUCKET,
        content_type: contentType,
        max_bytes: MAX_ASSET_UPLOAD_BYTES,
        path: uploadPath,
      },
    });
  }

  return {
    assetUploadIntent: handleAssetUploadIntent,
  };
}

function sanitizeName(value) {
  return String(value || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "asset";
}

module.exports = {
  ALLOWED_CONTENT_TYPES,
  ASSET_UPLOAD_BUCKET,
  MAX_ASSET_UPLOAD_BYTES,
  createStartupOfficeAssetUploadHandlers,
};
