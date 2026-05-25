function createHostedSessionCookies(options = {}) {
  const env = options.env || process.env;
  const trustedBrowserOrigin = options.trustedBrowserOrigin || (() => "");

  function cookie(req, name) {
    const header = req.headers.cookie || "";
    const parts = header.split(";").map((part) => part.trim());
    for (const part of parts) {
      const index = part.indexOf("=");
      if (index < 0) continue;
      if (part.slice(0, index) === name) {
        return decodeURIComponent(part.slice(index + 1));
      }
    }
    return "";
  }

  function bearer(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
  }

  function authToken(req) {
    return bearer(req) || cookie(req, "laf_access");
  }

  function authCookieSameSite(req) {
    return env.NODE_ENV === "production" && trustedBrowserOrigin(req) ? "None" : "Lax";
  }

  function setAuthCookies(req, res, session) {
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    const sameSite = authCookieSameSite(req);
    const accessMaxAge = Number(session.expires_in || 3600);
    const cookies = [
      `laf_access=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${accessMaxAge}${secure}`,
    ];
    if (session.refresh_token) {
      cookies.push(
        `laf_refresh=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=2592000${secure}`,
      );
    }
    res.setHeader("Set-Cookie", cookies);
  }

  function clearAuthCookies(req, res) {
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    const sameSite = authCookieSameSite(req);
    res.setHeader("Set-Cookie", [
      `laf_access=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`,
      `laf_refresh=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`,
    ]);
  }

  return {
    authCookieSameSite,
    authToken,
    bearer,
    clearAuthCookies,
    cookie,
    setAuthCookies,
  };
}

module.exports = {
  createHostedSessionCookies,
};
