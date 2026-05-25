async function assertStartupOfficeSeatLimit({
  createHTTPError,
  membership,
  startupOfficeBetaOpsSnapshot,
}) {
  if (typeof startupOfficeBetaOpsSnapshot !== "function") return;
  const snapshot = await startupOfficeBetaOpsSnapshot(membership.team_id);
  const limit = numberValue(snapshot?.limits?.seat_limit ?? snapshot?.billing?.seat_limit);
  if (!limit) return;
  const used = numberValue(snapshot?.usage?.seats) + numberValue(snapshot?.usage?.pending_invites);
  if (used >= limit) {
    throw createHTTPError(402, "closed beta seat limit reached");
  }
}

async function assertStartupOfficeStorageLimit({
  additionalBytes = 0,
  createHTTPError,
  membership,
  startupOfficeBetaOpsSnapshot,
}) {
  if (typeof startupOfficeBetaOpsSnapshot !== "function") return;
  const snapshot = await startupOfficeBetaOpsSnapshot(membership.team_id);
  const limitMB = numberValue(snapshot?.limits?.storage_mb_limit ?? snapshot?.billing?.storage_mb_limit);
  if (!limitMB) return;
  const limitBytes = limitMB * 1024 * 1024;
  const usedBytes = numberValue(snapshot?.usage?.storage_bytes);
  if (usedBytes + numberValue(additionalBytes) > limitBytes) {
    throw createHTTPError(402, "closed beta storage limit reached");
  }
}

function startupOfficeStorageBytes(value) {
  if (value === null || value === undefined) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.byteLength(text || "", "utf8");
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

module.exports = {
  assertStartupOfficeSeatLimit,
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
};
