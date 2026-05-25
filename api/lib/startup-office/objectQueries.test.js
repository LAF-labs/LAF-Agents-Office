const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS,
  applyStartupOfficeObjectListQuery,
  startupOfficeObjectListOptions,
} = require("./objectQueries");

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("object query contracts define filters and sorts for every operating object", () => {
  assert.deepEqual(Object.keys(STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS).sort(), [
    "assets",
    "customers",
    "metrics",
    "signals",
  ]);
  for (const contract of Object.values(STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS)) {
    assert.equal(contract.sorts.includes("created_at.desc"), true);
    assert.equal(Object.keys(contract.filters).length > 0, true);
  }
});

test("object list options normalize aliases, pagination, and whitelisted sort", () => {
  assert.deepEqual(
    startupOfficeObjectListOptions(
      "signals",
      {
        cursor: "2026-05-25T00:00:00Z",
        discovery_loop_id: "loop-1",
        limit: "2",
        order: "title.desc",
        type: "customer",
      },
      { createHTTPError, page: { cursor: "2026-05-25T00:00:00Z", request_limit: 3 } },
    ),
    {
      cursor: "2026-05-25T00:00:00Z",
      limit: 3,
      loop_id: "loop-1",
      order: "title.desc",
      signal_type: "customer",
    },
  );
});

test("object query contract rejects unsupported sort fields", () => {
  assert.throws(
    () => startupOfficeObjectListOptions("customers", { sort: "email.asc" }, { createHTTPError }),
    (err) => err.status === 400 && err.message.includes("sort must be one of"),
  );
});

test("object query contract applies filters and sort to REST query", () => {
  const query = { select: "*", team_id: "eq.team-1" };

  applyStartupOfficeObjectListQuery(query, "customers", {
    loop_id: "loop-1",
    order: "name.asc",
    status: "qualified",
  });

  assert.deepEqual(query, {
    loop_id: "eq.loop-1",
    order: "name.asc",
    select: "*",
    status: "eq.qualified",
    team_id: "eq.team-1",
  });
});
