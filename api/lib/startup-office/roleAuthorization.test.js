const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedPermissionGuards,
} = require("../hosted/permissions");
const {
  authorizeStartupOfficeAccess,
  routeAccessForMethod,
} = require("./authorization");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("./routes");

class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createHTTPError(status, message) {
  return new HTTPError(status, message);
}

const READ_KEYS = Object.freeze([
  "approvals.GET",
  "billing.GET",
  "companyProfile.GET",
  "export.GET",
  "growthSummary.GET",
  "loops.GET",
  "objectCollection.GET",
  "policy.GET",
  "receipts.GET",
  "run.GET",
]);

const DRAFT_KEYS = Object.freeze([
  "artifactObjectAction.POST",
  "assetUploadIntent.POST",
  "loopRun.POST",
  "objectCollection.POST",
  "objectItem.DELETE",
  "objectItem.PATCH",
  "run.POST",
]);

const MANAGER_KEYS = Object.freeze([
  ...READ_KEYS,
  ...DRAFT_KEYS,
  "approvalAction.POST",
]);

const ADMIN_KEYS = Object.freeze([
  ...MANAGER_KEYS,
  "betaDashboard.GET",
  "billing.PATCH",
  "companyProfile.PATCH",
  "deletionRequest.GET",
  "deletionRequest.POST",
  "demoSeed.POST",
  "loops.POST",
  "policy.PATCH",
  "supportAccess.GET",
  "supportAccess.POST",
  "supportAccessAction.POST",
  "supportTimeline.GET",
  "workerJobAction.POST",
]);

const EXPECTED_ALLOWED_BY_ROLE = Object.freeze({
  admin: ADMIN_KEYS,
  manager: MANAGER_KEYS,
  member: [...READ_KEYS, ...DRAFT_KEYS],
  owner: ADMIN_KEYS,
  viewer: READ_KEYS,
});

test("Startup Office route authorization matches role capability matrix", async () => {
  const routeKeys = startupOfficeRouteKeys();
  assert.deepEqual(routeKeys, [...ADMIN_KEYS].sort());

  for (const role of ["viewer", "member", "manager", "admin", "owner"]) {
    const allowed = [];
    const denied = [];
    for (const contract of STARTUP_OFFICE_ROUTE_CONTRACTS) {
      for (const method of contract.methods) {
        const result = await authorizeRole({ contract, method, role });
        const key = routeKey(contract, method);
        if (result.status === 200) allowed.push(key);
        else denied.push([key, result.status]);
      }
    }

    assert.deepEqual(allowed.sort(), [...EXPECTED_ALLOWED_BY_ROLE[role]].sort(), role);
    assert.deepEqual(
      denied.map((entry) => entry[1]),
      denied.map(() => 403),
      `${role} denials must be typed 403 responses`,
    );
  }
});

test("Startup Office role ladder preserves founder-control boundaries", async () => {
  await assertRole("viewer", "growthSummary", "GET", 200);
  await assertRole("viewer", "loopRun", "POST", 403);
  await assertRole("member", "loopRun", "POST", 200);
  await assertRole("member", "approvalAction", "POST", 403);
  await assertRole("manager", "approvalAction", "POST", 200);
  await assertRole("manager", "policy", "PATCH", 403);
  await assertRole("admin", "policy", "PATCH", 200);
  await assertRole("admin", "workerJobAction", "POST", 200);
  await assertRole("owner", "demoSeed", "POST", 200);
});

async function assertRole(role, routeID, method, expectedStatus) {
  const contract = STARTUP_OFFICE_ROUTE_CONTRACTS.find(
    (entry) => entry.id === routeID,
  );
  assert.ok(contract, `missing route ${routeID}`);
  const result = await authorizeRole({ contract, method, role });
  assert.equal(result.status, expectedStatus, `${role} ${routeID}.${method}`);
}

async function authorizeRole({ contract, method, role }) {
  const guards = createHostedPermissionGuards({ createHTTPError });
  try {
    await authorizeStartupOfficeAccess({
      access: routeAccessForMethod(contract, method),
      req: { routeID: contract.id },
      requireAdminRole: guards.requireAdminRole,
      requirePermission: guards.requirePermission,
      async requireUser() {
        return {
          membership: {
            permissions: {},
            role,
            status: "active",
            team_id: "team-1",
            user_id: `${role}-user`,
          },
        };
      },
    });
    return { status: 200 };
  } catch (err) {
    return { error: err.message, status: err.status || 500 };
  }
}

function startupOfficeRouteKeys() {
  return STARTUP_OFFICE_ROUTE_CONTRACTS.flatMap((contract) =>
    contract.methods.map((method) => routeKey(contract, method)),
  ).sort();
}

function routeKey(contract, method) {
  return `${contract.id}.${method}`;
}
