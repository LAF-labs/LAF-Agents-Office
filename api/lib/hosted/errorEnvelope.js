function hostedAPIErrorPayload({ message, requestID = "", status }) {
  const normalizedStatus = Number.isFinite(Number(status)) ? Number(status) : 500;
  const normalizedMessage = String(message || defaultHostedAPIErrorMessage(normalizedStatus));
  const error = {
    code: hostedAPIErrorCode(normalizedStatus, normalizedMessage),
    message: normalizedMessage,
    retryable: normalizedStatus === 429 || normalizedStatus >= 500,
    status: normalizedStatus,
  };
  if (requestID) error.request_id = String(requestID);
  return { error };
}

function defaultHostedAPIErrorMessage(status) {
  if (status === 400) return "invalid request";
  if (status === 401) return "authentication required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not found";
  if (status === 409) return "conflict";
  if (status === 410) return "gone";
  if (status === 413) return "payload too large";
  if (status === 429) return "rate limited";
  if (status >= 500) return "upstream error";
  return "request failed";
}

function hostedAPIErrorCode(status, message) {
  const normalized = String(message || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || defaultCodeForStatus(status);
}

function defaultCodeForStatus(status) {
  if (status === 400) return "invalid_request";
  if (status === 401) return "authentication_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 410) return "gone";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "request_failed";
}

module.exports = {
  defaultHostedAPIErrorMessage,
  hostedAPIErrorCode,
  hostedAPIErrorPayload,
};
