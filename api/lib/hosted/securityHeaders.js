function createHostedSecurityHeaders(options = {}) {
  const allowedOrigins = new Set(options.allowedOrigins || []);

  function applyBaselineSecurityHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  }

  function applyCORSHeaders(req, res) {
    const origin = trustedBrowserOrigin(req);
    if (!origin) return;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Requested-With",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }

  function trustedBrowserOrigin(req) {
    const origin = String(req.headers.origin || "").trim();
    return origin && allowedOrigins.has(origin) ? origin : "";
  }

  return {
    applyBaselineSecurityHeaders,
    applyCORSHeaders,
    trustedBrowserOrigin,
  };
}

module.exports = {
  createHostedSecurityHeaders,
};
