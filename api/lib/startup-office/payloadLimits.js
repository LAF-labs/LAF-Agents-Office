const STARTUP_OFFICE_PAYLOAD_LIMITS = Object.freeze({
  artifactContentBytes: 96 * 1024,
  assetBodyBytes: 64 * 1024,
  modelOutputBytes: 96 * 1024,
});

function assertStartupOfficePayloadSize({
  createHTTPError,
  label,
  maxBytes,
  value,
}) {
  const size = payloadByteSize(value);
  if (size > maxBytes) {
    throw createHTTPError(413, `${label} exceeds ${maxBytes} bytes`);
  }
}

function payloadByteSize(value) {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

module.exports = {
  STARTUP_OFFICE_PAYLOAD_LIMITS,
  assertStartupOfficePayloadSize,
  payloadByteSize,
};
