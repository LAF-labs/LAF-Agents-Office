class HTTPError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    // safe=false means the message may include upstream/internal detail and
    // must not be forwarded to clients.
    this.safe = opts.safe !== false;
  }
}

function startupOfficeHTTPError(status, message, opts = {}) {
  return new HTTPError(status, message, opts);
}

function requestIDFor(req) {
  return String(req?.headers?.["x-request-id"] || req?.headers?.["x-vercel-id"] || "").trim();
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  HTTPError,
  objectValue,
  requestIDFor,
  startupOfficeHTTPError,
};
