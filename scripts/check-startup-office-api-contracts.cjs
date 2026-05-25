#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("../api/lib/startup-office/routes");

const root = path.resolve(__dirname, "..");
const clientPath = path.join(root, "web", "src", "api", "startupOffice.ts");
const clientSource = fs.readFileSync(clientPath, "utf8");

function fail(message) {
  console.error(`startup-office api contract check failed: ${message}`);
  process.exit(1);
}

function methodHelper(method) {
  if (method === "GET") return "get";
  if (method === "POST") return "post";
  if (method === "PATCH") return "patchJSON";
  fail(`unsupported client contract method ${method}`);
}

function exportedFunctionBody(functionName) {
  const startNeedle = `export function ${functionName}`;
  const start = clientSource.indexOf(startNeedle);
  if (start < 0) return "";
  const next = clientSource.indexOf("\nexport function ", start + startNeedle.length);
  return clientSource.slice(start, next < 0 ? clientSource.length : next);
}

const contracts = STARTUP_OFFICE_ROUTE_CONTRACTS.flatMap((route) =>
  (route.client || []).map((client) => ({ ...client, routeID: route.id, routeMethods: route.methods })),
);

if (contracts.length === 0) {
  fail("no route client contracts are declared");
}

const contractNames = new Set();
for (const contract of contracts) {
  if (contractNames.has(contract.functionName)) {
    fail(`duplicate client contract for ${contract.functionName}`);
  }
  contractNames.add(contract.functionName);
  if (!contract.routeMethods.includes(contract.method)) {
    fail(`${contract.functionName} declares ${contract.method}, but route ${contract.routeID} only allows ${contract.routeMethods.join(", ")}`);
  }
  const body = exportedFunctionBody(contract.functionName);
  if (!body) fail(`missing web client function ${contract.functionName}`);
  const helper = methodHelper(contract.method);
  if (!body.includes(`${helper}<${contract.responseType}>`)) {
    fail(`${contract.functionName} must call ${helper}<${contract.responseType}>`);
  }
  for (const snippet of contract.pathIncludes) {
    if (!body.includes(snippet)) {
      fail(`${contract.functionName} does not contain path snippet ${snippet}`);
    }
  }
}

const exportedNames = [...clientSource.matchAll(/^export function (getStartupOffice\w+|runStartupOffice\w+|retryStartupOffice\w+|cancelStartupOffice\w+|approveStartupOffice\w+|rejectStartupOffice\w+|reviseStartupOffice\w+|updateStartupOffice\w+)/gm)]
  .map((match) => match[1]);

for (const name of exportedNames) {
  if (!contractNames.has(name)) {
    fail(`web client function ${name} is missing a route contract`);
  }
}

console.log(`startup-office api contract check passed: ${contracts.length} client contracts`);
