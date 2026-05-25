const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyStartupOfficeCursor,
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");

test("startup office page request normalizes limit and ISO cursor", () => {
  const page = startupOfficePageRequest({
    cursor: "2026-05-25T00:00:00Z",
    limit: "250",
  });

  assert.deepEqual(page, {
    cursor: "2026-05-25T00:00:00Z",
    limit: 100,
    request_limit: 101,
  });
});

test("startup office page result returns one fewer item than fetched", () => {
  const page = startupOfficePageRequest({ limit: "2" });
  const result = startupOfficePageResult(
    [
      { created_at: "2026-05-25T03:00:00.000Z", id: "r3" },
      { created_at: "2026-05-25T02:00:00.000Z", id: "r2" },
      { created_at: "2026-05-25T01:00:00.000Z", id: "r1" },
    ],
    page,
  );

  assert.deepEqual(result.items.map((row) => row.id), ["r3", "r2"]);
  assert.deepEqual(result.pagination, {
    cursor: null,
    has_more: true,
    limit: 2,
    next_cursor: "2026-05-25T02:00:00.000Z",
  });
});

test("startup office cursor applies a descending created-at filter", () => {
  const query = {};
  applyStartupOfficeCursor(query, "2026-05-25T00:00:00.000Z");
  assert.deepEqual(query, {
    created_at: "lt.2026-05-25T00:00:00.000Z",
  });
});

test("startup office cursor rejects non-date cursors", () => {
  assert.throws(
    () =>
      startupOfficePageRequest(
        { cursor: "not-a-date" },
        {
          createHTTPError(status, message) {
            const err = new Error(message);
            err.status = status;
            return err;
          },
        },
      ),
    (err) => err.status === 400 && err.message === "cursor must be an ISO timestamp",
  );
});
