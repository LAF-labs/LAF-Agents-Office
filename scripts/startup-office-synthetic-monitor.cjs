#!/usr/bin/env node
"use strict";

function configFromEnv(env = process.env) {
  const apiBaseURL = normalizeAPIBaseURL(
    env.LAF_SYNTHETIC_API_BASE_URL ||
      env.LAF_OFFICE_PUBLIC_HOST ||
      env.VERCEL_URL ||
      "",
  );
  return {
    apiBaseURL,
    approvalAction: enumEnv(env.LAF_SYNTHETIC_APPROVAL_ACTION || "approve", [
      "approve",
      "read",
    ]),
    email: requiredEnv(env, "LAF_SYNTHETIC_EMAIL"),
    loopID: String(env.LAF_SYNTHETIC_LOOP_ID || "idea-validation").trim(),
    password: requiredEnv(env, "LAF_SYNTHETIC_PASSWORD"),
    timeoutMs: intEnv(env, "LAF_SYNTHETIC_TIMEOUT_MS", 60000, 1000, 300000),
  };
}

function normalizeAPIBaseURL(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("missing LAF_SYNTHETIC_API_BASE_URL or LAF_OFFICE_PUBLIC_HOST");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/api";
  } else if (!url.pathname.endsWith("/api")) {
    url.pathname = `${url.pathname}/api`;
  }
  return url.toString().replace(/\/+$/, "");
}

function requiredEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function enumEnv(value, allowed) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`LAF_SYNTHETIC_APPROVAL_ACTION must be one of ${allowed.join(", ")}`);
  }
  return normalized;
}

function intEnv(env, name, defaultValue, min, max) {
  const raw = String(env[name] || "").trim();
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

async function runStartupOfficeSyntheticMonitor(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available");
  const client = createSyntheticClient(config, fetchImpl);
  const idempotencyKey = syntheticIdempotencyKey(config);
  const steps = [];
  const mark = (name, details = {}) => {
    steps.push({ details, name, ok: true });
  };

  await client.request("GET", "/health");
  mark("health");

  await client.request("POST", "/auth/login", {
    email: config.email,
    password: config.password,
  });
  mark("login");

  const session = await client.request("GET", "/auth/session");
  if (!session?.authenticated) throw new Error("synthetic login did not establish an authenticated session");
  mark("session", { team: Boolean(session.team), user: Boolean(session.user) });

  const summary = await client.request("GET", "/startup-office/growth-summary");
  assertArray(summary?.loops, "growth summary loops");
  if (!summary?.company_profile) throw new Error("growth summary is missing company profile");
  mark("profile", {
    loops: summary.loops.length,
    profile: Boolean(summary.company_profile),
  });

  const runResponse = await client.request(
    "POST",
    `/startup-office/loops/${encodeURIComponent(config.loopID)}/run`,
    {
      inputs: {
        synthetic_monitor: true,
        source: "startup-office-synthetic-monitor",
      },
      objective: "Synthetic monitor: verify deployed Startup Office loop path.",
    },
    {
      "Idempotency-Key": idempotencyKey,
    },
  );
  const run = runResponse?.run;
  if (!run?.id) throw new Error("synthetic loop run response is missing run.id");
  if (runResponse.status === "queued") {
    throw new Error("synthetic loop run stayed queued; live worker/model path was not exercised");
  }
  mark("run", { run_id: run.id, status: run.status });

  let approval = runResponse.approval;
  if (!approval?.id) {
    const approvals = await client.request("GET", "/startup-office/approvals?status=pending&limit=25");
    approval = (approvals?.approvals || []).find((row) => row.run_id === run.id);
  }
  if (!approval?.id) throw new Error("synthetic loop run did not create a pending approval");
  mark("approval", { approval_id: approval.id });

  if (config.approvalAction === "approve") {
    const decision = await client.request(
      "POST",
      `/startup-office/approvals/${encodeURIComponent(approval.id)}/approve`,
      { note: "Synthetic monitor approval for the dedicated beta smoke workspace." },
      {
        "Idempotency-Key": `${idempotencyKey}:approve`,
      },
    );
    if (!decision?.approval || decision.approval.status !== "approved") {
      throw new Error("synthetic approval did not reach approved status");
    }
    mark("approval_decision", { status: decision.approval.status });
  }

  const receipts = await client.request("GET", "/startup-office/receipts?limit=50");
  assertArray(receipts?.receipts, "receipts");
  const matchingReceipt = receipts.receipts.find((row) => row.run_id === run.id);
  if (!matchingReceipt) throw new Error("synthetic run receipt was not found");
  mark("receipt", { event_type: matchingReceipt.event_type, receipt_id: matchingReceipt.id });

  await client.request("POST", "/auth/logout", {});
  mark("logout");

  return {
    ok: true,
    run_id: run.id,
    steps,
  };
}

function createSyntheticClient(config, fetchImpl) {
  const cookies = new Map();

  async function request(method, path, body, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.apiBaseURL}${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
          ...(cookies.size ? { Cookie: cookieHeader(cookies) } : {}),
        },
        method,
        signal: controller.signal,
      });
      captureCookies(response.headers, cookies);
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(`${method} ${path} failed with ${response.status}: ${safeError(parsed)}`);
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { request };
}

function captureCookies(headers, cookies) {
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : splitSetCookieHeader(headers.get?.("set-cookie") || "");
  for (const value of values) {
    const [pair = ""] = String(value || "").split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return String(value).split(/,\s*(?=[^;,]+=)/);
}

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function safeError(payload) {
  const raw = String(payload?.error || payload?.message || "request failed");
  return raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function syntheticIdempotencyKey(config) {
  const timestamp = new Date().toISOString().replace(/[^0-9TZ]/g, "");
  return `synthetic:${config.loopID}:${timestamp}`;
}

async function main() {
  const result = await runStartupOfficeSyntheticMonitor(configFromEnv());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

module.exports = {
  configFromEnv,
  createSyntheticClient,
  normalizeAPIBaseURL,
  runStartupOfficeSyntheticMonitor,
};
