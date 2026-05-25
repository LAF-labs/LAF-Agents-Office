function createStartupOfficeValidation({ createHTTPError, objectValue, truncateText }) {
  const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
  function headerValue(req, name) {
    const headers = req?.headers || {};
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
  }
  function normalizeIdempotencyKey(value) {
    const key = String(value || "").trim();
    if (!key) return "";
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw createHTTPError(400, "idempotency key must be 1-120 URL-safe characters");
    }
    return key;
  }
  function requireObject(value, label) {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw createHTTPError(400, `${label} must be an object`);
    }
    return value;
  }
  function idempotencyKey(req, body = {}) {
    const value = requireObject(body, "request body");
    const headerKey = normalizeIdempotencyKey(headerValue(req, "idempotency-key"));
    const bodyKey = normalizeIdempotencyKey(value.idempotency_key || value.idempotencyKey);
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      throw createHTTPError(400, "idempotency key mismatch");
    }
    return headerKey || bodyKey;
  }
  function optionalObject(value, label) {
    if (value === undefined) return {};
    return requireObject(value, label);
  }
  function loopCreateBody(body = {}) {
    const value = requireObject(body, "request body");
    const name = truncateText(value.name || "", 160);
    if (!name) throw createHTTPError(400, "name is required");
    return {
      cadence: value.cadence,
      department: truncateText(value.department || "Operations", 80),
      name,
      objective: truncateText(value.objective || "", 2000),
      policy: optionalObject(value.policy, "policy"),
      slugSeed: value.slug || name,
      status: value.status,
    };
  }

  function approvalActionBody(body = {}) {
    const value = requireObject(body, "request body");
    const decisionNote = truncateText(value.note || value.reason || value.revision_note || "", 2000);
    return {
      decisionNote,
      traceNote: truncateText(decisionNote, 500),
    };
  }
  function loopRunBody(body = {}) {
    const value = requireObject(body, "request body");
    if (value.defer !== undefined && typeof value.defer !== "boolean") {
      throw createHTTPError(400, "defer must be a boolean");
    }
    const inputsProvided = value.inputs !== undefined;
    return {
      defer: value.defer === true,
      inputs: inputsProvided ? optionalObject(value.inputs, "inputs") : objectValue(value.inputs),
      inputsProvided,
      objective: truncateText(value.objective || "", 2000),
      title: truncateText(value.title || "", 180),
    };
  }
  return { approvalActionBody, idempotencyKey, loopCreateBody, loopRunBody };
}
module.exports = { createStartupOfficeValidation };
