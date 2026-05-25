const crypto = require("node:crypto");

function createHostedClientTelemetryHandlers(deps) {
  const {
    createHTTPError,
    readBody,
    requireUser,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleClientError(req, res) {
    if (req.method !== "POST") {
      throw createHTTPError(405, "method not allowed");
    }
    const { membership } = await requireUser(req);
    const body = await readBody(req);
    const metadata = clientErrorMetadata(body, req.headers || {});
    const event = await writeAuditEvent(
      membership,
      "client.error_reported",
      "client_error",
      metadata.fingerprint,
      metadata,
      { required: true },
    );
    writeJSON(res, 202, {
      event_id: event?.id || "",
      fingerprint: metadata.fingerprint,
      status: "recorded",
    });
  }

  return {
    clientError: handleClientError,
  };
}

function clientErrorMetadata(body = {}, headers = {}) {
  const message = cleanClientText(body.message || body.reason || "client error", 300);
  const name = cleanClientText(body.name || body.error_name || "Error", 80);
  const source = safeEnum(body.source, [
    "window.error",
    "unhandledrejection",
    "react_mount",
    "manual",
  ], "manual");
  const route = safeRoute(body.route);
  const filename = safeFilename(body.filename);
  const line = safePositiveInt(body.line);
  const column = safePositiveInt(body.column);
  const release = cleanClientText(body.release || "", 80);
  const viewport = safeViewport(body.viewport);
  const fingerprint = safeFingerprint(
    body.fingerprint,
    [source, name, message, route, filename, line, column].join("|"),
  );

  return {
    browser: browserFamily(headers["user-agent"]),
    column,
    filename,
    fingerprint,
    line,
    message,
    name,
    release,
    route,
    source,
    viewport,
  };
}

function cleanClientText(value, maxLength) {
  return truncateText(redactClientText(String(value || "").replace(/\s+/g, " ").trim()), maxLength);
}

function redactClientText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\b(token|secret|password|key)=([^&\s]+)/gi, "$1=[redacted]");
}

function safeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function safeRoute(value) {
  const raw = String(value || "/").trim();
  const [withoutQuery = "/"] = raw.split("?");
  const [pathPart = "/", hashPart = ""] = withoutQuery.split("#");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const safePath = path
    .split("/")
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => {
      const clean = part.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (!clean || clean.length > 24 || /^[a-f0-9-]{12,}$/.test(clean) || /^\d{6,}$/.test(clean)) {
        return "_";
      }
      return clean;
    })
    .join("/");
  const hash = String(hashPart || "").replace(/^\/+/, "").split("/")[0];
  const safeHash = /^[a-z0-9_-]{1,40}$/i.test(hash) ? `#${hash.toLowerCase()}` : "";
  return `/${safePath || ""}${safeHash}`;
}

function safeFilename(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://laf.local");
    return truncateText(parsed.pathname.split("/").filter(Boolean).pop() || "", 120);
  } catch {
    return truncateText(raw.split(/[\\/]/).pop() || "", 120);
  }
}

function safePositiveInt(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1_000_000, Math.floor(number));
}

function safeViewport(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    height: clampInt(input.height, 0, 10000),
    width: clampInt(input.width, 0, 10000),
  };
}

function clampInt(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function safeFingerprint(value, fallbackInput) {
  const raw = String(value || "").trim().toLowerCase();
  if (/^[a-f0-9]{16,64}$/.test(raw)) return raw.slice(0, 64);
  return crypto.createHash("sha256").update(String(fallbackInput || "")).digest("hex");
}

function browserFamily(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("chrome/") || ua.includes("chromium/")) return "chromium";
  if (ua.includes("firefox/")) return "firefox";
  if (ua.includes("safari/")) return "safari";
  return "unknown";
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

module.exports = {
  browserFamily,
  cleanClientText,
  clientErrorMetadata,
  createHostedClientTelemetryHandlers,
  safeRoute,
};
