#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const handler = require(path.join(repoRoot, "api", "index.js"));
const port = Number(
  process.env.LAF_OFFICE_HOSTED_API_DEV_PORT || process.env.PORT || 30000,
);
const host = process.env.LAF_OFFICE_HOSTED_API_DEV_HOST || "127.0.0.1";

const server = http.createServer(async (req, res) => {
  const requestURL = new URL(req.url || "/", `http://${req.headers.host || host}`);
  if (requestURL.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (requestURL.pathname !== "/api" && !requestURL.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const apiPath = requestURL.pathname.replace(/^\/api\/?/, "");
  req.query = Object.fromEntries(requestURL.searchParams.entries());
  req.query.path = apiPath;
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };

  try {
    await handler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: "hosted API dev server error" }));
    }
    console.error("[laf-office:hosted-api-dev]", error);
  }
});

server.listen(port, host, () => {
  console.log(`LAF hosted API dev server listening on http://${host}:${port}/api`);
});
