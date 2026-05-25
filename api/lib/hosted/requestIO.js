function createHostedRequestIO(options = {}) {
  const createHTTPError = options.createHTTPError || defaultHTTPError;
  const maxRequestBodyBytes = Number(options.maxRequestBodyBytes || 512 * 1024);

  function requestPath(req) {
    const raw = req.query?.path;
    if (Array.isArray(raw)) return raw.join("/");
    return String(raw || "").replace(/^\/+|\/+$/g, "");
  }

  async function readBody(req) {
    const contentLength = Number(req.headers?.["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
      throw createHTTPError(413, `request body exceeds ${maxRequestBodyBytes} bytes`);
    }
    if (req.body && typeof req.body === "object") {
      assertJSONByteSize(req.body, maxRequestBodyBytes, "request body");
      return req.body;
    }
    if (typeof req.body === "string" && req.body.trim()) {
      if (Buffer.byteLength(req.body, "utf8") > maxRequestBodyBytes) {
        throw createHTTPError(413, `request body exceeds ${maxRequestBodyBytes} bytes`);
      }
      return parseJSONBody(req.body);
    }

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxRequestBodyBytes) {
        throw createHTTPError(413, `request body exceeds ${maxRequestBodyBytes} bytes`);
      }
      chunks.push(buffer);
    }

    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) return {};
    return parseJSONBody(text);
  }

  function writeJSON(res, status, payload) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  }

  function jsonByteSize(value) {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  }

  function assertJSONByteSize(value, maxBytes, label) {
    if (jsonByteSize(value) > maxBytes) {
      throw createHTTPError(413, `${label} exceeds ${maxBytes} bytes`);
    }
  }

  function parseJSONBody(text) {
    try {
      return JSON.parse(text);
    } catch {
      throw createHTTPError(400, "invalid json body");
    }
  }

  return {
    assertJSONByteSize,
    jsonByteSize,
    readBody,
    requestPath,
    writeJSON,
  };
}

function defaultHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createHostedRequestIO,
};
