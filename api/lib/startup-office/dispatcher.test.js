const assert = require("node:assert/strict");
const test = require("node:test");

const {
  dispatchStartupOfficeRoute,
  matchStartupOfficeRoute,
} = require("./dispatcher");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("./routes");
const {
  STARTUP_OFFICE_ROUTE_ACCESS,
  routeAccessForMethod,
} = require("./authorization");

test("Startup Office route contracts are stable and uniquely named", () => {
  const ids = STARTUP_OFFICE_ROUTE_CONTRACTS.map((contract) => contract.id);
  assert.deepEqual(ids, [
    "companyProfile",
    "demoSeed",
    "growthSummary",
    "policy",
    "billing",
    "betaDashboard",
    "workerJobAction",
    "loops",
    "loopRun",
    "run",
    "approvals",
    "approvalAction",
    "receipts",
    "objectCollection",
    "objectItem",
    "artifactObjectAction",
    "export",
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("Startup Office route matcher decodes path params and aliases", () => {
  assert.equal(matchStartupOfficeRoute("loops", "GET")?.id, "loops");
  assert.equal(
    matchStartupOfficeRoute("startup-office/loops", "POST")?.id,
    "loops",
  );
  assert.deepEqual(
    matchStartupOfficeRoute("startup-office/loops/idea%20validation/run", "POST")
      ?.args,
    ["idea validation"],
  );
  assert.deepEqual(
    matchStartupOfficeRoute("startup-office/runs/run-1/retry", "POST")?.args,
    ["run-1", "retry"],
  );
  assert.deepEqual(
    matchStartupOfficeRoute(
      "startup-office/admin/worker-jobs/job%2F1/retry",
      "POST",
    )?.args,
    ["job/1", "retry"],
  );
  assert.deepEqual(
    matchStartupOfficeRoute(
      "startup-office/approvals/approval-1/revise",
      "POST",
    )?.args,
    ["approval-1", "revise"],
  );
  assert.deepEqual(
    matchStartupOfficeRoute("startup-office/assets/asset%2F1", "PATCH")?.args,
    ["assets", "asset/1"],
  );
});

test("Startup Office route matcher returns declared authorization", () => {
  assert.deepEqual(
    matchStartupOfficeRoute("startup-office/growth-summary", "GET")?.access,
    { permission: "workspace:read", type: "permission" },
  );
  assert.deepEqual(
    matchStartupOfficeRoute("startup-office/approvals/approval-1/approve", "POST")
      ?.access,
    { permission: "memory:promote", type: "permission" },
  );
  assert.equal(
    matchStartupOfficeRoute("startup-office/admin/beta-dashboard", "GET")?.access
      .type,
    "admin",
  );
});

test("Startup Office route contracts declare access for every method", () => {
  for (const contract of STARTUP_OFFICE_ROUTE_CONTRACTS) {
    assert.deepEqual(
      Object.keys(STARTUP_OFFICE_ROUTE_ACCESS[contract.id] || {}).sort(),
      [...contract.methods].sort(),
    );
    for (const method of contract.methods) {
      assert.ok(routeAccessForMethod(contract, method), `${contract.id}.${method}`);
    }
  }
});

test("Startup Office route matcher rejects wrong methods and unknown paths", () => {
  assert.equal(matchStartupOfficeRoute("startup-office/growth-summary", "POST"), null);
  assert.equal(matchStartupOfficeRoute("startup-office/nope", "GET"), null);
});

test("Startup Office dispatcher calls only the matched domain handler", async () => {
  const calls = [];
  const handled = await dispatchStartupOfficeRoute({
    authorize: async (access, _req, route) =>
      calls.push(["authorize", route.id, access.permission || access.type]),
    handlers: {
      loopRun: async (_req, _res, loopID) => calls.push(["loopRun", loopID]),
    },
    path: "startup-office/loops/customer-discovery/run",
    req: { method: "POST" },
    res: {},
  });
  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["authorize", "loopRun", "memory:write_draft"],
    ["loopRun", "customer-discovery"],
  ]);
});

test("Startup Office dispatcher requires authorization before handlers", async () => {
  await assert.rejects(
    () =>
      dispatchStartupOfficeRoute({
        handlers: {
          loopRun: async () => {},
        },
        path: "startup-office/loops/customer-discovery/run",
        req: { method: "POST" },
        res: {},
      }),
    /startup office authorizer missing: loopRun/,
  );
});

test("Startup Office dispatcher leaves non-domain routes to the hosted facade", async () => {
  const handled = await dispatchStartupOfficeRoute({
    handlers: {},
    path: "messages",
    req: { method: "GET" },
    res: {},
  });
  assert.equal(handled, false);
});
