function createHostedSupabaseAccess(options = {}) {
  const env = options.env || process.env;
  const serviceRoleAccessGuards = options.serviceRoleAccessGuards || {
    assertAllowedRestTable: (table) => table,
    assertAllowedRPC: (name) => name,
  };
  const createHTTPError = options.createHTTPError || defaultHTTPError;

  function assertSupabaseEnv() {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw createHTTPError(503, "supabase environment is not configured");
    }
  }

  function supabaseURL(path) {
    return `${env.SUPABASE_URL.replace(/\/+$/, "")}${path}`;
  }

  function serviceHeaders(extra = {}) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function anonHeaders(extra = {}) {
    const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function rest(table, requestOptions = {}) {
    const tableName = serviceRoleAccessGuards.assertAllowedRestTable(table);
    const method = requestOptions.method || "GET";
    const url = new URL(supabaseURL(`/rest/v1/${tableName}`));
    for (const [key, value] of Object.entries(requestOptions.query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = serviceHeaders();
    if (method !== "GET") {
      headers.Prefer = requestOptions.prefer || "return=representation";
    }
    return fetchJSON(url, {
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      headers,
      method,
    });
  }

  async function rpc(name, body = {}) {
    const rpcName = serviceRoleAccessGuards.assertAllowedRPC(name);
    return fetchJSON(supabaseURL(`/rest/v1/rpc/${rpcName}`), {
      body: JSON.stringify(body),
      headers: serviceHeaders(),
      method: "POST",
    });
  }

  async function authFetch(path, requestOptions = {}) {
    return fetchJSON(supabaseURL(`/auth/v1/${path}`), {
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      headers: anonHeaders(requestOptions.headers),
      method: requestOptions.method || "GET",
    });
  }

  async function authAdminFetch(path, requestOptions = {}) {
    return fetchJSON(supabaseURL(`/auth/v1/${path}`), {
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      headers: serviceHeaders(requestOptions.headers),
      method: requestOptions.method || "GET",
    });
  }

  async function fetchJSON(url, requestOptions) {
    const response = await fetchForRequest(url, requestOptions);
    const text = await response.text();
    if (!response.ok) {
      throw createHTTPError(
        response.status,
        responseErrorMessage(text, response.statusText),
        { safe: false },
      );
    }
    return text ? JSON.parse(text) : null;
  }

  function fetchForRequest(url, requestOptions) {
    const fetchImpl = options.fetch || global.fetch;
    return fetchImpl(url, requestOptions);
  }

  return {
    anonHeaders,
    assertSupabaseEnv,
    authAdminFetch,
    authFetch,
    responseErrorMessage,
    rest,
    rpc,
    serviceHeaders,
    supabaseURL,
  };
}

function responseErrorMessage(text, fallback) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      for (const key of ["msg", "message", "error_description", "error"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  } catch {
    // Plain-text upstream errors are already useful for server-side logs.
  }
  return trimmed || fallback;
}

function defaultHTTPError(status, message, opts = {}) {
  const error = new Error(message);
  error.status = status;
  error.safe = opts.safe !== false;
  return error;
}

module.exports = {
  createHostedSupabaseAccess,
  responseErrorMessage,
};
