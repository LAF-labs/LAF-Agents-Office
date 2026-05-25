const dns = require("node:dns").promises;
const net = require("node:net");

function createBrowserResearchClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const lookupHost = options.lookupHost || defaultLookupHost;
  const nowISO = options.nowISO || (() => new Date().toISOString());
  const truncateText = options.truncateText || defaultTruncateText;
  const provider = normalizeProvider(
    options.provider ||
      env.LAF_OFFICE_BROWSER_RESEARCH_PROVIDER ||
      env.STARTUP_OFFICE_BROWSER_RESEARCH_PROVIDER ||
      "disabled",
  );
  const maxURLs = clampInt(
    options.maxURLs || env.LAF_OFFICE_BROWSER_RESEARCH_MAX_URLS,
    1,
    5,
    3,
  );
  const timeoutMs = clampInt(
    options.timeoutMs || env.LAF_OFFICE_BROWSER_RESEARCH_TIMEOUT_MS,
    1000,
    15000,
    8000,
  );
  const maxBytes = clampInt(
    options.maxBytes || env.LAF_OFFICE_BROWSER_RESEARCH_MAX_BYTES,
    20000,
    500000,
    160000,
  );

  async function research({ inputs = {}, loop = {} } = {}) {
    const requestedURLs = requestedResearchURLs(inputs).slice(0, maxURLs);
    const result = {
      enabled: provider !== "disabled",
      findings: [],
      loop_slug: loop?.slug || "",
      provider,
      skipped: [],
      sources: [],
    };
    if (provider === "disabled" || requestedURLs.length === 0) {
      if (requestedURLs.length) {
        result.skipped = requestedURLs.map((url) => ({
          reason: "browser research provider disabled",
          url,
        }));
      }
      return result;
    }
    if (provider !== "fetch") {
      result.skipped = requestedURLs.map((url) => ({
        reason: "unsupported browser research provider",
        url,
      }));
      return result;
    }
    if (typeof fetchImpl !== "function") {
      result.skipped = requestedURLs.map((url) => ({
        reason: "fetch unavailable",
        url,
      }));
      return result;
    }

    for (const url of requestedURLs) {
      const checked = await validateResearchURL(url, { lookupHost });
      if (!checked.ok) {
        result.skipped.push({ reason: checked.reason, url });
        continue;
      }
      const fetched = await fetchResearchURL(checked.url, {
        fetchImpl,
        maxBytes,
        nowISO,
        timeoutMs,
        truncateText,
      });
      if (fetched.error) {
        result.skipped.push({ reason: fetched.error, url: checked.url });
        continue;
      }
      result.findings.push(fetched.finding);
      result.sources.push(fetched.source);
    }
    return result;
  }

  return {
    enabled: provider !== "disabled",
    provider,
    research,
  };
}

function requestedResearchURLs(inputs = {}) {
  const out = [];
  for (const key of ["research_urls", "researchUrls", "urls"]) {
    for (const item of array(inputs[key])) pushURL(out, item);
  }
  for (const source of array(inputs.sources)) pushURL(out, source);
  return dedupe(out).slice(0, 10);
}

async function validateResearchURL(value, { lookupHost }) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "only https urls are allowed" };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentialed urls are not allowed" };
  }
  if (!parsed.hostname) return { ok: false, reason: "hostname is required" };
  const hostCheck = await assertPublicHost(parsed.hostname, { lookupHost });
  if (!hostCheck.ok) return hostCheck;
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}

async function assertPublicHost(hostname, { lookupHost }) {
  let addresses = [];
  try {
    addresses = await lookupHost(hostname);
  } catch {
    return { ok: false, reason: "hostname could not be resolved" };
  }
  const values = array(addresses)
    .map((item) => (typeof item === "string" ? item : item?.address))
    .filter(Boolean);
  if (!values.length) return { ok: false, reason: "hostname could not be resolved" };
  if (values.some(isPrivateAddress)) {
    return { ok: false, reason: "private network urls are not allowed" };
  }
  return { ok: true };
}

async function defaultLookupHost(hostname) {
  if (net.isIP(hostname)) return [{ address: hostname }];
  return dns.lookup(hostname, { all: true, verbatim: false });
}

function isPrivateAddress(address) {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (ipVersion === 6) {
    const raw = String(address || "").toLowerCase();
    return (
      raw === "::" ||
      raw === "::1" ||
      raw.startsWith("fc") ||
      raw.startsWith("fd") ||
      raw.startsWith("fe80:") ||
      raw.startsWith("::ffff:10.") ||
      raw.startsWith("::ffff:127.") ||
      raw.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

async function fetchResearchURL(url, {
  fetchImpl,
  maxBytes,
  nowISO,
  timeoutMs,
  truncateText,
}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "LAF-Startup-Office-Research/1.0",
      },
      method: "GET",
      redirect: "follow",
      signal: controller?.signal,
    });
    if (!response?.ok) return { error: `http ${response?.status || "error"}` };
    const raw = await response.text();
    const body = truncateText(raw, maxBytes);
    const title = truncateText(extractTitle(body) || url, 180);
    const description = truncateText(extractDescription(body), 500);
    const excerpt = truncateText(extractReadableText(body), 1200);
    const fetchedAt = nowISO();
    return {
      finding: {
        description,
        excerpt,
        fetched_at: fetchedAt,
        title,
        url,
      },
      source: {
        fetched_at: fetchedAt,
        label: title,
        type: "browser_research",
        url,
      },
    };
  } catch (err) {
    return { error: err?.name === "AbortError" ? "fetch timeout" : "fetch failed" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractTitle(html) {
  return decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
}

function extractDescription(html) {
  return decodeEntities(
    matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
      matchFirst(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i),
  );
}

function extractReadableText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function matchFirst(value, pattern) {
  const match = String(value || "").match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["disabled", "fetch"].includes(raw) ? raw : "disabled";
}

function pushURL(out, value) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    out.push(value.url || value.source_url || value.href || "");
  }
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.map((item) => String(item || "").trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function defaultTruncateText(value, max) {
  return String(value || "").slice(0, max);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  createBrowserResearchClient,
  isPrivateAddress,
  requestedResearchURLs,
  validateResearchURL,
};
