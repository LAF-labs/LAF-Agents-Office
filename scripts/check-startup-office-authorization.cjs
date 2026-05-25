#!/usr/bin/env node

const assert = require("node:assert/strict");
const permissionCatalog = require("../shared/workspace-permissions.json");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("../api/lib/startup-office/routes");
const {
  STARTUP_OFFICE_ROUTE_ACCESS,
  routeAccessForMethod,
} = require("../api/lib/startup-office/authorization");

const permissions = new Set(permissionCatalog.permissions);
const expectedAccess = {
  approvalAction: { POST: { permission: "memory:promote", type: "permission" } },
  approvals: { GET: { permission: "workspace:read", type: "permission" } },
  artifactObjectAction: { POST: { permission: "memory:write_draft", type: "permission" } },
  betaDashboard: { GET: { type: "admin" } },
  billing: {
    GET: { permission: "workspace:read", type: "permission" },
    PATCH: { type: "admin" },
  },
  companyProfile: {
    GET: { permission: "workspace:read", type: "permission" },
    PATCH: { permission: "workspace:manage", type: "permission" },
  },
  demoSeed: { POST: { type: "admin" } },
  export: { GET: { permission: "workspace:read", type: "permission" } },
  growthSummary: { GET: { permission: "workspace:read", type: "permission" } },
  loopRun: { POST: { permission: "memory:write_draft", type: "permission" } },
  loops: {
    GET: { permission: "workspace:read", type: "permission" },
    POST: { permission: "workspace:manage", type: "permission" },
  },
  objectCollection: {
    GET: { permission: "workspace:read", type: "permission" },
    POST: { permission: "memory:write_draft", type: "permission" },
  },
  objectItem: {
    DELETE: { permission: "memory:write_draft", type: "permission" },
    PATCH: { permission: "memory:write_draft", type: "permission" },
  },
  policy: {
    GET: { permission: "workspace:read", type: "permission" },
    PATCH: { permission: "workspace:manage", type: "permission" },
  },
  receipts: { GET: { permission: "workspace:read", type: "permission" } },
  run: {
    GET: { permission: "workspace:read", type: "permission" },
    POST: { permission: "memory:write_draft", type: "permission" },
  },
  workerJobAction: { POST: { type: "admin" } },
};

function fail(message) {
  console.error(`startup-office authorization check failed: ${message}`);
  process.exit(1);
}

const contractIDs = STARTUP_OFFICE_ROUTE_CONTRACTS.map((contract) => contract.id);
assert.deepEqual(contractIDs.sort(), Object.keys(expectedAccess).sort());

for (const contract of STARTUP_OFFICE_ROUTE_CONTRACTS) {
  const expected = expectedAccess[contract.id];
  const methods = [...contract.methods].sort();
  const accessMethods = Object.keys(STARTUP_OFFICE_ROUTE_ACCESS[contract.id] || {}).sort();
  assert.deepEqual(accessMethods, methods);
  assert.deepEqual(Object.keys(expected).sort(), methods);

  for (const method of methods) {
    const access = routeAccessForMethod(contract, method);
    const expectedEntry = expected[method];
    if (!access) fail(`${contract.id}.${method} is missing authorization`);
    if (access.type !== expectedEntry.type) {
      fail(`${contract.id}.${method} expected ${expectedEntry.type}, got ${access.type}`);
    }
    if (access.type === "permission") {
      if (!permissions.has(access.permission)) {
        fail(`${contract.id}.${method} uses unknown permission ${access.permission}`);
      }
      if (access.permission !== expectedEntry.permission) {
        fail(
          `${contract.id}.${method} expected ${expectedEntry.permission}, got ${access.permission}`,
        );
      }
      if (["POST", "PATCH", "DELETE"].includes(method) && access.permission === "workspace:read") {
        fail(`${contract.id}.${method} mutates state with read-only access`);
      }
    } else if (access.type === "admin") {
      if (!access.reason) fail(`${contract.id}.${method} admin access must explain why`);
    } else {
      fail(`${contract.id}.${method} has unsupported access type ${access.type}`);
    }
  }
}

console.log(
  `startup-office authorization check passed: ${STARTUP_OFFICE_ROUTE_CONTRACTS.length} routes`,
);
