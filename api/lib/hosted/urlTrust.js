function createHostedURLTrust(deps) {
  const { createHTTPError, env = process.env } = deps;

  function normalizeAllowedOrigins(value) {
    return [
      ...new Set(
        String(value || "")
          .split(",")
          .map(normalizeAllowedOrigin)
          .filter(Boolean),
      ),
    ];
  }

  function normalizeAllowedOrigin(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      return "";
    }
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return "";
    }
    const allowLocalhost = allowLocalHostedURLs();
    if (!allowLocalhost && parsed.protocol !== "https:") return "";
    if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) return "";
    const protocol = allowLocalhost ? parsed.protocol : "https:";
    return `${protocol}//${parsed.host}`;
  }

  function trustedPublicAPIURL(req) {
    const publicAPIBase = String(env.LAF_OFFICE_PUBLIC_API_BASE_URL || "").trim();
    if (publicAPIBase) {
      return normalizeConfiguredPublicAPIBase(
        publicAPIBase,
        req,
        "LAF_OFFICE_PUBLIC_API_BASE_URL",
      );
    }
    const browserAPIBase = String(env.VITE_LAF_API_BASE_URL || "").trim();
    if (browserAPIBase) {
      return normalizeConfiguredPublicAPIBase(
        browserAPIBase,
        req,
        "VITE_LAF_API_BASE_URL",
      );
    }
    const origin = trustedPublicOrigin(req);
    if (!origin) throw createHTTPError(503, "canonical hosted API URL is not configured");
    return `${origin}/api`;
  }

  function trustedPublicOrigin(req) {
    const configured = String(env.LAF_OFFICE_PUBLIC_HOST || env.VERCEL_URL || "").trim();
    if (configured) return normalizeConfiguredPublicOrigin(configured);
    if (env.NODE_ENV === "production") {
      throw createHTTPError(503, "LAF_OFFICE_PUBLIC_HOST is not configured for production");
    }
    const proto = String(req.headers["x-forwarded-proto"] || "http")
      .split(",")[0]
      .trim();
    const host = String(req.headers.host || "").trim();
    if (!host) throw createHTTPError(400, "cannot resolve public origin");
    return `${proto}://${host}`;
  }

  function normalizeConfiguredPublicOrigin(value) {
    const raw = String(value || "").trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const allowLocalhost = allowLocalHostedURLs();
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw createHTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be a valid origin");
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      throw createHTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be a valid origin");
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw createHTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be an origin without a path");
    }
    if (!allowLocalhost && parsed.protocol !== "https:") {
      throw createHTTPError(503, "LAF_OFFICE_PUBLIC_HOST must use https");
    }
    if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) {
      throw createHTTPError(
        503,
        "LAF_OFFICE_PUBLIC_HOST must not point at localhost or a private network address",
      );
    }
    const protocol = allowLocalhost ? parsed.protocol : "https:";
    return `${protocol}//${parsed.host}`;
  }

  function normalizeConfiguredPublicAPIBase(
    value,
    req,
    label = "LAF_OFFICE_PUBLIC_API_BASE_URL",
  ) {
    const raw = String(value || "").trim();
    if (raw.startsWith("//")) {
      throw createHTTPError(503, `${label} must not be a protocol-relative URL`);
    }
    if (
      raw.startsWith("/") ||
      (label === "VITE_LAF_API_BASE_URL" && !looksLikeBareHostedAPIHost(raw))
    ) {
      if (/[?#]/.test(raw)) {
        throw createHTTPError(503, `${label} must not include a query string or hash`);
      }
      const origin = trustedPublicOrigin(req);
      const pathname = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") || "/api";
      return `${origin}${pathname}`;
    }
    if (!/^https?:\/\//i.test(raw) && !looksLikeBareHostedAPIHost(raw)) {
      throw createHTTPError(503, `${label} must be a valid URL`);
    }
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw createHTTPError(503, `${label} must be a valid URL`);
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      throw createHTTPError(503, `${label} must be a valid URL`);
    }
    if (parsed.search || parsed.hash) {
      throw createHTTPError(503, `${label} must not include a query string or hash`);
    }
    const allowLocalhost = allowLocalHostedURLs();
    if (!allowLocalhost && parsed.protocol !== "https:") {
      throw createHTTPError(503, `${label} must use https`);
    }
    if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) {
      throw createHTTPError(
        503,
        `${label} must not point at localhost or a private network address`,
      );
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = pathname && pathname !== "/" ? pathname : "/api";
    const protocol = allowLocalhost ? parsed.protocol : "https:";
    return `${protocol}//${parsed.host}${parsed.pathname}`;
  }

  function allowLocalHostedURLs() {
    return env.NODE_ENV !== "production";
  }

  return {
    allowLocalHostedURLs,
    isPrivateHostedHostname,
    looksLikeBareHostedAPIHost,
    normalizeAllowedOrigin,
    normalizeAllowedOrigins,
    normalizeConfiguredPublicAPIBase,
    normalizeConfiguredPublicOrigin,
    trustedPublicAPIURL,
    trustedPublicOrigin,
  };
}

function looksLikeBareHostedAPIHost(value) {
  const hostPart = String(value || "").split(/[/?#]/)[0];
  return hostPart.includes(".") || hostPart.includes(":") || hostPart.startsWith("[");
}

function isPrivateHostedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  const carrierGradeNAT = host.match(/^100\.(\d+)\./);
  if (carrierGradeNAT && Number(carrierGradeNAT[1]) >= 64 && Number(carrierGradeNAT[1]) <= 127) return true;
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

module.exports = {
  createHostedURLTrust,
  isPrivateHostedHostname,
  looksLikeBareHostedAPIHost,
};
