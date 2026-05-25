const STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS = Object.freeze({
  assets: Object.freeze({
    create: Object.freeze(["body", "kind", "metadata", "name", "run_id", "status"]),
    patch: Object.freeze(["archive", "body", "kind", "metadata", "name", "run_id", "status"]),
  }),
  customers: Object.freeze({
    create: Object.freeze(["discovery_loop_id", "loop_id", "name", "notes", "profile", "status"]),
    patch: Object.freeze(["archive", "discovery_loop_id", "loop_id", "name", "notes", "profile", "status"]),
  }),
  metrics: Object.freeze({
    create: Object.freeze(["key", "metadata", "metric_key", "metric_value", "period_end", "period_start", "unit", "value"]),
    patch: Object.freeze(["key", "metadata", "metric_key", "metric_value", "period_end", "period_start", "unit", "value"]),
  }),
  signals: Object.freeze({
    create: Object.freeze(["body", "discovery_loop_id", "loop_id", "metadata", "run_id", "signal_type", "source", "status", "title", "type"]),
    patch: Object.freeze(["archive", "body", "discovery_loop_id", "loop_id", "metadata", "run_id", "signal_type", "source", "status", "title", "type"]),
  }),
});

const STARTUP_OFFICE_ARTIFACT_ACTION_PAYLOAD_SCHEMAS = Object.freeze({
  "record-signal": Object.freeze(["body", "loop_id", "run_id", "signal_type", "source", "title", "type"]),
  "save-as-asset": Object.freeze(["kind", "name"]),
});

function assertStartupOfficeObjectPayloadSchema(kind, mode, body, { createHTTPError }) {
  assertPlainPayload(body, createHTTPError);
  const allowed = STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS[kind]?.[mode];
  if (!allowed) throw createHTTPError(400, "unsupported startup office object payload");
  assertAllowedPayloadFields(body, allowed, createHTTPError);
}

function assertStartupOfficeArtifactActionPayload(action, body, { createHTTPError }) {
  assertPlainPayload(body, createHTTPError);
  const allowed = STARTUP_OFFICE_ARTIFACT_ACTION_PAYLOAD_SCHEMAS[action];
  if (!allowed) throw createHTTPError(400, "unsupported artifact action");
  assertAllowedPayloadFields(body, allowed, createHTTPError);
}

function assertPlainPayload(body, createHTTPError) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHTTPError(400, "payload must be an object");
  }
}

function assertAllowedPayloadFields(body, allowed, createHTTPError) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw createHTTPError(400, `unsupported payload fields: ${unknown.sort().join(", ")}`);
  }
}

module.exports = {
  STARTUP_OFFICE_ARTIFACT_ACTION_PAYLOAD_SCHEMAS,
  STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS,
  assertStartupOfficeArtifactActionPayload,
  assertStartupOfficeObjectPayloadSchema,
};
