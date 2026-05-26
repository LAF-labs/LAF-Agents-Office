const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeRepositoryDelegates,
} = require("./repositoryDelegates");

test("repository delegates lazily forward calls to the active repository", async () => {
  const calls = [];
  let repositoryCalls = 0;
  const repository = {
    approvals: async (...args) => record(calls, "approvals", args),
    artifacts: async (...args) => record(calls, "artifacts", args),
    createReceipt: async (...args) => record(calls, "createReceipt", args),
    ensureLoop: async (...args) => record(calls, "ensureLoop", args),
    findApproval: async (...args) => record(calls, "findApproval", args),
    isMissingTableError: (...args) => record(calls, "isMissingTableError", args),
    loops: async (...args) => record(calls, "loops", args),
    receipts: async (...args) => record(calls, "receipts", args),
    runs: async (...args) => record(calls, "runs", args),
    safeRest: async (...args) => record(calls, "safeRest", args),
  };
  const delegates = createStartupOfficeRepositoryDelegates({
    startupOfficeRepository() {
      repositoryCalls += 1;
      return repository;
    },
  });

  assert.equal(repositoryCalls, 0);
  assert.deepEqual(await delegates.startupOfficeLoops("team-1", { limit: 5 }), { method: "loops" });
  assert.deepEqual(await delegates.startupOfficeRuns("team-1", { limit: 2 }), { method: "runs" });
  assert.deepEqual(await delegates.startupOfficeArtifacts("team-1", { kind: "doc" }), { method: "artifacts" });
  assert.deepEqual(await delegates.startupOfficeApprovals("team-1", { status: "pending" }), { method: "approvals" });
  assert.deepEqual(await delegates.startupOfficeReceipts("team-1", { limit: 3 }), { method: "receipts" });
  assert.deepEqual(await delegates.ensureStartupOfficeLoop({ team_id: "team-1" }, "loop-1"), { method: "ensureLoop" });
  assert.deepEqual(await delegates.findStartupOfficeApproval("team-1", "approval-1"), { method: "findApproval" });
  assert.deepEqual(await delegates.createStartupOfficeReceipt({ team_id: "team-1" }, { summary: "done" }), { method: "createReceipt" });
  assert.deepEqual(await delegates.safeStartupOfficeRest("startup_office_runs", { query: { limit: "1" } }), { method: "safeRest" });
  assert.deepEqual(delegates.isMissingStartupOfficeTableError({ status: 404 }, "startup_office_runs"), { method: "isMissingTableError" });
  assert.equal(repositoryCalls, 10);
  assert.deepEqual(calls, [
    ["loops", ["team-1", { limit: 5 }]],
    ["runs", ["team-1", { limit: 2 }]],
    ["artifacts", ["team-1", { kind: "doc" }]],
    ["approvals", ["team-1", { status: "pending" }]],
    ["receipts", ["team-1", { limit: 3 }]],
    ["ensureLoop", [{ team_id: "team-1" }, "loop-1"]],
    ["findApproval", ["team-1", "approval-1"]],
    ["createReceipt", [{ team_id: "team-1" }, { summary: "done" }]],
    ["safeRest", ["startup_office_runs", { query: { limit: "1" } }]],
    ["isMissingTableError", [{ status: 404 }, "startup_office_runs"]],
  ]);
});

function record(calls, method, args) {
  calls.push([method, args]);
  return { method };
}
