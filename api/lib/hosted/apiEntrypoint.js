function createHostedAPIEntrypoint(deps) {
  const {
    HTTPError,
    apiRouteDispatcher,
    assertSupabaseEnv,
    defaultHostedAPIErrorMessage,
    enforceHostedActionRateLimit,
    hostedAPIErrorPayload,
    logger = console,
    requestIDFor,
    requestPath,
    securityHeaders,
    writeJSON,
  } = deps;

  return async function hostedAPIEntrypoint(req, res) {
    securityHeaders.applyBaselineSecurityHeaders(res);
    securityHeaders.applyCORSHeaders(req, res);
    try {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      assertSupabaseEnv();

      const path = requestPath(req);
      await enforceHostedActionRateLimit(req, path);
      if (await apiRouteDispatcher.dispatch(req, res, path)) {
        return;
      }
      writeJSON(res, 404, hostedAPIErrorPayload({
        message: "hosted API route not found",
        requestID: requestIDFor(req),
        status: 404,
      }));
    } catch (err) {
      const status = err instanceof HTTPError ? err.status : 500;
      let message;
      if (err instanceof HTTPError) {
        // Only forward HTTPError.message when explicitly marked safe. Upstream
        // (Supabase/auth) detail is wrapped with safe=false so we expose a
        // generic message and log the real one server-side.
        message = err.safe === false ? defaultHostedAPIErrorMessage(status) : err.message;
      } else {
        message = "hosted API internal error";
      }
      if (status >= 500 || (err instanceof HTTPError && err.safe === false)) {
        try {
          logger.error("[laf-office:api]", req.method, requestPath(req), err);
        } catch {
          // best-effort logging
        }
      }
      writeJSON(res, status, hostedAPIErrorPayload({
        message,
        requestID: requestIDFor(req),
        status,
      }));
    }
  };
}

module.exports = {
  createHostedAPIEntrypoint,
};
