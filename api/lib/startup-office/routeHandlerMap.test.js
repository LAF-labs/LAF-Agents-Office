const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeRouteHandlerMap,
} = require("./routeHandlerMap");

test("route handler map exposes every Startup Office route handler id", async () => {
  const calls = [];
  const handlerMap = createStartupOfficeRouteHandlerMap({
    assetUploadHandlers: handlers("assetUploadIntent", calls),
    customerCsvHandlers: handlers("customerCsv", calls),
    demoSeedHandlers: () => handlers("demoSeed", calls),
    importHandlers: handlers("memoryImport", calls),
    lifecycleHandlers: handlers("deletionPurge", calls, "deletionRequest", "supportAccess"),
    objectHandlers: handlers("artifactObjectAction", calls, "objectCollection", "objectItem"),
    operationsHandlers: handlers(
      "betaDashboard",
      calls,
      "billing",
      "policy",
      "supportTimeline",
      "workerJobAction",
    ),
    profileHandlers: () => handlers("companyProfile", calls),
    queryHandlers: handlers(
      "approvals",
      calls,
      "export",
      "growthSummary",
      "loops",
      "receipts",
    ),
    termsHandlers: handlers("terms", calls),
    workflowHandlers: handlers("approvalAction", calls, "loopRun", "run"),
  });

  assert.deepEqual(Object.keys(handlerMap).sort(), [
    "approvalAction",
    "approvals",
    "artifactObjectAction",
    "assetUploadIntent",
    "betaDashboard",
    "billing",
    "companyProfile",
    "customerCsv",
    "deletionPurge",
    "deletionRequest",
    "demoSeed",
    "export",
    "growthSummary",
    "loopRun",
    "loops",
    "memoryImport",
    "objectCollection",
    "objectItem",
    "policy",
    "receipts",
    "run",
    "supportAccess",
    "supportAccessAction",
    "supportTimeline",
    "terms",
    "workerJobAction",
  ]);
  assert.equal(Object.isFrozen(handlerMap), true);
  await handlerMap.companyProfile("req", "res");
  await handlerMap.demoSeed("req", "res");
  await handlerMap.supportAccessAction("req", "res");
  assert.deepEqual(calls, [
    ["companyProfile", ["req", "res"]],
    ["demoSeed", ["req", "res"]],
    ["supportAccess", ["req", "res"]],
  ]);
});

function handlers(firstName, calls, ...otherNames) {
  return Object.fromEntries([firstName, ...otherNames].map((name) => [
    name,
    async (...args) => {
      calls.push([name, args]);
    },
  ]));
}
